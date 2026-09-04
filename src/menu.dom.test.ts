// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { MenuSelectDetail } from "./menu.ts";
import "./elements.ts";

const key = (target: EventTarget, k: string) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

async function mount() {
  document.body.innerHTML = `
    <ui-menu>
      <button data-menu-trigger>Options</button>
      <ui-menu-popup>
        <ui-menu-item value="edit">Edit</ui-menu-item>
        <ui-menu-item value="duplicate">Duplicate</ui-menu-item>
        <ui-menu-item value="archive" disabled>Archive</ui-menu-item>
        <ui-menu-item value="delete">Delete</ui-menu-item>
      </ui-menu-popup>
    </ui-menu>`;
  await Promise.resolve(); // let the deferred wiring microtask run
  const menu = document.querySelector("ui-menu")!;
  const trigger = document.querySelector<HTMLButtonElement>("[data-menu-trigger]")!;
  const popup = document.querySelector("ui-menu-popup")!;
  const items = [...document.querySelectorAll("ui-menu-item")];
  return { menu, trigger, popup, items };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-menu", () => {
  it("wires trigger + item ARIA on connect", async () => {
    const { trigger, popup, items } = await mount();
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-controls")).toBe(popup.id);
    expect(popup.getAttribute("role")).toBe("menu");
    expect(items.every((i) => i.getAttribute("role") === "menuitem")).toBe(true);
    expect(items[2].getAttribute("aria-disabled")).toBe("true"); // archive
  });

  it("opens on trigger click and highlights the first item", async () => {
    const { trigger, popup, items } = await mount();
    trigger.click();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(popup.hasAttribute("data-open")).toBe(true);
    expect(items[0].hasAttribute("data-highlighted")).toBe(true);
    expect(document.activeElement).toBe(items[0]);
  });

  it("arrow navigation skips disabled items", async () => {
    const { trigger, popup, items } = await mount();
    trigger.click(); // active = Edit (0)
    key(popup, "ArrowDown"); // → Duplicate
    expect(items[1].hasAttribute("data-highlighted")).toBe(true);
    key(popup, "ArrowDown"); // → Delete (skips disabled Archive)
    expect(items[2].hasAttribute("data-highlighted")).toBe(false); // Archive
    expect(items[3].hasAttribute("data-highlighted")).toBe(true); // Delete
  });

  it("wraps with arrow keys and supports Home/End", async () => {
    const { trigger, popup, items } = await mount();
    trigger.click();
    key(popup, "ArrowUp"); // wrap from first → last enabled (Delete)
    expect(items[3].hasAttribute("data-highlighted")).toBe(true);
    key(popup, "Home");
    expect(items[0].hasAttribute("data-highlighted")).toBe(true);
    key(popup, "End");
    expect(items[3].hasAttribute("data-highlighted")).toBe(true);
  });

  it("typeahead jumps to a matching item", async () => {
    const { trigger, popup, items } = await mount();
    trigger.click(); // active = Edit
    key(popup, "d"); // next match starting with "d" → Duplicate
    expect(items[1].hasAttribute("data-highlighted")).toBe(true);
  });

  it("Enter activates the highlighted item and closes", async () => {
    const { menu, trigger, popup, items } = await mount();
    const onSelect = vi.fn<(detail: MenuSelectDetail) => void>();
    menu.addEventListener("menu-select", (e) =>
      onSelect((e as CustomEvent<MenuSelectDetail>).detail),
    );
    trigger.click(); // Edit
    key(popup, "ArrowDown"); // Duplicate
    key(popup, "Enter");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({ value: "duplicate", item: items[1] });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("selects on item click but ignores disabled items", async () => {
    const { menu, trigger, items } = await mount();
    const onSelect = vi.fn<(detail: MenuSelectDetail) => void>();
    menu.addEventListener("menu-select", (e) =>
      onSelect((e as CustomEvent<MenuSelectDetail>).detail),
    );
    trigger.click();
    items[2].click(); // Archive (disabled) — no select
    expect(onSelect).not.toHaveBeenCalled();
    items[3].click(); // Delete
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].value).toBe("delete");
  });

  it("Space extends a pending typeahead search instead of activating", async () => {
    document.body.innerHTML = `
      <ui-menu>
        <button data-menu-trigger>File</button>
        <ui-menu-popup>
          <ui-menu-item value="new-file">New File</ui-menu-item>
          <ui-menu-item value="new-window">New Window</ui-menu-item>
        </ui-menu-popup>
      </ui-menu>`;
    await Promise.resolve();
    const menu = document.querySelector("ui-menu")!;
    const trigger = document.querySelector<HTMLButtonElement>("[data-menu-trigger]")!;
    const popup = document.querySelector("ui-menu-popup")!;
    const items = [...document.querySelectorAll("ui-menu-item")];
    const onSelect = vi.fn<(e: Event) => void>();
    menu.addEventListener("menu-select", onSelect);
    trigger.click(); // active = New File
    for (const ch of ["n", "e", "w", " ", "w"]) key(popup, ch);
    expect(onSelect).not.toHaveBeenCalled(); // Space searched, didn't activate
    expect(items[1].hasAttribute("data-highlighted")).toBe(true); // "New Window"
    expect(popup.hasAttribute("data-open")).toBe(true);
  });

  it("opens via openAt() in the same task as connection (sync-wire guard)", async () => {
    document.body.innerHTML = `
      <ui-menu>
        <ui-menu-popup>
          <ui-menu-item value="cut">Cut</ui-menu-item>
          <ui-menu-item value="copy">Copy</ui-menu-item>
        </ui-menu-popup>
      </ui-menu>`;
    const menu = document.querySelector("ui-menu")!;
    menu.openAt(40, 20); // no microtask wait — must wire synchronously
    expect(menu.open).toBe(true);
    expect(document.querySelector("ui-menu-popup")!.hasAttribute("data-open")).toBe(true);
    expect(document.activeElement).toBe(document.querySelector("ui-menu-item"));
  });

  it("Escape closes without selecting", async () => {
    const { menu, trigger, popup } = await mount();
    const onSelect = vi.fn<(e: Event) => void>();
    menu.addEventListener("menu-select", onSelect);
    trigger.click();
    key(popup, "Escape");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(popup.hasAttribute("data-open")).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("ui-menu — checkbox / radio items and groups", () => {
  async function mount() {
    document.body.innerHTML = `
      <ui-menu>
        <button data-menu-trigger>View</button>
        <ui-menu-popup>
          <ui-menu-group>
            <ui-menu-group-label>Toggles</ui-menu-group-label>
            <ui-menu-checkbox-item value="grid" id="grid">Show grid</ui-menu-checkbox-item>
            <ui-menu-checkbox-item value="ruler" checked id="ruler">Show ruler</ui-menu-checkbox-item>
          </ui-menu-group>
          <ui-menu-radio-group value="md">
            <ui-menu-radio-item value="sm" id="sm">Small</ui-menu-radio-item>
            <ui-menu-radio-item value="md" id="md">Medium</ui-menu-radio-item>
            <ui-menu-radio-item value="lg" id="lg">Large</ui-menu-radio-item>
          </ui-menu-radio-group>
        </ui-menu-popup>
      </ui-menu>`;
    await Promise.resolve();
    await Promise.resolve(); // group microtask
    const menu = document.querySelector("ui-menu")!;
    const trigger = document.querySelector<HTMLButtonElement>("[data-menu-trigger]")!;
    const popup = document.querySelector("ui-menu-popup")!;
    const $ = (id: string) => document.querySelector<HTMLElement>(`#${id}`)!;
    return { menu, trigger, popup, $ };
  }

  it("wires checkbox/radio roles, initial checked state, and group label", async () => {
    const { popup, $ } = await mount();
    expect($("grid").getAttribute("role")).toBe("menuitemcheckbox");
    expect($("grid").getAttribute("aria-checked")).toBe("false");
    expect($("ruler").getAttribute("aria-checked")).toBe("true"); // starts checked
    expect($("md").getAttribute("role")).toBe("menuitemradio");
    expect($("md").getAttribute("aria-checked")).toBe("true"); // group value=md
    expect($("sm").getAttribute("aria-checked")).toBe("false");
    const group = popup.querySelector("ui-menu-group")!;
    const label = popup.querySelector("ui-menu-group-label")!;
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-labelledby")).toBe(label.id);
  });

  it("navigation roams across checkbox and radio items", async () => {
    const { trigger, popup, $ } = await mount();
    trigger.click(); // highlight first item (grid)
    expect($("grid").hasAttribute("data-highlighted")).toBe(true);
    key(popup, "ArrowDown"); // ruler
    key(popup, "ArrowDown"); // sm (crosses into the radio group)
    expect($("sm").hasAttribute("data-highlighted")).toBe(true);
  });

  it("toggles a checkbox item in place and keeps the menu open", async () => {
    const { menu, trigger, popup, $ } = await mount();
    const onSelect = vi.fn<(d: MenuSelectDetail) => void>();
    menu.addEventListener("menu-select", (e) =>
      onSelect((e as CustomEvent<MenuSelectDetail>).detail),
    );
    trigger.click();
    $("grid").click();
    expect($("grid").getAttribute("aria-checked")).toBe("true");
    expect(popup.hasAttribute("data-open")).toBe(true); // stays open
    $("grid").click();
    expect($("grid").getAttribute("aria-checked")).toBe("false");
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("selects one radio item and releases its siblings, staying open", async () => {
    const { trigger, popup, $ } = await mount();
    trigger.click();
    $("lg").click();
    expect($("lg").getAttribute("aria-checked")).toBe("true");
    expect($("md").getAttribute("aria-checked")).toBe("false"); // previous released
    expect($("sm").getAttribute("aria-checked")).toBe("false");
    expect(popup.hasAttribute("data-open")).toBe(true);
    const group = popup.querySelector<HTMLElement & { value: string }>("ui-menu-radio-group")!;
    expect(group.value).toBe("lg");
  });
});

describe("ui-menu — disabled", () => {
  async function mount(rootAttrs = "") {
    document.body.innerHTML = `
      <ui-menu ${rootAttrs}>
        <button data-menu-trigger id="t">Options</button>
        <ui-menu-popup>
          <ui-menu-group>
            <ui-menu-group-label id="gl">Actions</ui-menu-group-label>
            <ui-menu-item value="a" id="a">A</ui-menu-item>
            <ui-menu-item value="b" id="b" disabled>B</ui-menu-item>
            <ui-menu-item value="c" id="c" aria-disabled="true">C</ui-menu-item>
          </ui-menu-group>
        </ui-menu-popup>
      </ui-menu>`;
    await Promise.resolve();
    await Promise.resolve();
    const menu = document.querySelector("ui-menu")!;
    const trigger = document.querySelector<HTMLButtonElement>("#t")!;
    return { menu, trigger };
  }

  it("hides the group label from the accessibility tree while still naming the group", async () => {
    await mount();
    const label = document.querySelector("#gl")!;
    const group = document.querySelector("ui-menu-group")!;
    // aria-hidden does not suppress a name computed via aria-labelledby, so the
    // group keeps its label — spoken once, as the group's name, rather than
    // again as a node sitting among the menu items.
    expect(label.getAttribute("aria-hidden")).toBe("true");
    expect(group.getAttribute("aria-labelledby")).toBe(label.id);
  });

  it("refuses to open while the root is disabled", async () => {
    const { menu, trigger } = await mount("disabled");
    trigger.click();
    expect(menu.open).toBe(false);
    menu.show(); // and not through the imperative entry point either
    expect(menu.open).toBe(false);
  });

  it("marks the trigger and every item disabled when the root is", async () => {
    const { menu, trigger } = await mount("disabled");
    expect(menu.hasAttribute("data-disabled")).toBe(true);
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
    for (const id of ["#a", "#b", "#c"]) {
      const item = document.querySelector(id)!;
      expect(item.getAttribute("aria-disabled")).toBe("true");
      expect(item.hasAttribute("data-disabled")).toBe(true);
    }
  });

  it("releases only the state it owns when the root is re-enabled", async () => {
    const { menu, trigger } = await mount("disabled");
    menu.removeAttribute("disabled");
    expect(trigger.hasAttribute("aria-disabled")).toBe(false);
    expect(document.querySelector("#a")!.hasAttribute("aria-disabled")).toBe(false);
    // B carries its own `disabled`, and C was announced disabled by the author
    // without one — neither is ours to clear.
    expect(document.querySelector("#b")!.getAttribute("aria-disabled")).toBe("true");
    expect(document.querySelector("#c")!.getAttribute("aria-disabled")).toBe("true");
  });

  it("skips aria-disabled items when navigating, not just [disabled] ones", async () => {
    const { menu, trigger } = await mount();
    trigger.click();
    expect(menu.open).toBe(true);
    const popup = document.querySelector("ui-menu-popup")!;
    // A is highlighted on open; ArrowDown must land past both B ([disabled])
    // and C (aria-disabled) — which, being the only remaining item, wraps to A.
    expect(document.querySelector("#a")!.hasAttribute("data-highlighted")).toBe(true);
    popup.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
    );
    expect(document.querySelector("#b")!.hasAttribute("data-highlighted")).toBe(false);
    expect(document.querySelector("#c")!.hasAttribute("data-highlighted")).toBe(false);
  });

  it("re-enables an item whose `disabled` is removed at runtime", async () => {
    const { menu, trigger } = await mount();
    const b = document.querySelector<HTMLElement>("#b")!;
    b.removeAttribute("disabled");
    expect(b.hasAttribute("aria-disabled")).toBe(false);
    expect(b.hasAttribute("data-disabled")).toBe(false);
    trigger.click();
    expect(menu.open).toBe(true);
    document
      .querySelector("ui-menu-popup")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    // A stale aria-disabled left behind by the one-shot connect reflection
    // would keep the item out of navigation and swallow its clicks forever.
    expect(b.hasAttribute("data-highlighted")).toBe(true);
  });
});

describe("ui-menu — hover highlight", () => {
  const hover = (target: Element, clientX: number, clientY: number) =>
    target.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX, clientY }));

  it("ignores a pointermove that reports the same coordinates as the last one", async () => {
    const { menu, popup, items } = await mount();
    menu.show();
    hover(items[0], 10, 10);
    expect(items[0].hasAttribute("data-highlighted")).toBe(true);

    // Arrow-key navigation scrolls a long menu, sliding a new item under a
    // resting cursor — and Safari reports that as a pointermove at unchanged
    // coordinates. Acting on it would drag the highlight back off whatever the
    // keyboard just reached.
    key(popup, "ArrowDown");
    expect(items[1].hasAttribute("data-highlighted")).toBe(true);
    hover(items[0], 10, 10);
    expect(items[1].hasAttribute("data-highlighted")).toBe(true);

    // A pointer that genuinely moved still highlights.
    hover(items[0], 11, 10);
    expect(items[0].hasAttribute("data-highlighted")).toBe(true);
  });
});
