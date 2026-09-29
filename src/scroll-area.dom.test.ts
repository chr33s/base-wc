// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";
import { must } from "./test-utils.ts";

/** Narrow an indexed lookup the fixture guarantees is present. */
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
    const area = must(document.querySelector("ui-scroll-area"));
    const bars = [...document.querySelectorAll("ui-scroll-scrollbar")];
    return { area, bars };
  }

  it("normalizes scrollbar orientation (defaulting to vertical)", async () => {
    const { bars } = await mount();
    expect(must(bars[0]).getAttribute("data-orientation")).toBe("vertical");
    expect(must(bars[1]).getAttribute("data-orientation")).toBe("vertical");
  });

  it("reports no overflow without layout", async () => {
    const { area, bars } = await mount();
    expect(area.hasAttribute("data-overflow-y")).toBe(false);
    expect(must(bars[0]).hasAttribute("hidden")).toBe(true); // hidden when nothing overflows
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
      const thumb = must(document.querySelector<HTMLElement>("ui-scroll-thumb"));

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

describe("ui-scroll-area — scrollbar chrome", () => {
  async function mount() {
    document.body.innerHTML = `
      <ui-scroll-area>
        <ui-scroll-viewport style="scroll-snap-type: y mandatory"><div>content</div></ui-scroll-viewport>
        <ui-scroll-scrollbar data-orientation="vertical"><ui-scroll-thumb></ui-scroll-thumb></ui-scroll-scrollbar>
      </ui-scroll-area>`;
    await Promise.resolve();
    return {
      viewport: must(document.querySelector<HTMLElement>("ui-scroll-viewport")),
      bar: must(document.querySelector("ui-scroll-scrollbar")),
      thumb: must(document.querySelector<HTMLElement>("ui-scroll-thumb")),
    };
  }

  it("hides the scrollbar and thumb from the accessibility tree", async () => {
    const { bar, thumb } = await mount();
    // Pure pointer affordances: a screen reader user scrolls the viewport with
    // the caret or virtual cursor, so exposing these only adds unlabeled
    // generic nodes to the tree.
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    expect(thumb.getAttribute("aria-hidden")).toBe("true");
  });

  it("suspends scroll snapping for the duration of a thumb drag", async () => {
    const { viewport, thumb } = await mount();
    expect(viewport.style.scrollSnapType).toBe("y mandatory");
    thumb.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, bubbles: true }));
    // Snapping forces every programmatic scroll onto a snap point, so a drag
    // would jump between them instead of tracking the pointer. Native
    // scrollbars suppress it while dragging; so do we.
    expect(viewport.style.scrollSnapType).toBe("none");
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
    expect(viewport.style.scrollSnapType).toBe("y mandatory"); // and re-snaps on release
  });

  it("re-snaps only once the last of two simultaneous thumb drags ends", async () => {
    document.body.innerHTML = `
      <ui-scroll-area>
        <ui-scroll-viewport style="scroll-snap-type: both mandatory"><div>content</div></ui-scroll-viewport>
        <ui-scroll-scrollbar data-orientation="vertical"><ui-scroll-thumb id="v"></ui-scroll-thumb></ui-scroll-scrollbar>
        <ui-scroll-scrollbar data-orientation="horizontal"><ui-scroll-thumb id="h"></ui-scroll-thumb></ui-scroll-scrollbar>
      </ui-scroll-area>`;
    await Promise.resolve();
    const viewport = must(document.querySelector<HTMLElement>("ui-scroll-viewport"));
    must(document.querySelector("#v")).dispatchEvent(
      new PointerEvent("pointerdown", { pointerId: 1, bubbles: true }),
    );
    must(document.querySelector("#h")).dispatchEvent(
      new PointerEvent("pointerdown", { pointerId: 2, bubbles: true }),
    );
    expect(viewport.style.scrollSnapType).toBe("none");
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
    // Each thumb is its own drag; the first release must not re-snap under
    // the finger still dragging the other thumb.
    expect(viewport.style.scrollSnapType).toBe("none");
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 2 }));
    expect(viewport.style.scrollSnapType).toBe("both mandatory");
  });
});

describe("ui-scroll-area scrollbar press", () => {
  it("does not let a scrollbar press move focus", async () => {
    document.body.innerHTML = `
      <ui-scroll-area>
        <ui-scroll-viewport><div></div></ui-scroll-viewport>
        <ui-scroll-scrollbar data-orientation="vertical">
          <ui-scroll-thumb></ui-scroll-thumb>
        </ui-scroll-scrollbar>
      </ui-scroll-area>`;
    await Promise.resolve(); // deferred wiring
    const bar = must(document.querySelector("ui-scroll-scrollbar"));
    const thumb = must(document.querySelector("ui-scroll-thumb"));

    // Native scrollbars never take focus. Bound on the bar, so a press that
    // lands on the thumb is covered by the same handler as one on the track.
    for (const target of [bar, thumb]) {
      const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      target.dispatchEvent(press);
      expect(press.defaultPrevented).toBe(true);
    }
  });
});
