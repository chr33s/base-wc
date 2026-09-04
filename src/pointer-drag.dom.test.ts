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

describe("trackPointerDrag — pointer latching", () => {
  const downWith = (el: HTMLElement, pointerId: number) =>
    el.dispatchEvent(new PointerEvent("pointerdown", { pointerId, bubbles: true }));
  const moveWith = (pointerId: number) =>
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId }));
  const upWith = (pointerId: number) =>
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId }));

  /** Stand in for a real capture register, which happy-dom does not implement. */
  function withCapture(el: HTMLElement) {
    const held = new Set<number>();
    el.setPointerCapture = (id: number) => void held.add(id);
    el.releasePointerCapture = (id: number) => void held.delete(id);
    el.hasPointerCapture = (id: number) => held.has(id);
    return held;
  }

  it("ignores a second pointer's moves while one drag is live", () => {
    const { el, onMove, onEnd } = mount();
    withCapture(el);
    downWith(el, 1);
    downWith(el, 2); // a second finger lands mid-drag
    expect(onEnd).not.toHaveBeenCalled(); // the live drag is untouched
    moveWith(2); // …and does not get to drive it
    expect(onMove).not.toHaveBeenCalled();
    moveWith(1);
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it("ignores a second pointer's release, so the drag survives it", () => {
    const { el, onMove, onEnd } = mount();
    withCapture(el);
    downWith(el, 1);
    upWith(2);
    expect(onEnd).not.toHaveBeenCalled();
    moveWith(1);
    expect(onMove).toHaveBeenCalledTimes(1);
    upWith(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("recovers when the release goes missing, instead of latching dead forever", () => {
    const { el, onStart, onMove, onEnd } = mount();
    const held = withCapture(el);
    downWith(el, 1);
    // The capture is silently dropped and pointerup for id 1 never arrives —
    // a lost touch contact. Without recovery the stale latch would reject every
    // future press and leave the control permanently unresponsive.
    held.clear();
    downWith(el, 2);
    expect(onEnd).toHaveBeenCalledTimes(1); // the stale drag is closed out
    expect(onStart).toHaveBeenCalledTimes(2); // and the newcomer takes over
    moveWith(2);
    expect(onMove).toHaveBeenCalledTimes(1);
  });
});

describe("trackPointerDrag — events without a pointerId", () => {
  it("accepts every move and ignores a second press, as before the latch", () => {
    const { el, onStart, onMove, onEnd } = mount();
    el.hasPointerCapture = () => false; // nothing to check against
    down(el); // a synthetic Event: no pointerId to latch onto
    down(el); // must not steal the drag — there is no id to prove it is stale
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();
    move();
    expect(onMove).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("pointerup"));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("still ignores a second pointer when capture was never granted", () => {
    const { el, onStart, onEnd } = mount();
    // Capture refused (or thrown): the drag runs uncaptured on the window
    // listeners. A missing capture then says nothing about a lost release, so
    // the newcomer must not be allowed to end and restart the live drag.
    el.setPointerCapture = () => {
      throw new DOMException("refused", "InvalidStateError");
    };
    el.hasPointerCapture = () => false;
    const downWith = (id: number) =>
      el.dispatchEvent(new PointerEvent("pointerdown", { pointerId: id, bubbles: true }));
    downWith(1);
    downWith(2);
    expect(onEnd).not.toHaveBeenCalled();
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe("trackPointerDrag — slop and axis lock", () => {
  const press = (el: HTMLElement, x: number, y: number) =>
    el.dispatchEvent(
      new PointerEvent("pointerdown", { pointerId: 1, bubbles: true, clientX: x, clientY: y }),
    );
  const drag = (x: number, y: number) =>
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: x, clientY: y }));
  const release = (x: number, y: number) =>
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: x, clientY: y }));

  function armed(extra: Partial<Parameters<typeof trackPointerDrag>[1]> = {}) {
    const el = document.createElement("div");
    document.body.append(el);
    const onCommit = vi.fn<(e: PointerEvent) => void>();
    const onMove = vi.fn<(e: PointerEvent) => void>();
    const onEnd = vi.fn<(e: PointerEvent | undefined, committed: boolean) => void>();
    const dispose = trackPointerDrag(el, { slop: 8, axis: "x", onCommit, onMove, onEnd, ...extra });
    return { el, onCommit, onMove, onEnd, dispose };
  }

  it("stays silent until the pointer clears the slop", () => {
    const { el, onCommit, onMove } = armed();
    press(el, 0, 0);
    drag(5, 0); // a tap with a shaky finger — still ambiguous
    expect(onCommit).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
    drag(20, 0);
    expect(onCommit).toHaveBeenCalledTimes(1);
    // The recognising move drives the first offset too, so the drag does not
    // wait an extra frame to respond.
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it("hands the stroke back when the cross axis wins the race", () => {
    const { el, onCommit, onMove, onEnd } = armed();
    press(el, 0, 0);
    drag(2, 20); // a scroll, not a swipe
    expect(onCommit).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledWith(expect.anything(), false);
    // Losing is final: the rest of the stroke scrolls natively rather than the
    // control re-claiming it once the finger drifts sideways again.
    drag(200, 20);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("keeps tracking a rejected stroke until release with await-release", () => {
    const { el, onMove, onEnd } = armed({ crossAxis: "await-release" });
    press(el, 0, 0);
    drag(2, 20);
    expect(onEnd).not.toHaveBeenCalled(); // the finger is still down
    drag(200, 20);
    expect(onMove).not.toHaveBeenCalled(); // …but it never becomes a drag
    release(200, 20);
    expect(onEnd).toHaveBeenCalledWith(expect.anything(), false);
  });

  it("reports an uncommitted release, so a caller can restore what the press suspended", () => {
    const { el, onEnd } = armed();
    press(el, 0, 0);
    release(0, 0); // a tap
    expect(onEnd).toHaveBeenCalledWith(expect.anything(), false);
  });

  it("rejects travel the wrong way along the axis", () => {
    const { el, onCommit, onMove, onEnd } = armed({ direction: -1 });
    press(el, 100, 0);
    drag(140, 0); // right, when only leftward travel is this control's gesture
    expect(onCommit).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledWith(expect.anything(), false);
    // Wrong way is as final as wrong axis: the rest of the stroke is the
    // scroller's, even once the finger doubles back.
    drag(20, 0);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("judges direction on total travel from the press, not on the last move", () => {
    const { el, onCommit } = armed({ direction: -1 });
    press(el, 100, 0);
    drag(103, 0); // a 3px wobble the wrong way — still under the slop
    expect(onCommit).not.toHaveBeenCalled();
    drag(80, 0); // net travel is 20px left, so the stroke is ours after all
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("reads a function axis per gesture, so a live orientation is respected", () => {
    let axis: "x" | "y" = "x";
    const { el, onCommit } = armed({ axis: () => axis });
    press(el, 0, 0);
    drag(0, 20); // vertical travel loses against a horizontal lock
    expect(onCommit).not.toHaveBeenCalled();
    axis = "y";
    press(el, 0, 0);
    drag(0, 20);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("takes no capture while a gesture is only armed", () => {
    const { el } = armed();
    const held = new Set<number>();
    el.setPointerCapture = (id: number) => void held.add(id);
    el.hasPointerCapture = (id: number) => held.has(id);
    press(el, 0, 0);
    drag(3, 0);
    // Capturing before the browser can tell a swipe from a scroll is what makes
    // a panel inside a scroller feel broken on touch.
    expect(held.size).toBe(0);
    drag(20, 0);
    expect(held.has(1)).toBe(true);
  });
});
