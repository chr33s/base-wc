// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";

// happy-dom has no layout (scrollHeight/clientHeight are 0), so overflow
// detection and thumb sizing are covered by ui.e2e.test.ts. Here we only assert
// the wiring: elements register and orientation is normalized.
afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-scroll-area", () => {
  async function mount() {
    document.body.innerHTML = `
      <ui-scroll-area>
        <ui-scroll-viewport><div>content</div></ui-scroll-viewport>
        <ui-scroll-scrollbar data-orientation="vertical"><ui-scroll-thumb></ui-scroll-thumb></ui-scroll-scrollbar>
        <ui-scroll-scrollbar><ui-scroll-thumb></ui-scroll-thumb></ui-scroll-scrollbar>
      </ui-scroll-area>`;
    await Promise.resolve();
    const area = document.querySelector("ui-scroll-area")!;
    const bars = [...document.querySelectorAll("ui-scroll-scrollbar")];
    return { area, bars };
  }

  it("normalizes scrollbar orientation (defaulting to vertical)", async () => {
    const { bars } = await mount();
    expect(bars[0].getAttribute("data-orientation")).toBe("vertical");
    expect(bars[1].getAttribute("data-orientation")).toBe("vertical");
  });

  it("reports no overflow without layout", async () => {
    const { area, bars } = await mount();
    expect(area.hasAttribute("data-overflow-y")).toBe(false);
    expect(bars[0].hasAttribute("hidden")).toBe(true); // hidden when nothing overflows
  });

  // The thumb drag runs through the shared trackPointerDrag, so an interrupted
  // touch (system gesture, scroll takeover) ends it like a release does —
  // otherwise its window listeners accumulate for the life of the page.
  it("releases the drag listeners on pointerup and on pointercancel", async () => {
    const pointer = (type: string, clientY: number) =>
      new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientY });
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    let live = 0;
    window.addEventListener = ((type: string, ...rest: unknown[]) => {
      if (type === "pointermove") live++;
      return (add as (...a: unknown[]) => void)(type, ...rest);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((type: string, ...rest: unknown[]) => {
      if (type === "pointermove") live--;
      return (remove as (...a: unknown[]) => void)(type, ...rest);
    }) as typeof window.removeEventListener;

    try {
      await mount();
      const thumb = document.querySelector<HTMLElement>("ui-scroll-thumb")!;

      thumb.dispatchEvent(pointer("pointerdown", 0));
      expect(live).toBe(1);
      window.dispatchEvent(pointer("pointerup", 10));
      expect(live).toBe(0);

      thumb.dispatchEvent(pointer("pointerdown", 0));
      expect(live).toBe(1);
      window.dispatchEvent(pointer("pointercancel", 10));
      expect(live).toBe(0);
    } finally {
      window.addEventListener = add;
      window.removeEventListener = remove;
    }
  });
});
