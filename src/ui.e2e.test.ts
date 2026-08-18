import { expect, test } from "@playwright/test";

/**
 * Real-browser (Chromium) coverage for what happy-dom cannot model: the
 * colocated `*.dom.test.ts` suites have no `ElementInternals`, no Popover top
 * layer, and no real focus, layout, or pointer input. The specs below exercise
 * form-associated submission, top-layer popups and their exit transitions,
 * roving focus and keyboard selection, pointer gestures (drawer swipe, slider
 * and scrub drags, scroll-area thumb), and combobox virtualization over a
 * 10,000-item list under a real layout engine.
 *
 * `vp dev` serves the library as a source module, so each test `import()`s it
 * into `index.html`, a blank mount host. Playwright starts that dev server via
 * the `webServer` block in `playwright.config.ts`.
 */

const UI_MODULE = "/src/elements.ts"; // register-all entry

type ComboboxEl = Element & { counts: { total: number; domRows: number } };
type OtpEl = Element & { value: string };

/** Navigate to a served page and mount arbitrary UI markup after importing the library. */
async function mount(page: import("@playwright/test").Page, markup: string) {
  await page.goto("/");
  await page.evaluate(
    async ({ mod, html }) => {
      await import(/* @vite-ignore */ mod);
      document.body.innerHTML = html;
      // Flush the components' deferred (microtask) wiring, then a frame for layout.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    },
    { mod: UI_MODULE, html: markup },
  );
}

const activeId = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement.id : "",
  );

