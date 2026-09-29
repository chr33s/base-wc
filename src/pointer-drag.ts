/**
 * Pointer-drag tracking — the press / move / release dance shared by every
 * drag-driven control (`ui-slider`'s track, `ui-color-picker`'s area,
 * `ui-number-field`'s scrub strip, `ui-scroll-area`'s thumb, and — through the
 * slop/axis machine below — `ui-drawer`'s swipe and `ui-toast`'s flick). One
 * copy owns the fiddly parts each component used to hand-roll incompletely:
 * pointer capture is requested best-effort (captured events retarget to the
 * element but still reach the window, so the window listeners below track the
 * drag with or without support), move/up listeners live on `window` only while
 * a gesture is in flight, and `pointercancel` (touch interrupted by scrolling,
 * alt-tab, a system gesture) ends the drag exactly like `pointerup` instead of
 * leaving it stuck.
 *
 * The drag is latched to the `pointerId` that started it, so a second finger
 * landing mid-drag neither restarts it nor yanks the value to its coordinates.
 * The latch is self-healing: a press arriving while the latched pointer no
 * longer holds capture takes the drag over, because that combination means the
 * original `pointerup` was silently dropped — without the takeover a single
 * lost release would leave the control permanently unresponsive.
 *
 * ## Slop and axis lock
 *
 * A control that lives inside a scroller cannot claim the pointer on
 * `pointerdown`: capturing before the browser can tell a swipe from a scroll is
 * what makes a drawer or a toast feel broken on touch — flicking the content
 * drags the panel instead of scrolling it, and a 2px tremor visibly offsets it.
 * Set {@link PointerDragOptions.slop} and the press only *arms* the gesture.
 * Nothing is captured, `onCommit`/`onMove` stay silent and no scrolling is
 * suppressed until the pointer travels that far along an axis. With
 * {@link PointerDragOptions.axis} set, the first axis to clear the slop wins the
 * stroke outright: the cross axis winning means the gesture belongs to the
 * scroller, and the drag never commits. An edge-anchored surface adds
 * {@link PointerDragOptions.direction}, because for it only one *way* along
 * that axis is its own gesture at all — the other way is the page scrolling.
 */

/** Sign of travel along an axis: `1` right/down, `-1` left/up. */
export type DragDirection = 1 | -1;

/** Axis a slop-gated gesture must travel along to count as a drag. */
export type DragAxis = "x" | "y";

/** Callbacks and gates configuring one {@link trackPointerDrag} arm. */
export interface PointerDragOptions {
  /** Called with the `pointerdown`; return `false` to reject the drag (e.g. disabled). */
  onStart?: ((e: PointerEvent) => boolean | void) | undefined;
  /**
   * Called once when a slop-gated gesture is recognised as a drag, with the
   * `pointermove` that recognised it — the point to measure from, since an
   * origin at the press would carry the slop into the very first offset. Fires
   * immediately after `onStart` when there is no slop.
   */
  onCommit?: ((e: PointerEvent) => void) | undefined;
  /** Called for every `pointermove` while the drag is committed. */
  onMove: (e: PointerEvent) => void;
  /**
   * Called once when the gesture ends — `pointerup`, `pointercancel`, or
   * dispose (no event) — including a gesture that never cleared the slop, so a
   * caller that suspended something on the press always gets to restore it.
   * `committed` says whether the gesture ever became a drag.
   */
  onEnd?: ((e: PointerEvent | undefined, committed: boolean) => void) | undefined;
  /**
   * Travel (px) along an axis before the press counts as a drag rather than a
   * tap or the start of a scroll. Default `0` — the drag commits on the press.
   */
  slop?: number | undefined;
  /**
   * Restrict a slop-gated gesture to one axis: the stroke commits only if that
   * axis clears the slop first (ties go to it). Read per gesture when passed as
   * a function, so a component whose axis follows a live attribute stays
   * correct. Default: either axis commits.
   */
  axis?: DragAxis | (() => DragAxis | undefined) | undefined;
  /**
   * Which *way* along {@link PointerDragOptions.axis} counts as this control's
   * gesture: `1` for increasing coordinates (right / down), `-1` for decreasing
   * (left / up). Travel the other way is rejected exactly like a cross-axis
   * stroke. An edge-anchored panel needs this — a bottom sheet opened by
   * dragging *up* from the edge has nothing to show for a downward pull, so
   * without it the stroke that starts a page scroll instead captures the
   * pointer and cycles the panel open and shut with zero reveal. Read per
   * gesture when passed as a function. Default: either way commits.
   */
  direction?: DragDirection | (() => DragDirection | undefined) | undefined;
  /**
   * What to do when the cross axis wins the race. `"end"` (the default)
   * releases the gesture immediately, so the browser's own scrolling takes over
   * for the rest of the stroke. `"await-release"` keeps tracking the pointer
   * without ever committing, so `onEnd` runs when the finger actually lifts —
   * for a caller that suspended something at press time and wants it restored
   * then rather than mid-stroke.
   */
  crossAxis?: "end" | "await-release" | undefined;
}

/**
 * Arm `el` to start a drag on `pointerdown`. Returns a dispose that ends any
 * in-flight gesture (running `onEnd`) and detaches its window listeners — call
 * it from `disconnectedCallback`. The `pointerdown` arm-listener itself stays
 * on `el` (inert while detached, collected with the element), so a component
 * moved and re-inserted keeps working without re-wiring.
 */
