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