test.describe("ui — real browser", () => {
  test("form-associated controls submit their values", async ({ page }) => {
    await mount(
      page,
      `<form id="f">
        <ui-switch><input type="checkbox" name="notify" checked /></ui-switch>
        <ui-checkbox><input type="checkbox" name="tos" value="agreed" checked /></ui-checkbox>
        <ui-radio-group name="plan" value="pro">
          <ui-radio value="free">Free</ui-radio>
          <ui-radio value="pro">Pro</ui-radio>
        </ui-radio-group>
        <ui-number-field name="qty" value="3" min="0" max="10"><input data-number-input /></ui-number-field>
        <ui-slider name="vol" value="40" min="0" max="100">
          <ui-slider-track><ui-slider-thumb></ui-slider-thumb></ui-slider-track>
        </ui-slider>
        <ui-select name="fruit">
          <button data-select-trigger><span data-select-value>Choose</span></button>
          <ui-select-popup>
            <ui-select-option value="apple" selected>Apple</ui-select-option>
            <ui-select-option value="banana">Banana</ui-select-option>
          </ui-select-popup>
        </ui-select>
        <ui-otp-field name="code" length="4"></ui-otp-field>
        <button type="submit" id="submit">Submit</button>
      </form>
      <pre id="result"></pre>`,
    );

    // Fill the OTP via its property setter, then capture the submitted FormData.
    await page.evaluate(() => {
      const otp = document.querySelector("ui-otp-field") as OtpEl | null;
      if (otp) otp.value = "1234";
      const form = document.querySelector<HTMLFormElement>("#f");
      form?.addEventListener("submit", (e) => {
        e.preventDefault();
        const data = new FormData(e.target as HTMLFormElement);
        const sink = document.querySelector<HTMLElement>("#result");
        if (sink) sink.textContent = JSON.stringify([...data.entries()]);
      });
    });

    await page.locator("#submit").click();
    const raw = (await page.locator("#result").textContent()) ?? "[]";
    const submitted = Object.fromEntries(JSON.parse(raw) as [string, string][]);

    expect(submitted).toMatchObject({
      notify: "on", // ui-switch
      tos: "agreed", // ui-checkbox
      plan: "pro", // ui-radio-group
      qty: "3", // ui-number-field
      vol: "40", // ui-slider
      fruit: "apple", // ui-select (preselected option)
      code: "1234", // ui-otp-field
    });
  });

  test("dialog opens in the top layer with scroll lock and a focus trap", async ({ page }) => {
    await mount(
      page,
      `<button id="before">before</button>
      <ui-dialog>
        <button data-dialog-trigger id="open">Open</button>
        <ui-dialog-popup>
          <h2 data-dialog-title>Confirm</h2>
          <button id="ok">OK</button>
          <button id="cancel">Cancel</button>
        </ui-dialog-popup>
      </ui-dialog>`,
    );

    const popup = page.locator("ui-dialog-popup");
    await page.locator("#open").click();

    await expect(popup).toBeVisible(); // real Popover top layer
    await expect(popup).toHaveAttribute("aria-modal", "true");
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden"); // scroll lock
    expect(await activeId(page)).toBe("ok"); // focus moved into the dialog

    // Tab cycles within the dialog and never escapes to `#before`.
    await page.keyboard.press("Tab");
    expect(await activeId(page)).toBe("cancel");
    await page.keyboard.press("Tab");
    expect(["ok", "cancel"]).toContain(await activeId(page)); // wrapped, still trapped

    await page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe(""); // unlocked
    expect(await activeId(page)).toBe("open"); // focus restored to the trigger
  });

  test("menu opens in the top layer and selects with the keyboard", async ({ page }) => {
    await mount(
      page,
      `<ui-menu>
        <button data-menu-trigger id="trigger">Options</button>
        <ui-menu-popup>
          <ui-menu-item value="edit">Edit</ui-menu-item>
          <ui-menu-item value="delete">Delete</ui-menu-item>
        </ui-menu-popup>
      </ui-menu>
      <pre id="sel"></pre>`,
    );
    await page.evaluate(() => {
      document.querySelector("ui-menu")?.addEventListener("menu-select", (e) => {
        const sink = document.querySelector<HTMLElement>("#sel");
        if (sink) sink.textContent = (e as CustomEvent<{ value: string }>).detail.value;
      });
    });

    const popup = page.locator("ui-menu-popup");
    await page.locator("#trigger").click();
    await expect(popup).toBeVisible();

    await page.keyboard.press("ArrowDown"); // Edit → Delete
    await page.keyboard.press("Enter");
    await expect(popup).toBeHidden();
    await expect(page.locator("#sel")).toHaveText("delete");
    expect(await activeId(page)).toBe("trigger"); // focus returned to trigger
  });

  test("combobox virtualizes 10,000 options with a fixed DOM-row pool", async ({ page }) => {
    await mount(
      page,
      `<style>
        ui-combobox-popup { position: fixed; top: 40px; left: 8px; width: 20rem; padding: .3rem; }
        ui-combobox-popup:not([data-open]) { display: none; }
        ui-combobox-viewport { display: block; position: relative; height: 320px; overflow-y: auto; }
        ui-combobox-spacer { display: block; position: relative; width: 100%; }
        .cb-row { position: absolute; left: 0; right: 0; height: 36px; box-sizing: border-box; }
      </style>
      <ui-combobox name="assignee">
        <input data-combobox-input id="cb" placeholder="Search" />
        <ui-combobox-popup>
          <ui-combobox-viewport><ui-combobox-spacer></ui-combobox-spacer></ui-combobox-viewport>
          <ui-combobox-empty hidden>No matches.</ui-combobox-empty>
        </ui-combobox-popup>
      </ui-combobox>`,
    );

    await page.evaluate(() => {
      const cb = document.querySelector("ui-combobox") as (Element & { items: unknown }) | null;
      if (cb)
        cb.items = Array.from({ length: 10000 }, (_, i) => ({
          value: `u${i}`,
          label: `Person ${i}`,
        }));
    });

    await page.locator("#cb").click(); // open (browse mode)
    await expect(page.locator("ui-combobox-popup")).toBeVisible();

    // The pool is a fixed handful of rows even though the store holds 10,000.
    const { total, domRows, live } = await page.evaluate(() => {
      const cb = document.querySelector("ui-combobox") as ComboboxEl;
      return {
        total: cb.counts.total,
        domRows: cb.counts.domRows,
        live: document.querySelectorAll(".cb-row").length,
      };
    });
    expect(total).toBe(10000);
    expect(live).toBe(domRows);
    expect(domRows).toBeLessThan(40); // windowed, not 10,000 nodes

    const firstBefore = await page.locator(".cb-row:not([hidden])").first().textContent();
    expect(firstBefore).toBe("Person 0");

    // Scroll deep into the list: the window re-projects onto the SAME pool.
    await page.evaluate(() => {
      const vp = document.querySelector("ui-combobox-viewport");
      if (vp) {
        vp.scrollTop = 36 * 5000;
        vp.dispatchEvent(new Event("scroll"));
      }
    });

    expect(await page.locator(".cb-row").count()).toBe(domRows); // pool unchanged
    const midText = await page.locator(".cb-row:not([hidden])").first().textContent();
    expect(midText).toMatch(/Person 49\d\d|Person 50\d\d/); // window moved to ~row 5000
  });
});