export function trackPointerDrag(el: HTMLElement, options: PointerDragOptions): () => void {
  const slop = options.slop ?? 0;
  /**
   * `pending` is armed but unproven, `dragging` is committed, and `disowned` is
   * a stroke the cross axis won that is still being tracked so its release can
   * run `onEnd`.
   */
  let phase: "idle" | "pending" | "dragging" | "disowned" = "idle";
  /**
   * The pointer driving the gesture, or `null` when the press carried no
   * `pointerId` (a synthetic event, or an engine without pointer events). An
   * unidentified drag cannot filter by pointer, so it accepts every move —
   * the pre-latch behaviour, which is the right fallback when there is nothing
   * to tell pointers apart by.
   */
  let latchId: number | null = null;
  /** Whether the latched pointer's capture was actually granted. Only then does
   * a missing capture later mean the release went missing. */
  let captured = false;
  /** Where the press landed — the slop is measured from here. */
  let origin = { x: 0, y: 0 };

  /** Whether `el` still holds capture for the latched pointer; `true` when the
   * register cannot be read, so an unsupported engine never ends a live drag. */
  const holdsCapture = () => {
    try {
      return latchId === null || (el.hasPointerCapture?.(latchId) ?? true);
    } catch {
      return true;
    }
  };

  /** Whether this event belongs to the gesture in progress. */
  const isActive = (e: PointerEvent) =>
    latchId === null || e.pointerId == null || e.pointerId === latchId;

  const end = (e?: PointerEvent) => {
    if (phase === "idle") return;
    const committed = phase === "dragging";
    if (latchId !== null) {
      try {
        el.releasePointerCapture?.(latchId);
      } catch {
        /* never captured, or the pointer is already gone */
      }
    }
    phase = "idle";
    latchId = null;
    captured = false;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    options.onEnd?.(e, committed);
  };

  /** Promote the armed gesture to a real drag: take the pointer, tell the caller. */
  const commit = (e: PointerEvent) => {
    phase = "dragging";
    if (latchId !== null) {
      try {
        el.setPointerCapture?.(latchId);
        captured = holdsCapture();
      } catch {
        /* unsupported / synthetic event — window listeners track it anyway */
      }
    }
    options.onCommit?.(e);
  };

  /**
   * Decide what an armed gesture's travel means: `null` while still too small
   * to attribute, `"commit"` once the stroke is this control's, `"reject"` when
   * it belongs to whatever the control sits in. The first axis to clear the
   * slop wins outright, and losing is final — the rest of the stroke scrolls
   * natively rather than letting the control re-claim it halfway through.
   *
   * Travel is always measured from the press, never accumulated per move, so a
   * stroke that wanders and comes back is judged on where it actually got to.
   */
  const classify = (e: PointerEvent) => {
    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;
    if (Math.abs(dx) < slop && Math.abs(dy) < slop) return null;
    const wanted = options.axis instanceof Function ? options.axis() : options.axis;
    if (!wanted) return "commit";
    const along = wanted === "y" ? dy : dx;
    const across = wanted === "y" ? dx : dy;
    // Ties go to the wanted axis: a perfectly diagonal stroke is far likelier
    // to be a deliberate drag than an incidental scroll.
    if (Math.abs(across) > Math.abs(along)) return "reject";
    const sign = options.direction instanceof Function ? options.direction() : options.direction;
    return sign && Math.sign(along) !== sign ? "reject" : "commit";
  };

  // Only the pointer that started the gesture drives it — a second finger
  // landing mid-drag must not yank the value to its own coordinates.
  const onMove = (move: PointerEvent) => {
    if (!isActive(move) || phase === "disowned") return;
    if (phase === "pending") {
      const verdict = classify(move);
      if (verdict === null) return; // still ambiguous
      if (verdict === "reject") {
        if (options.crossAxis === "await-release") phase = "disowned";
        else end(move);
        return;
      }
      commit(move);
    }
    options.onMove(move);
  };
  const onUp = (up: PointerEvent) => {
    if (isActive(up)) end(up);
  };

  const onDown = (down: PointerEvent) => {
    if (phase !== "idle") {
      // A live drag holds capture for its pointer, so ignore the newcomer. No
      // capture on an identified drag means the release went missing entirely
      // (a silently dropped capture whose `pointerup` never arrives, e.g. a
      // lost touch contact); without this recovery the stale latch would reject
      // every future press and leave the control permanently dead. A gesture
      // that never obtained capture — still armed, disowned, an unidentified
      // pointer, or a refused request — has nothing to check, so it keeps the
      // old behaviour of simply ignoring the second press rather than letting
      // it steal a stroke already in flight.
      if (phase !== "dragging" || !captured || holdsCapture()) return;
      end();
    }
    if (options.onStart?.(down) === false) return;
    phase = "pending";
    latchId = down.pointerId ?? null;
    origin = { x: down.clientX, y: down.clientY };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    // No slop to clear: the press *is* the drag, so capture it right away.
    if (slop <= 0) commit(down);
  };

  el.addEventListener("pointerdown", onDown);
  return () => end();
}
