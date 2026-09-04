// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import "./elements.ts";

const key = (target: EventTarget, k: string) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-menu — submenu", () => {
  async function mount() {
    document.body.innerHTML = `
      <ui-menu>
        <button data-menu-trigger id="root-trigger">Options</button>
        <ui-menu-popup>
          <ui-menu-item value="edit">Edit</ui-menu-item>
          <ui-menu submenu>
            <ui-menu-item data-menu-trigger id="more">More</ui-menu-item>
            <ui-menu-popup>
              <ui-menu-item value="left">Left</ui-menu-item>
              <ui-menu-item value="right">Right</ui-menu-item>
            </ui-menu-popup>
          </ui-menu>
        </ui-menu-popup>
      </ui-menu>`;
    await Promise.resolve();
    await Promise.resolve(); // parent then nested wiring
    const root = document.querySelector("ui-menu")!;
    const rootPopup = document.querySelector("ui-menu-popup")!;
    const more = document.querySelector<HTMLElement>("#more")!;
    const sub = document.querySelectorAll("ui-menu")[1]!;
    const subPopup = document.querySelectorAll("ui-menu-popup")[1]!;
    return { root, rootPopup, more, sub, subPopup };
  }

  it("scopes parent navigation to its own items (submenu items excluded)", async () => {
    const { root, rootPopup, more } = await mount();
    root.querySelector<HTMLButtonElement>("#root-trigger")!.click();
    // Parent items are [Edit, More]; ArrowDown from Edit lands on the submenu trigger.
    key(rootPopup, "ArrowDown"); // Edit → More
    expect(more.hasAttribute("data-highlighted")).toBe(true);
    // "Left"/"Right" live in the nested popup and are not part of parent nav.
    key(rootPopup, "ArrowDown"); // wraps back to Edit (only 2 parent items)
    expect(document.querySelector("ui-menu-item")!.hasAttribute("data-highlighted")).toBe(true);
  });

  it("opens the submenu on ArrowRight and focuses its first item", async () => {
    const { root, more, subPopup } = await mount();
    root.querySelector<HTMLButtonElement>("#root-trigger")!.click();
    more.setAttribute("data-highlighted", ""); // pretend it's active
    more.focus();
    key(more, "ArrowRight");
    expect(subPopup.hasAttribute("data-open")).toBe(true);
    expect(more.getAttribute("aria-expanded")).toBe("true");
  });

  it("closes the submenu on ArrowLeft, keeping the parent open", async () => {
    const { root, rootPopup, more, subPopup } = await mount();
    root.querySelector<HTMLButtonElement>("#root-trigger")!.click();
    more.focus();
    key(more, "ArrowRight");
    expect(subPopup.hasAttribute("data-open")).toBe(true);
    key(subPopup, "ArrowLeft");
    expect(subPopup.hasAttribute("data-open")).toBe(false);
    expect(rootPopup.hasAttribute("data-open")).toBe(true); // parent stays open
  });

  it("mirrors the open/close keys under RTL (ArrowLeft opens, ArrowRight closes)", async () => {
    const { root, rootPopup, more, subPopup } = await mount();
    root.setAttribute("dir", "rtl");
    root.querySelector<HTMLButtonElement>("#root-trigger")!.click();
    more.focus();
    key(more, "ArrowLeft"); // RTL: the submenu opens toward the left
    expect(subPopup.hasAttribute("data-open")).toBe(true);
    key(subPopup, "ArrowRight"); // RTL: ArrowRight collapses back to the parent
    expect(subPopup.hasAttribute("data-open")).toBe(false);
    expect(rootPopup.hasAttribute("data-open")).toBe(true);
  });
});