test.describe("ui — menu family (real browser)", () => {
  test("context menu opens at the pointer position", async ({ page }) => {
    await mount(
      page,
      `<style>ui-menu-popup { position: fixed; inset: auto; margin: 0; }</style>
      <ui-context-menu>
        <div data-context-target id="target" style="width:240px;height:120px;background:#eee">Right-click</div>
        <ui-menu>
          <ui-menu-popup>
            <ui-menu-item value="cut">Cut</ui-menu-item>
            <ui-menu-item value="copy">Copy</ui-menu-item>
          </ui-menu-popup>
        </ui-menu>
      </ui-context-menu>`,
    );

    const target = page.locator("#target");
    const targetBox = (await target.boundingBox())!;
    await target.click({ button: "right", position: { x: 30, y: 20 } });

    const popup = page.locator("ui-menu-popup");
    await expect(popup).toBeVisible();
    const popupBox = (await popup.boundingBox())!;
    // The popup's top-left tracks the click point (target origin + local offset).
    expect(Math.abs(popupBox.x - (targetBox.x + 30))).toBeLessThan(24);
    expect(Math.abs(popupBox.y - (targetBox.y + 20))).toBeLessThan(24);
  });

  test("submenu opens to the side on hover and selects a nested item", async ({ page }) => {
    await mount(
      page,
      `<style>ui-menu-popup { position: fixed; inset: auto; margin: 0; }</style>
      <ui-menu>
        <button data-menu-trigger id="root">Options</button>
        <ui-menu-popup>
          <ui-menu-item value="edit">Edit</ui-menu-item>
          <ui-menu submenu>
            <ui-menu-item data-menu-trigger id="more">More ▶</ui-menu-item>
            <ui-menu-popup>
              <ui-menu-item value="align-left">Align left</ui-menu-item>
              <ui-menu-item value="align-right">Align right</ui-menu-item>
            </ui-menu-popup>
          </ui-menu>
        </ui-menu-popup>
      </ui-menu>
      <pre id="sel"></pre>`,
    );
    await page.evaluate(() => {
      document.querySelector("ui-menu")?.addEventListener("menu-select", (e) => {
        const sink = document.querySelector<HTMLElement>("#sel");
        if (sink) sink.textContent = (e as CustomEvent<{ value: string }>).detail.value;
      });
    });

    await page.locator("#root").click();
    await page.locator("#more").hover(); // pointerenter opens the submenu

    const subPopup = page.locator("ui-menu-popup").nth(1);
    await expect(subPopup).toBeVisible();
    const moreBox = (await page.locator("#more").boundingBox())!;
    const subBox = (await subPopup.boundingBox())!;
    expect(subBox.x).toBeGreaterThanOrEqual(moreBox.x + moreBox.width - 8); // placed to the right

    await page.locator("ui-menu-item", { hasText: "Align right" }).click();
    await expect(page.locator("#sel")).toHaveText("align-right");
    await expect(page.locator("ui-menu-popup").first()).toBeHidden(); // whole chain closed
  });

  test("menubar crosses to and opens the sibling menu", async ({ page }) => {
    await mount(
      page,
      `<ui-menubar>
        <ui-menu>
          <button data-menu-trigger id="file">File</button>
          <ui-menu-popup><ui-menu-item value="new">New</ui-menu-item></ui-menu-popup>
        </ui-menu>
        <ui-menu>
          <button data-menu-trigger id="edit">Edit</button>
          <ui-menu-popup><ui-menu-item value="undo">Undo</ui-menu-item></ui-menu-popup>
        </ui-menu>
      </ui-menubar>`,
    );

    const filePopup = page.locator("ui-menu").nth(0).locator("ui-menu-popup");
    const editPopup = page.locator("ui-menu").nth(1).locator("ui-menu-popup");

    await page.locator("#file").click();
    await expect(filePopup).toBeVisible();

    await page.keyboard.press("ArrowRight"); // cross to Edit, opening it
    await expect(filePopup).toBeHidden();
    await expect(editPopup).toBeVisible();
  });
});

