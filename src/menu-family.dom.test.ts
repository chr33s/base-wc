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
  async function mount() {
    document.body.innerHTML = `
      <ui-menubar>
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
