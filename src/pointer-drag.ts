/**
 * Pointer-drag tracking — the press / move / release dance shared by every
 * drag-driven control (`ui-slider`'s track, `ui-color-picker`'s area,
 * `ui-number-field`'s scrub strip). One copy owns the fiddly parts each
 * component used to hand-roll incompletely: pointer capture is requested
 * best-effort (captured events retarget to the element but still reach the
 * window, so the window listeners below track the drag with or without
 * support), move/up listeners live on `window` only while a drag is active,
 * and `pointercancel` (touch interrupted by scrolling, alt-tab, a system
 * gesture) ends the drag exactly like `pointerup` instead of leaving it stuck.
 */

export interface PointerDragHandlers {
  /** Called with the `pointerdown`; return `false` to reject the drag (e.g. disabled). */
  onStart?: (e: PointerEvent) => boolean | void;
  /** Called for every `pointermove` while the drag is active. */
  onMove: (e: PointerEvent) => void;
  /** Called once when the drag ends — `pointerup`, `pointercancel`, or dispose (no event). */
  onEnd?: (e?: PointerEvent) => void;
}

/**
 * Arm `el` to start a drag on `pointerdown`. Returns a dispose that ends any
 * in-flight drag (running `onEnd`) and detaches its window listeners — call it
 * from `disconnectedCallback`. The `pointerdown` arm-listener itself stays on
 * `el` (inert while detached, collected with the element), so a component
 * moved and re-inserted keeps working without re-wiring.
 */
export function trackPointerDrag(el: HTMLElement, handlers: PointerDragHandlers) {
  let dragging = false;

  const end = (e?: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    window.removeEventListener("pointermove", handlers.onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    handlers.onEnd?.(e);
  };
  const onUp = (e: Event) => end(e as PointerEvent);

  const onDown = (e: Event) => {
    if (dragging) return; // a second pointer must not restart the drag
    const down = e as PointerEvent;
    if (handlers.onStart?.(down) === false) return;
    dragging = true;
    if (down.pointerId != null) {
      try {
        el.setPointerCapture?.(down.pointerId);
      } catch {
        /* unsupported / synthetic event — window listeners track it anyway */
      }
    }
    window.addEventListener("pointermove", handlers.onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  el.addEventListener("pointerdown", onDown);
  return () => end();
}