describe("ui-menubar", () => {
  async function mount(attrs = "") {
    document.body.innerHTML = `
      <ui-menubar ${attrs}>
        <ui-menu>
          <button data-menu-trigger id="file">File</button>
          <ui-menu-popup><ui-menu-item value="new">New</ui-menu-item></ui-menu-popup>
        </ui-menu>
        <ui-menu>
          <button data-menu-trigger id="edit">Edit</button>
          <ui-menu-popup><ui-menu-item value="undo">Undo</ui-menu-item></ui-menu-popup>
        </ui-menu>
      </ui-menubar>`;
    await Promise.resolve();
    await Promise.resolve();
    const bar = document.querySelector("ui-menubar")!;
    const file = document.querySelector<HTMLButtonElement>("#file")!;
    const edit = document.querySelector<HTMLButtonElement>("#edit")!;
    const menus = [...document.querySelectorAll("ui-menu")];
    return { bar, file, edit, menus };
  }

  it("is a menubar with one roving tab stop", async () => {
    const { bar, file, edit } = await mount();
    expect(bar.getAttribute("role")).toBe("menubar");
    expect(file.tabIndex).toBe(0);
    expect(edit.tabIndex).toBe(-1);
  });

  it("gives the bar the children its role requires", async () => {
    const { bar, file, edit, menus } = await mount();
    // `menubar` admits only menuitem/menuitemcheckbox/menuitemradio/group as
    // children. Left bare, the `<ui-menu>` wrappers carry no role and the
    // triggers are plain buttons, so the bar advertises a menubar containing
    // nothing a menubar may contain — and screen readers may decline to treat
    // it as one. `group` wrappers are allowed children and can in turn hold
    // both the trigger and the popup's own `role="menu"`.
    for (const menu of menus) expect(menu.getAttribute("role")).toBe("group");
    expect(file.getAttribute("role")).toBe("menuitem");
    expect(edit.getAttribute("role")).toBe("menuitem");
    expect([...bar.children].every((child) => child.getAttribute("role") === "group")).toBe(true);
  });

  it("keeps a disabled submenu's trigger disabled when the parent toggles", async () => {
    document.body.innerHTML = `
      <ui-menu>
        <button data-menu-trigger id="root-trigger">Options</button>
        <ui-menu-popup>
          <ui-menu-item value="edit">Edit</ui-menu-item>
          <ui-menu submenu disabled>
            <ui-menu-item data-menu-trigger id="more">More</ui-menu-item>
            <ui-menu-popup><ui-menu-item value="x">X</ui-menu-item></ui-menu-popup>
          </ui-menu>
        </ui-menu-popup>
      </ui-menu>`;
    await Promise.resolve();
    await Promise.resolve();
    const root = document.querySelector("ui-menu")!;
    const more = document.querySelector<HTMLElement>("#more")!;
    expect(more.getAttribute("aria-disabled")).toBe("true");
    root.setAttribute("disabled", "");
    root.removeAttribute("disabled");
    // The trigger item sits in both menus' item sets; the parent's re-enable
    // must not strip what the still-disabled submenu owns.
    expect(more.getAttribute("aria-disabled")).toBe("true");
    expect(more.hasAttribute("data-disabled")).toBe(true);
  });

  it("crosses past a disabled menu from inside an open popup", async () => {
    document.body.innerHTML = `
      <ui-menubar>
        <ui-menu>
          <button data-menu-trigger id="a">A</button>
          <ui-menu-popup><ui-menu-item value="1" id="i1">1</ui-menu-item></ui-menu-popup>
        </ui-menu>
        <ui-menu disabled>
          <button data-menu-trigger id="b">B</button>
          <ui-menu-popup><ui-menu-item value="2">2</ui-menu-item></ui-menu-popup>
        </ui-menu>
        <ui-menu>
          <button data-menu-trigger id="c">C</button>
          <ui-menu-popup><ui-menu-item value="3">3</ui-menu-item></ui-menu-popup>
        </ui-menu>
      </ui-menubar>`;
    await Promise.resolve();
    await Promise.resolve();
    const menus = [...document.querySelectorAll("ui-menu")];
    const a = document.querySelector<HTMLButtonElement>("#a")!;
    a.click();
    expect(menus[0].open).toBe(true);
    key(document.querySelector("#i1")!, "ArrowRight");
    // Landing on the disabled B would close A, fail to open B, and strand
    // focus on a disabled trigger with every menu shut.
    expect(menus.map((m) => m.open)).toEqual([false, false, true]);
  });

  it("skips a disabled trigger when roving", async () => {
    document.body.innerHTML = `
      <ui-menubar>
        <ui-menu>
          <button data-menu-trigger id="a">A</button>
          <ui-menu-popup><ui-menu-item value="1">1</ui-menu-item></ui-menu-popup>
        </ui-menu>
        <ui-menu>
          <button data-menu-trigger id="b" disabled>B</button>
          <ui-menu-popup><ui-menu-item value="2">2</ui-menu-item></ui-menu-popup>
        </ui-menu>
        <ui-menu>
          <button data-menu-trigger id="c">C</button>
          <ui-menu-popup><ui-menu-item value="3">3</ui-menu-item></ui-menu-popup>
        </ui-menu>
      </ui-menubar>`;
    await Promise.resolve();
    await Promise.resolve();
    const a = document.querySelector<HTMLButtonElement>("#a")!;
    const b = document.querySelector<HTMLButtonElement>("#b")!;
    const c = document.querySelector<HTMLButtonElement>("#c")!;
    a.focus();
    key(a, "ArrowRight");
    expect(document.activeElement).toBe(c); // straight past the disabled B
    expect(b.tabIndex).toBe(0); // untouched — roving never claims a disabled item
  });

  it("moves focus between triggers with the arrow keys (closed)", async () => {
    const { file, edit } = await mount();
    file.focus();
    key(file, "ArrowRight");
    expect(document.activeElement).toBe(edit);
    expect(edit.tabIndex).toBe(0);
    expect(file.tabIndex).toBe(-1);
  });

  it("crosses to the sibling menu and opens it when one is already open", async () => {
    const { file, edit, menus } = await mount();
    file.click(); // opens File
    expect(menus[0].open).toBe(true);
    // Focus is now in File's popup; ArrowRight crosses to Edit and opens it.
    const filePopup = menus[0].querySelector("ui-menu-popup")!;
    key(filePopup, "ArrowRight");
    expect(menus[0].open).toBe(false);
    expect(menus[1].open).toBe(true);
    expect(document.activeElement).toBe(edit.parentElement?.querySelector("ui-menu-item") ?? edit);
  });

  it("flips the arrow direction under RTL", async () => {
    const { bar, file, edit } = await mount();
    bar.setAttribute("dir", "rtl");
    file.focus();
    key(file, "ArrowLeft"); // RTL: ArrowLeft advances to the next trigger
    expect(document.activeElement).toBe(edit);
    key(edit, "ArrowRight"); // RTL: ArrowRight goes back
    expect(document.activeElement).toBe(file);
  });
});

