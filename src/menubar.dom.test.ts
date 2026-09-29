// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";
import { key, must } from "./test-utils.ts";

/** The value, or a failure naming the missing element. */
afterEach(() => {
  document.body.innerHTML = "";
});

async function mount(editAttrs = "") {
  document.body.innerHTML = `
    <ui-menubar>
      <ui-menu>
        <button data-menu-trigger id="file">File</button>
        <ui-menu-popup><ui-menu-item value="new">New</ui-menu-item></ui-menu-popup>
      </ui-menu>
      <ui-menu ${editAttrs}>
        <button data-menu-trigger id="edit">Edit</button>
        <ui-menu-popup><ui-menu-item value="undo">Undo</ui-menu-item></ui-menu-popup>
      </ui-menu>
      <ui-menu>
        <button data-menu-trigger id="view">View</button>
        <ui-menu-popup><ui-menu-item value="zoom">Zoom</ui-menu-item></ui-menu-popup>
      </ui-menu>
    </ui-menubar>`;
  await Promise.resolve();
  await Promise.resolve();
  const [file, edit, view] = ["#file", "#edit", "#view"].map((id) =>
    must(document.querySelector<HTMLButtonElement>(id)),
  );
  return {
    bar: must(document.querySelector("ui-menubar")),
    menus: [...document.querySelectorAll("ui-menu")],
    file: must(file),
    edit: must(edit),
    view: must(view),
  };
}

const enter = (el: Element) => el.dispatchEvent(new PointerEvent("pointerenter"));

describe("ui-menubar", () => {
  it("marks up the bar, its menus and its triggers", async () => {
    const { bar, menus, file } = await mount();
    expect(bar.getAttribute("role")).toBe("menubar");
    expect(menus.every((m) => m.getAttribute("role") === "group")).toBe(true);
    expect(file.getAttribute("role")).toBe("menuitem");
  });

  it("keeps a single roving tab stop across the triggers", async () => {
    const { file, edit, view } = await mount();
    expect([file, edit, view].map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    file.focus();
    key(file, "ArrowRight");
    expect(document.activeElement).toBe(edit);
    key(edit, "End");
    expect(document.activeElement).toBe(view);
  });

  it("moves the open menu along with the arrows once one is open", async () => {
    const { menus, file, edit } = await mount();
    file.click();
    expect(menus[0]?.open).toBe(true);
    key(must(document.querySelector("ui-menu-item")), "ArrowRight");
    expect(menus[0]?.open).toBe(false);
    expect(menus[1]?.open).toBe(true);
    expect(edit.getAttribute("aria-expanded")).toBe("true");
  });

  it("wraps around the bar when crossing open menus", async () => {
    const { menus, view } = await mount();
    view.click();
    const items = document.querySelectorAll("ui-menu-item");
    key(must(items[2]), "ArrowRight");
    expect(menus[2]?.open).toBe(false);
    expect(menus[0]?.open).toBe(true);
  });

  it("switches the open menu on hover but does not open any when all are closed", async () => {
    const { menus, file, edit } = await mount();
    enter(edit);
    expect(menus.some((m) => m.open)).toBe(false);
    file.click();
    enter(edit);
    expect(menus[0]?.open).toBe(false);
    expect(menus[1]?.open).toBe(true);
  });

  it("skips a disabled menu when crossing", async () => {
    const { menus, file } = await mount("disabled");
    file.click();
    key(must(document.querySelector("ui-menu-item")), "ArrowRight");
    expect(menus[1]?.open).toBe(false);
    expect(menus[2]?.open).toBe(true);
  });
});
