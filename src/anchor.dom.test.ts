// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import { anchor } from "./anchor.ts";
import { must } from "./test-utils.ts";

const original = Object.getOwnPropertyDescriptor(window, "visualViewport");

afterEach(() => {
  document.body.innerHTML = "";
  if (original) Object.defineProperty(window, "visualViewport", original);
  else delete (window as { visualViewport?: unknown }).visualViewport;
});

/** Stand in for the visual viewport, which happy-dom does not implement. */
function fakeViewport(props: { scale: number; width: number; height: number; offsetTop: number }) {
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: { ...props, offsetLeft: 0, addEventListener() {}, removeEventListener() {} },
  });
}

function mount() {
  document.body.innerHTML = `<button id="ref">ref</button><div id="pop">pop</div>`;
  const reference = must(document.querySelector<HTMLElement>("#ref"));
  const floating = must(document.querySelector<HTMLElement>("#pop"));
  // happy-dom reports a zero rect; give the reference a definite one so the
  // placement arithmetic has something real to work with.
  reference.getBoundingClientRect = () =>
    ({ x: 0, y: 100, top: 100, left: 0, right: 50, bottom: 120, width: 50, height: 20 }) as DOMRect;
  return { reference, floating };
}

describe("anchor — pinch zoom", () => {
  it("tracks the visual viewport at scale 1 (URL bar, on-screen keyboard)", () => {
    fakeViewport({ scale: 1, width: 400, height: 300, offsetTop: 200 });
    const { reference, floating } = mount();
    const stop = anchor(reference, floating, { offset: 6, padding: 8 });
    // Clamped into the visible slice, which at scale 1 is exactly the part of
    // the page not covered by browser chrome or the on-screen keyboard.
    expect(floating.style.top).toBe("208px"); // viewport top (200) + padding
    stop();
  });

  it("ignores the visual viewport while the page is pinch-zoomed", () => {
    fakeViewport({ scale: 2.5, width: 400, height: 300, offsetTop: 200 });
    const { reference, floating } = mount();
    const stop = anchor(reference, floating, { offset: 6, padding: 8 });
    // Zoomed in, the visual viewport is the user's own pan window. Clamping
    // into it would drag the popup around under their fingers as they pan, so
    // the layout viewport wins and the popup simply sits below its reference.
    expect(floating.style.top).toBe("126px"); // reference bottom (120) + offset
    stop();
  });
});