test.describe("ui — layout & gestures (real browser)", () => {
  test("drawer swipes to dismiss past the threshold, snaps back below it", async ({ page }) => {
    await mount(
      page,
      `<style>
        ui-drawer-popup { position: fixed; inset: 0 0 0 auto; margin: 0; width: 300px; background: #fff; }
        ui-drawer-popup:not([data-open]) { display: none; }
        #handle { height: 40px; touch-action: none; }
      </style>
      <ui-drawer side="right">
        <button data-drawer-trigger id="open">Open</button>
        <ui-drawer-popup>
          <button data-drawer-handle id="handle">grip</button>
          <button id="inside">Action</button>
        </ui-drawer-popup>
      </ui-drawer>`,
    );

    const popup = page.locator("ui-drawer-popup");
    const drag = async (dx: number) => {
      const box = (await page.locator("#handle").boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 5 });
      await page.mouse.up();
    };

    await page.locator("#open").click();
    await expect(popup).toBeVisible();

    // A small pull (< 40% of 300px) snaps back — still open.
    await drag(60);
    await expect(popup).toBeVisible();

    // A big pull toward the right edge dismisses it.
    await drag(200);
    await expect(popup).toBeHidden();
  });

  test("scroll area sizes the thumb and drags to scroll", async ({ page }) => {
    await mount(
      page,
      `<style>
        ui-scroll-area { display: block; position: relative; width: 300px; }
        ui-scroll-viewport { display: block; height: 150px; overflow: auto; scrollbar-width: none; }
        ui-scroll-scrollbar { position: absolute; top: 0; right: 0; width: 10px; height: 150px; background: #eee; }
        ui-scroll-thumb { display: block; width: 100%; background: #888; }
      </style>
      <ui-scroll-area>
        <ui-scroll-viewport><div style="height: 1000px">tall content</div></ui-scroll-viewport>
        <ui-scroll-scrollbar data-orientation="vertical"><ui-scroll-thumb id="thumb"></ui-scroll-thumb></ui-scroll-scrollbar>
      </ui-scroll-area>`,
    );

    const area = page.locator("ui-scroll-area");
    await expect(area).toHaveAttribute("data-overflow-y", "");

    // Thumb is proportional: ~150/1000 of the 150px track.
    const thumbH = await page.locator("#thumb").evaluate((el) => el.getBoundingClientRect().height);
    expect(thumbH).toBeGreaterThan(10);
    expect(thumbH).toBeLessThan(60);

    // Scrolling the viewport moves the thumb down.
    const readY = () =>
      page
        .locator("#thumb")
        .evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42);
    const y0 = await readY();
    await page.locator("ui-scroll-viewport").evaluate((vp) => {
      vp.scrollTop = 500;
    });
    await expect.poll(readY).toBeGreaterThan(y0);

    // Dragging the thumb scrolls the viewport.
    const before = await page.locator("ui-scroll-viewport").evaluate((vp) => vp.scrollTop);
    const box = (await page.locator("#thumb").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, { steps: 5 });
    await page.mouse.up();
    const after = await page.locator("ui-scroll-viewport").evaluate((vp) => vp.scrollTop);
    expect(after).toBeGreaterThan(before);
  });

  test("a CSS exit transition keeps the popup in the top layer until it finishes", async ({
    page,
  }) => {
    await mount(
      page,
      `<style>
        ui-popover-popup { position: fixed; inset: auto; margin: 0; top: 60px; left: 10px;
          padding: 8px; background: #fff; border: 1px solid #ccc; transition: opacity 400ms; }
        ui-popover-popup[data-state="closed"] { opacity: 0; }
      </style>
      <ui-popover>
        <button data-popover-trigger id="open">Open</button>
        <ui-popover-popup><button id="inside">X</button></ui-popover-popup>
      </ui-popover>`,
    );

    const popup = page.locator("ui-popover-popup");
    await page.locator("#open").click();
    await expect(popup).toBeVisible();
    await expect(popup).toHaveAttribute("data-state", "open");

    await page.keyboard.press("Escape");
    // Exit is deferred: still in the top layer (data-open removed, closing) right
    // after the request, then hidden once the 400ms transition ends.
    expect(await popup.isVisible()).toBe(true);
    await expect(popup).toHaveAttribute("data-state", "closed");
    await expect(popup).toBeHidden();
  });

  test("navigation menu opens a panel on hover and publishes its size", async ({ page }) => {
    await mount(
      page,
      `<style>
        ui-nav-list { display: flex; gap: 8px; }
        ui-nav-content { display: block; position: absolute; top: 40px; left: 0; width: 300px; background: #fff; }
        ui-nav-content[hidden] { display: none; }
      </style>
      <ui-navigation-menu delay="60">
        <ui-nav-list>
          <ui-nav-item>
            <button data-nav-trigger id="products">Products</button>
            <ui-nav-content><a href="#a" id="pa" style="display:block;width:280px">Analytics</a></ui-nav-content>
          </ui-nav-item>
          <ui-nav-item>
            <button data-nav-trigger id="company">Company</button>
            <ui-nav-content><a href="#b" id="cb">About</a></ui-nav-content>
          </ui-nav-item>
        </ui-nav-list>
      </ui-navigation-menu>`,
    );

    const products = page.locator("ui-nav-content").nth(0);
    const company = page.locator("ui-nav-content").nth(1);

    await page.locator("#products").hover(); // opens after the intent delay
    await expect(products).toBeVisible();
    // The active panel's measured width is published for a morphing viewport.
    const width = await page
      .locator("ui-navigation-menu")
      .evaluate((el) => getComputedStyle(el).getPropertyValue("--nav-content-width"));
    expect(Number.parseInt(width, 10)).toBeGreaterThan(0);

    // Moving to the sibling switches instantly.
    await page.locator("#company").hover();
    await expect(company).toBeVisible();
    await expect(products).toBeHidden();

    // Keyboard: ArrowDown moves focus into the open panel.
    await page.locator("#company").focus();
    await page.keyboard.press("ArrowDown");
    expect(await activeId(page)).toBe("cb");
  });
});

