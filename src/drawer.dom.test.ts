// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";

const key = (target: EventTarget, k: string) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

async function mount(attrs = "") {
  document.body.innerHTML = `
    <ui-drawer ${attrs}>
      <button data-drawer-trigger id="open">Open</button>
      <ui-drawer-backdrop></ui-drawer-backdrop>
      <ui-drawer-popup>
        <button data-drawer-handle id="handle">grip</button>
        <button id="ok">OK</button>
        <button data-drawer-close id="close">Close</button>
      </ui-drawer-popup>
    </ui-drawer>`;
  await Promise.resolve();
  const drawer = document.querySelector("ui-drawer")!;
  const trigger = document.querySelector<HTMLButtonElement>("#open")!;
  const popup = document.querySelector("ui-drawer-popup")!;
  return { drawer, trigger, popup };
}

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.style.overflow = "";
});

describe("ui-drawer", () => {
  it("wires modal ARIA and reflects the side", async () => {
    const { drawer, trigger, popup } = await mount('side="left"');
    expect(popup.getAttribute("role")).toBe("dialog");
    expect(popup.getAttribute("aria-modal")).toBe("true");
    expect(popup.getAttribute("data-side")).toBe("left");
    expect(drawer.side).toBe("left");
    expect(trigger.getAttribute("aria-controls")).toBe(popup.id);
  });

  it("defaults the side to right", async () => {
    const { popup } = await mount();
    expect(popup.getAttribute("data-side")).toBe("right");
  });

  it("opens with scroll lock and focus moved inside", async () => {
    const { trigger, popup } = await mount();
    trigger.focus();
    trigger.click();
    expect(popup.hasAttribute("data-open")).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(document.querySelector("#handle"));
  });

  it("closes on Escape, unlocking scroll and restoring focus", async () => {
    const { trigger, popup } = await mount();
    trigger.focus();
    trigger.click();
    key(popup, "Escape");
    expect(popup.hasAttribute("data-open")).toBe(false);
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on a [data-drawer-close] click", async () => {
    const { drawer, trigger } = await mount();
    trigger.click();
    document.querySelector<HTMLButtonElement>("#close")!.click();
    expect(drawer.open).toBe(false);
  });
});

describe("ui-drawer — swipe to open", () => {
  async function mount() {
    document.body.innerHTML = `
      <ui-drawer side="right">
        <div data-drawer-swipe id="swipe">edge</div>
        <ui-drawer-popup><button id="ok">OK</button></ui-drawer-popup>
      </ui-drawer>`;
    await Promise.resolve();
    const drawer = document.querySelector("ui-drawer")!;
    const swipe = document.querySelector<HTMLElement>("#swipe")!;
    const popup = document.querySelector("ui-drawer-popup")!;
    return { drawer, swipe, popup };
  }
  const down = (el: EventTarget, x: number) =>
    el.dispatchEvent(new MouseEvent("pointerdown", { clientX: x, clientY: 0, bubbles: true }));
  const up = (x: number) =>
    window.dispatchEvent(new MouseEvent("pointerup", { clientX: x, clientY: 0 }));

  afterEach(() => {
    document.documentElement.style.overflow = "";
  });

  it("presents on grab and commits open when swiped inward", async () => {
    const { drawer, swipe, popup } = await mount();
    down(swipe, 100); // grab the edge zone → drawer presented (off-screen)
    expect(popup.hasAttribute("data-open")).toBe(true);
    up(60); // dragged inward (right→left) past the threshold → stays open
    expect(drawer.open).toBe(true);
  });

  it("aborts and dismisses when released without swiping in", async () => {
    const { drawer, swipe } = await mount();
    down(swipe, 100);
    up(100); // no inward movement
    expect(drawer.open).toBe(false);
  });
});
