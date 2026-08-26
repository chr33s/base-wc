// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { trackPointerDrag } from "./pointer-drag.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

const down = (el: HTMLElement) =>
  el.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
const move = () => window.dispatchEvent(new Event("pointermove"));

function mount() {
  const el = document.createElement("div");
  document.body.append(el);
  const onStart = vi.fn<(e: PointerEvent) => boolean | void>();
  const onMove = vi.fn<(e: PointerEvent) => void>();
  const onEnd = vi.fn<(e?: PointerEvent) => void>();
  const dispose = trackPointerDrag(el, { onStart, onMove, onEnd });
  return { el, onStart, onMove, onEnd, dispose };
}

describe("trackPointerDrag", () => {
  it("tracks pointerdown → window moves → pointerup", () => {
    const { el, onStart, onMove, onEnd } = mount();
    move(); // not dragging yet — ignored
    expect(onMove).not.toHaveBeenCalled();
    down(el);
    expect(onStart).toHaveBeenCalledTimes(1);
    move();
    move();
    expect(onMove).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event("pointerup"));
    expect(onEnd).toHaveBeenCalledTimes(1);
    move(); // drag over — ignored
    expect(onMove).toHaveBeenCalledTimes(2);
  });

  it("ends the drag on pointercancel (interrupted touch)", () => {
    const { el, onMove, onEnd } = mount();
    down(el);
    window.dispatchEvent(new Event("pointercancel"));
    expect(onEnd).toHaveBeenCalledTimes(1);
    move();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("rejects the drag when onStart returns false", () => {
    const { el, onStart, onMove, onEnd } = mount();
    onStart.mockReturnValue(false);
    down(el);
    move();
    window.dispatchEvent(new Event("pointerup"));
    expect(onMove).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("dispose ends an in-flight drag (disconnectedCallback cleanup)", () => {
    const { el, onMove, onEnd, dispose } = mount();
    down(el);
    dispose();
    expect(onEnd).toHaveBeenCalledTimes(1);
    move();
    expect(onMove).not.toHaveBeenCalled();
    dispose(); // idempotent
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