describe("ui-context-menu", () => {
  async function mount() {
    document.body.innerHTML = `
      <ui-context-menu>
        <div data-context-target id="target" style="width:200px;height:100px">Right-click</div>
        <ui-menu>
          <ui-menu-popup>
            <ui-menu-item value="cut">Cut</ui-menu-item>
            <ui-menu-item value="copy">Copy</ui-menu-item>
          </ui-menu-popup>
        </ui-menu>
      </ui-context-menu>`;
    await Promise.resolve();
    await Promise.resolve();
    const target = document.querySelector<HTMLElement>("#target")!;
    const menu = document.querySelector("ui-menu")!;
    const popup = document.querySelector("ui-menu-popup")!;
    return { target, menu, popup };
  }

  it("opens the menu at the pointer on contextmenu and focuses the first item", async () => {
    const { target, popup } = await mount();
    const onSelect = vi.fn<(detail: { value: string }) => void>();
    document
      .querySelector("ui-menu")!
      .addEventListener("menu-select", (e) =>
        onSelect((e as CustomEvent<{ value: string }>).detail),
      );

    target.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 120, clientY: 60 }),
    );
    expect(popup.hasAttribute("data-open")).toBe(true);
    expect(document.activeElement).toBe(document.querySelector("ui-menu-item"));

    // Enter activates the focused item.
    key(popup, "Enter");
    expect(onSelect.mock.calls[0][0].value).toBe("cut");
    expect(popup.hasAttribute("data-open")).toBe(false);
  });

  it("prevents the browser's native context menu", async () => {
    const { target } = await mount();
    const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});

describe("ui-menubar orientation", () => {
  async function mount(attrs = "") {
    document.body.innerHTML = `
      <ui-menubar ${attrs}>
        <ui-menu>
          <button data-menu-trigger id="v-file">File</button>
          <ui-menu-popup><ui-menu-item value="new">New</ui-menu-item></ui-menu-popup>
        </ui-menu>
        <ui-menu>
          <button data-menu-trigger id="v-edit">Edit</button>
          <ui-menu-popup><ui-menu-item value="undo">Undo</ui-menu-item></ui-menu-popup>
        </ui-menu>
      </ui-menubar>`;
    await Promise.resolve();
    await Promise.resolve();
    return {
      bar: document.querySelector("ui-menubar")!,
      file: document.querySelector<HTMLButtonElement>("#v-file")!,
      edit: document.querySelector<HTMLButtonElement>("#v-edit")!,
    };
  }

  it("always announces its axis, since menubar has no useful default", async () => {
    const { bar } = await mount();
    expect(bar.getAttribute("aria-orientation")).toBe("horizontal");
  });

  it("walks a vertical bar with the vertical arrows", async () => {
    const { bar, file, edit } = await mount('orientation="vertical"');
    expect(bar.getAttribute("aria-orientation")).toBe("vertical");

    file.focus();
    key(file, "ArrowDown");
    expect(document.activeElement).toBe(edit);
  });

  it("opens a menu across a vertical bar rather than along it", async () => {
    const { edit } = await mount('orientation="vertical"');
    edit.focus();
    // Down belongs to the bar here, so the open key moves to the cross axis —
    // otherwise one key would both move between menus and open one.
    key(edit, "ArrowDown");
    expect(edit.getAttribute("aria-expanded")).toBe("false");

    key(edit, "ArrowRight");
    expect(edit.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement!.textContent!.trim()).toBe("Undo");
  });
});
