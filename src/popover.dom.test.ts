// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";
import { key, must } from "./test-utils.ts";

/** Narrow a lookup the fixture guarantees is present. */
async function mount() {
  document.body.innerHTML = `
    <button id="outside">outside</button>
    <ui-popover>
      <button data-popover-trigger>Open</button>
      <ui-popover-popup>
        <h2 data-popover-title>Title</h2>
        <p data-popover-description>Desc</p>
        <button id="inside">Action</button>
        <button data-popover-close id="close">Close</button>
      </ui-popover-popup>
    </ui-popover>`;
  await Promise.resolve();
  const popover = must(document.querySelector("ui-popover"));
  const trigger = must(document.querySelector<HTMLButtonElement>("[data-popover-trigger]"));
  const popup = must(document.querySelector("ui-popover-popup"));
  const inside = must(document.querySelector<HTMLButtonElement>("#inside"));
  const outside = must(document.querySelector<HTMLButtonElement>("#outside"));
  const closeBtn = must(document.querySelector<HTMLButtonElement>("#close"));
  return { popover, trigger, popup, inside, outside, closeBtn };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-popover", () => {
  it("wires when required light-DOM parts arrive after connection", async () => {
    const popover = document.createElement("ui-popover");
    document.body.append(popover);
    await Promise.resolve();

    const trigger = document.createElement("button");
    trigger.setAttribute("data-popover-trigger", "");
    const popup = document.createElement("ui-popover-popup");
    popover.append(trigger, popup);
    await Promise.resolve();
    await Promise.resolve();

    trigger.click();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(popup.hasAttribute("data-open")).toBe(true);
  });

  it("wires trigger + popup ARIA on connect", async () => {
    const { trigger, popup } = await mount();
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-controls")).toBe(popup.id);
    expect(popup.getAttribute("role")).toBe("dialog");
  });

  it("labels and describes the dialog from its title/description", async () => {
    const { popup } = await mount();
    const title = must(document.querySelector("[data-popover-title]"));
    const description = must(document.querySelector("[data-popover-description]"));
    expect(popup.getAttribute("aria-labelledby")).toBe(title.id);
    expect(popup.getAttribute("aria-describedby")).toBe(description.id);
    expect(title.id).toBeTruthy();
  });

  it("closes on a [data-popover-close] click", async () => {
    const { trigger, popup, closeBtn } = await mount();
    trigger.click();
    expect(popup.hasAttribute("data-open")).toBe(true);
    closeBtn.click();
    expect(popup.hasAttribute("data-open")).toBe(false);
  });

  it("opens on trigger click and focuses the first focusable", async () => {
    const { trigger, popup, inside } = await mount();
    trigger.click();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(popup.hasAttribute("data-open")).toBe(true);
    expect(document.activeElement).toBe(inside);
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    const { trigger, popup } = await mount();
    trigger.click();
    key(popup, "Escape");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(popup.hasAttribute("data-open")).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("light-dismisses on outside press", async () => {
    const { trigger, popup, outside } = await mount();
    trigger.click();
    outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(popup.hasAttribute("data-open")).toBe(false);
  });

  it("Escape still dismisses when the popup has no focusable content", async () => {
    document.body.innerHTML = `
      <ui-popover>
        <button data-popover-trigger>Open</button>
        <ui-popover-popup><p>Plain text only</p></ui-popover-popup>
      </ui-popover>`;
    await Promise.resolve();
    const trigger = must(document.querySelector<HTMLButtonElement>("[data-popover-trigger]"));
    const popup = must(document.querySelector("ui-popover-popup"));
    trigger.click();
    expect(popup.hasAttribute("data-open")).toBe(true);
    // With nothing focusable inside, focus falls back to the popup itself…
    expect(document.activeElement).toBe(popup);
    // …so Escape (listened on the host) still has a live path to dismissal.
    key(must(document.activeElement), "Escape");
    expect(popup.hasAttribute("data-open")).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("opens imperatively in the same task as connection (sync-wire guard)", async () => {
    document.body.innerHTML = `
      <ui-popover>
        <button data-popover-trigger>Open</button>
        <ui-popover-popup><button id="inside">Go</button></ui-popover-popup>
      </ui-popover>`;
    const popover = must(document.querySelector("ui-popover"));
    popover.show(); // no microtask wait — must wire synchronously
    expect(popover.open).toBe(true);
    expect(must(document.querySelector("ui-popover-popup")).hasAttribute("data-open")).toBe(true);
  });

  it("stays interactive (non-modal): does not lock scroll", async () => {
    const { trigger } = await mount();
    document.documentElement.style.overflow = "";
    trigger.click();
    expect(document.documentElement.style.overflow).toBe(""); // no scroll lock
  });
});