test.describe("ui — multi-select & new controls (real browser)", () => {
  test("select multiple submits every chosen value via ElementInternals", async ({ page }) => {
    await mount(
      page,
      `<style>ui-select-popup { position: fixed; inset: auto; top: 40px; left: 8px; margin: 0; background: #fff; }
        ui-select-popup:not([data-open]) { display: none; }</style>
      <form id="f">
        <ui-select name="langs" multiple>
          <button data-select-trigger id="trigger"><span data-select-value>Choose…</span></button>
          <ui-select-popup>
            <ui-select-option value="ts">TypeScript</ui-select-option>
            <ui-select-option value="go">Go</ui-select-option>
            <ui-select-option value="rs">Rust</ui-select-option>
          </ui-select-popup>
        </ui-select>
        <button type="submit" id="submit">Submit</button>
      </form>
      <pre id="result"></pre>`,
    );

    const popup = page.locator("ui-select-popup");
    await expect(popup).toHaveAttribute("aria-multiselectable", "true");
    await page.locator("#trigger").click();
    await expect(popup).toBeVisible();
    await page.locator("ui-select-option", { hasText: "TypeScript" }).click();
    await expect(popup).toBeVisible(); // stays open across picks
    await page.locator("ui-select-option", { hasText: "Rust" }).click();
    await page.keyboard.press("Escape");

    await page.evaluate(() => {
      document.querySelector<HTMLFormElement>("#f")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const data = [...new FormData(e.target as HTMLFormElement).entries()];
        const sink = document.querySelector<HTMLElement>("#result");
        if (sink) sink.textContent = JSON.stringify(data);
      });
    });
    await page.locator("#submit").click();
    const entries = JSON.parse((await page.locator("#result").textContent()) ?? "[]") as [
      string,
      string,
    ][];
    expect(entries.filter(([k]) => k === "langs").map(([, v]) => v)).toEqual(["ts", "rs"]);
  });

  test("combobox multi-select renders chips and submits every value", async ({ page }) => {
    await mount(
      page,
      `<style>
        ui-combobox-popup { position: fixed; top: 60px; left: 8px; width: 20rem; padding: .3rem; background: #fff; }
        ui-combobox-popup:not([data-open]) { display: none; }
        ui-combobox-viewport { display: block; position: relative; height: 200px; overflow-y: auto; }
        ui-combobox-spacer { display: block; position: relative; width: 100%; }
        .cb-row { position: absolute; left: 0; right: 0; height: 36px; box-sizing: border-box; }
        ui-combobox-chip { display: inline-flex; gap: 4px; margin: 2px; padding: 2px 6px; background: #eef; }
      </style>
      <form id="f">
        <ui-combobox name="tags" multiple>
          <ui-combobox-chips></ui-combobox-chips>
          <input data-combobox-input id="cb" />
          <button data-combobox-clear type="button" id="clear">Clear</button>
          <ui-combobox-popup>
            <ui-combobox-viewport><ui-combobox-spacer></ui-combobox-spacer></ui-combobox-viewport>
          </ui-combobox-popup>
        </ui-combobox>
        <button type="submit" id="submit">Submit</button>
      </form>
      <pre id="result"></pre>`,
    );
    await page.evaluate(() => {
      const cb = document.querySelector("ui-combobox") as (Element & { items: unknown }) | null;
      if (cb)
        cb.items = Array.from({ length: 50 }, (_, i) => ({ value: `t${i}`, label: `Tag ${i}` }));
    });

    await page.locator("#cb").click();
    await expect(page.locator("ui-combobox-popup")).toBeVisible();
    await page.locator('.cb-row[data-index="0"]').click(); // Tag 0 (t0)
    await page.locator('.cb-row[data-index="2"]').click(); // Tag 2 (t2)
    await expect(page.locator("ui-combobox-chip")).toHaveCount(2);

    await page.evaluate(() => {
      document.querySelector<HTMLFormElement>("#f")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const data = [...new FormData(e.target as HTMLFormElement).entries()];
        const sink = document.querySelector<HTMLElement>("#result");
        if (sink) sink.textContent = JSON.stringify(data);
      });
    });
    await page.locator("#submit").click();
    const entries = JSON.parse((await page.locator("#result").textContent()) ?? "[]") as [
      string,
      string,
    ][];
    expect(entries.filter(([k]) => k === "tags").map(([, v]) => v)).toEqual(["t0", "t2"]);

    // Removing a chip drops its value.
    await page.locator('ui-combobox-chip[data-value="t0"] [data-combobox-chip-remove]').click();
    await expect(page.locator("ui-combobox-chip")).toHaveCount(1);
  });

  test("menu checkbox item toggles in place; radio item is single-select", async ({ page }) => {
    await mount(
      page,
      `<style>ui-menu-popup { position: fixed; inset: auto; top: 20px; left: 8px; margin: 0; background: #fff; }
        ui-menu-popup:not([data-open]) { display: none; }</style>
      <ui-menu>
        <button data-menu-trigger id="trigger">View</button>
        <ui-menu-popup>
          <ui-menu-checkbox-item value="grid" id="grid">Grid</ui-menu-checkbox-item>
          <ui-menu-radio-group value="md">
            <ui-menu-radio-item value="sm" id="sm">Small</ui-menu-radio-item>
            <ui-menu-radio-item value="lg" id="lg">Large</ui-menu-radio-item>
          </ui-menu-radio-group>
        </ui-menu-popup>
      </ui-menu>`,
    );
    const popup = page.locator("ui-menu-popup");
    await page.locator("#trigger").click();
    await expect(popup).toBeVisible();

    await page.locator("#grid").click();
    await expect(page.locator("#grid")).toHaveAttribute("aria-checked", "true");
    await expect(popup).toBeVisible(); // checkbox item keeps the menu open

    await page.locator("#lg").click();
    await expect(page.locator("#lg")).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("#sm")).toHaveAttribute("aria-checked", "false");
    await expect(popup).toBeVisible();
  });

  test("toast appears in the top layer and auto-dismisses", async ({ page }) => {
    await mount(
      page,
      `<style>ui-toast-viewport { position: fixed; bottom: 8px; right: 8px; inset: auto 8px 8px auto; }</style>
      <ui-toast-viewport></ui-toast-viewport>`,
    );
    await expect(page.locator("ui-toast-viewport")).toHaveAttribute("role", "region");

    await page.evaluate(() => {
      const vp = document.querySelector("ui-toast-viewport") as
        | (Element & { add: (o: Record<string, unknown>) => void })
        | null;
      vp?.add({ title: "Saved", description: "All good", duration: 400 });
    });
    const toast = page.locator("ui-toast");
    await expect(toast).toBeVisible();
    await expect(toast).toHaveAttribute("role", "status");
    await expect(toast).toHaveAttribute("aria-live", "polite");
    await expect(toast).toBeHidden({ timeout: 2000 }); // auto-dismissed after ~400ms
  });

  test("slider drag: track click moves the thumb; range picks the nearest", async ({ page }) => {
    await mount(
      page,
      `<style>
        ui-slider { display: block; width: 200px; }
        ui-slider-track { display: block; position: relative; height: 20px; background: #eee; }
        ui-slider-thumb { position: absolute; top: 0; width: 12px; height: 20px; margin-left: -6px; background: #333; }
      </style>
      <ui-slider id="single" name="vol" value="20" min="0" max="100" step="1">
        <ui-slider-track id="track1"><ui-slider-thumb></ui-slider-thumb></ui-slider-track>
      </ui-slider>
      <ui-slider id="range" value="20,80" min="0" max="100" step="1" min-distance="10">
        <ui-slider-track id="track2">
          <ui-slider-thumb id="lo"></ui-slider-thumb>
          <ui-slider-thumb id="hi"></ui-slider-thumb>
        </ui-slider-track>
      </ui-slider>`,
    );

    const val = (id: string) =>
      page
        .locator(`#${id}`)
        .evaluate((el) => (el as unknown as { value: number | number[] }).value);

    // Single: click at 75% of the 200px track → ~75.
    await page.locator("#track1").click({ position: { x: 150, y: 10 } });
    expect(await val("single")).toBeGreaterThan(65);

    // Range: click near the left third moves the LOW thumb (nearest).
    await page.locator("#track2").click({ position: { x: 30, y: 10 } });
    const lo = (await val("range")) as number[];
    expect(lo[0]).toBeLessThan(20);
    expect(lo[1]).toBe(80); // high thumb untouched
    // Click near the right end moves the HIGH thumb.
    await page.locator("#track2").click({ position: { x: 190, y: 10 } });
    const hi = (await val("range")) as number[];
    expect(hi[1]).toBeGreaterThan(88);
  });

  test("number field scrubs the value by dragging the scrub area", async ({ page }) => {
    await mount(
      page,
      `<ui-number-field name="qty" value="10" min="0" max="100" step="1" scrub-sensitivity="4">
        <span data-number-scrub id="scrub" style="display:inline-block;width:60px;height:24px;background:#ddd">⇔</span>
        <input data-number-input id="ni" />
      </ui-number-field>`,
    );
    // Drive the scrub via synthetic movementX (Pointer Lock is best-effort in
    // headless; the movementX path is what changes the value).
    const before = await page.locator("#ni").inputValue();
    await page.evaluate(() => {
      const scrub = document.querySelector("#scrub")!;
      scrub.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      for (let i = 0; i < 5; i++) {
        const e = new PointerEvent("pointermove", { bubbles: true });
        Object.defineProperty(e, "movementX", { value: 8 }); // +2 steps each (sensitivity 4)
        window.dispatchEvent(e);
      }
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
    expect(Number(await page.locator("#ni").inputValue())).toBeGreaterThan(Number(before));
  });

  test("drawer swipes open from the edge zone", async ({ page }) => {
    await mount(
      page,
      `<style>
        ui-drawer-popup { position: fixed; inset: 0 0 0 auto; margin: 0; width: 300px; background: #fff; }
        ui-drawer-popup:not([data-open]) { display: none; }
        #swipe { position: fixed; top: 0; right: 0; width: 24px; height: 100vh; touch-action: none; }
      </style>
      <ui-drawer side="right">
        <div data-drawer-swipe id="swipe"></div>
        <ui-drawer-popup><button id="inside">Action</button></ui-drawer-popup>
      </ui-drawer>`,
    );
    const popup = page.locator("ui-drawer-popup");
    await expect(popup).toBeHidden();

    // Grab the right-edge zone and drag inward (leftward) past the threshold.
    const box = (await page.locator("#swipe").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x - 200, box.y + 200, { steps: 8 });
    await page.mouse.up();
    await expect(popup).toBeVisible();
    await expect(page.locator("ui-drawer")).toHaveJSProperty("open", true);
  });
});
