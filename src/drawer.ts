/**
 * `ui-drawer` — an edge-anchored modal panel with swipe-to-dismiss (Base UI's
 * Drawer). Composes the same {@link overlay} `modal` mode as `ui-dialog`
 * (Popover top layer, {@link trapFocus}, {@link lockScroll}, outside-press
 * dismissal) and adds only its drag gesture and keyboard-inset logic: pulling
 * the drawer toward its edge past a threshold closes it, otherwise it snaps
 * back. `role="dialog"` + `aria-modal="true"`; the `side` attribute
 * (`left`/`right`/`top`/`bottom`, default `right`) is reflected as `data-side`
 * and the live drag fraction is exposed as `--drawer-offset` (0–1).
 *
 * Markup: a `[data-drawer-trigger]`, an optional `<ui-drawer-backdrop>`, a
 * `<ui-drawer-popup>` and — to enable swipe — a `[data-drawer-handle]` inside
 * it (drag toward the edge to dismiss). A `[data-drawer-swipe]` edge zone
 * (present while closed) is the inverse: dragging inward from it reveals and
 * opens the drawer. `[data-drawer-close]` elements close on click. Like
 * `ui-dialog`, a `static` drawer suppresses Escape + outside-press dismissal
 * and closes only through an explicit in-drawer action.
 *
 * While open the drawer tracks the visual viewport and publishes
 * `--drawer-keyboard-inset` (the px an on-screen keyboard overlaps the layout
 * viewport) so a `bottom` drawer can lift its content above the keyboard.
 */
import { define } from "./define.ts";
import { closestFrom } from "./internal/closest.ts";
import { UIModalPopupElement } from "./popup.ts";
import { LightDomElement } from "./lifecycle.ts";
import { type Overlay, overlay } from "./overlay.ts";
import type { ChangeReason } from "./reasons.ts";
import { type DragDirection, type PointerDragOptions, trackPointerDrag } from "./pointer-drag.ts";

/**
 * Pointer travel (px) before a press is treated as a drag rather than a tap or
 * the start of a scroll. Roughly the platform touch slop — small enough that a
 * deliberate swipe feels immediate, large enough that a tap with a shaky finger
 * does not visibly move the panel.
 */
const SWIPE_SLOP = 8;

/** Edge-anchored modal sheet that opens from a side and can be dragged closed (or swiped open from its edge). */
export class UIDrawer extends LightDomElement {
  #trigger: HTMLElement | null = null;
  #popup: HTMLElement | null = null;
  #overlay: Overlay | null = null;
  /**
   * Origin of the committed drag along the drawer's axis. Each direction gets
   * its own tracker, and their `onStart` guards are mutually exclusive on
   * `open`, so only one is ever live to write it.
   */
  #dragOrigin = 0;
  #disposeHandleDrag: (() => void) | null = null;
  #disposeSwipeDrag: (() => void) | null = null;

  /** Whether the drawer is currently open. */
  get open(): boolean {
    return this.#overlay?.open ?? false;
  }
  /** When set, suppress Escape + outside-press dismissal (same as `ui-dialog`). */
  get static() {
    return this.hasAttribute("static");
  }
  /** Edge the drawer slides from; unknown values fall back to `"right"`. */
  get side(): "left" | "right" | "top" | "bottom" {
    const s = this.getAttribute("side");
    return s === "left" || s === "top" || s === "bottom" ? s : "right";
  }
  get #horizontal() {
    return this.side === "left" || this.side === "right";
  }
  /**
   * Which way along the drawer's axis points *at* its edge — the direction that
   * closes it, and the opposite of the one that opens it. `1` for `right` and
   * `bottom` (increasing coordinates), `-1` for `left` and `top`.
   */
  get #closingSign(): DragDirection {
    return this.side === "right" || this.side === "bottom" ? 1 : -1;
  }

  protected override initialize() {
    this.#trigger = this.querySelector<HTMLElement>("[data-drawer-trigger]");
    this.#popup = this.querySelector<HTMLElement>("ui-drawer-popup");
    if (!this.#popup) return false;

    // role/aria-modal/popover/tabindex come from `UIDrawerPopup` itself.
    this.#popup.setAttribute("data-side", this.side);
    this.#applyOffset(0);

    this.#trigger?.addEventListener("click", () => this.#toggle());
    this.#popup.addEventListener("keydown", this.#onKeydown);
    this.#popup.addEventListener("click", (e) => {
      if (closestFrom(e, "[data-drawer-close]")) this.hide("close-press");
    });
    // Drag the in-panel handle toward the edge to dismiss; drag inward from the
    // edge swipe zone to reveal and open. Both are the shared slop/axis-locked
    // {@link trackPointerDrag}, so a stroke that turns out to be a scroll is
    // handed back to the browser and an interrupted touch still ends the drag.
    const handle = this.querySelector<HTMLElement>("[data-drawer-handle]");
    if (handle)
      this.#disposeHandleDrag = trackPointerDrag(handle, this.#dragOptions("close", handle));
    const swipe = this.querySelector<HTMLElement>("[data-drawer-swipe]");
    if (swipe) this.#disposeSwipeDrag = trackPointerDrag(swipe, this.#dragOptions("open"));

    this.#overlay = overlay(this.#popup, {
      trigger: { element: this.#trigger, haspopup: "dialog", controls: "ui-drawer-popup" },
      modal: true,
      // The trigger is treated as inside so its own click handler owns toggling
      // instead of double-firing with dismissal.
      dismiss: {
        within: () => [this.#popup, this.#trigger],
        onDismiss: () => this.#close("outside-press"),
        enabled: () => !this.static,
      },
      events: this,
    });
    return true;
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#teardown({ restoreFocus: false });
    // `#teardown` bails on a closed drawer, so end the gestures explicitly:
    // a press armed on the edge swipe zone would otherwise leave its window
    // listeners attached to a drawer that is no longer in the document.
    this.#endDrag();
  }

  /** Open the drawer, tagging the resulting event with `reason`. */
  show(reason: ChangeReason = "none"): void {
    // Wire synchronously if `show()` is called in the same task as connection,
    // before the deferred wiring microtask has run — otherwise #popup is still
    // null and the open would silently no-op.
    this.ensureInitialized();
    if (!this.#overlay?.show(reason)) return;
    this.#applyOffset(0);
    this.#trackKeyboard();
  }

  /** Close the drawer, tagging the resulting event with `reason`. */
  hide(reason: ChangeReason = "none"): void {
    this.#close(reason);
  }

  #toggle() {
    if (this.open) this.#close("trigger-press");
    else this.show("trigger-press");
  }

  #close(reason: ChangeReason = "none") {
    this.#teardown({ restoreFocus: true, reason });
  }

  #teardown({ restoreFocus, reason = "none" }: { restoreFocus: boolean; reason?: ChangeReason }) {
    if (!this.#overlay?.open) return;
    this.#endDrag();
    this.#untrackKeyboard();
    this.#applyOffset(0);
    this.#overlay.hide({ restoreFocus, reason });
  }

  #onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !this.static) {
      e.preventDefault();
      this.#close("escape-key");
    }
  };

  // ---- swipe gestures --------------------------------------------------
  #size() {
    if (!this.#popup) return 0;
    return this.#horizontal ? this.#popup.offsetWidth : this.#popup.offsetHeight;
  }

  // Signed drag distance along the drawer's axis: positive toward the edge
  // (closing), negative inward (opening). right/bottom close on positive
  // movement; left/top on negative.
  #closingDistanceRaw(x: number, y: number) {
    const pos = this.#horizontal ? x : y;
    return (pos - this.#dragOrigin) * this.#closingSign;
  }

  /** Distance (px) dragged toward the edge — closes the drawer. Clamped ≥ 0. */
  #closingDistance(x: number, y: number) {
    return Math.max(0, this.#closingDistanceRaw(x, y));
  }

  /** Distance (px) dragged inward from the edge — reveals the drawer. */
  #openingDistance(x: number, y: number) {
    return Math.max(0, -this.#closingDistanceRaw(x, y));
  }

  #applyOffset(distance: number) {
    if (!this.#popup) return;
    const size = this.#size() || 1;
    this.style.setProperty("--drawer-offset", String(Math.min(distance / size, 1)));
    const sign = this.#closingSign;
    const axis = this.#horizontal ? "X" : "Y";
    this.#popup.style.transform = distance > 0 ? `translate${axis}(${sign * distance}px)` : "";
  }

  /**
   * The gesture wiring for one direction. Nothing is captured, nothing moves
   * and no scrolling is suppressed until the pointer travels {@link SWIPE_SLOP}
   * px *along the drawer's own axis* — the slop/axis lock lives in
   * {@link trackPointerDrag}, and this only says which axis counts and what to
   * do at each stage. Axis *and* direction are read per gesture rather than
   * baked in, so a `side` flipped at runtime is respected. Only travel the
   * drawer's own way counts: a bottom sheet has nothing to reveal for a
   * downward pull, and committing to one would capture the pointer, swallow the
   * page scroll the user actually started, and cycle the panel open and shut
   * with nothing on screen. Losing the slop race — wrong axis or wrong way —
   * ends the gesture outright, handing the rest of the stroke back to native
   * scrolling.
   */
  #dragOptions(mode: "open" | "close", handle?: HTMLElement): PointerDragOptions {
    return {
      slop: SWIPE_SLOP,
      axis: () => (this.#horizontal ? "x" : "y"),
      // Closing pulls toward the edge; opening reveals away from it.
      direction: () => (mode === "close" ? this.#closingSign : this.#closingSign === 1 ? -1 : 1),
      onStart: (e) => {
        if (mode === "close")
          return this.open && !(handle && this.#startedOnScroller(e.target, handle));
        return !this.open;
      },
      onCommit: (e) => {
        // Measure from where the gesture was *recognised*, not from the press.
        // An origin at the press would carry the slop into the very first
        // offset, so the panel would jump the width of the slop the instant it
        // took over.
        this.#dragOrigin = this.#horizontal ? e.clientX : e.clientY;
        if (mode === "open") {
          this.show(); // present in the top layer…
          this.#applyOffset(this.#size()); // …starting fully off-screen, then reveal on drag
        }
      },
      onMove: (e) => {
        if (mode === "close") {
          this.#applyOffset(this.#closingDistance(e.clientX, e.clientY));
        } else {
          const revealed = Math.min(this.#openingDistance(e.clientX, e.clientY), this.#size());
          this.#applyOffset(this.#size() - revealed);
        }
      },
      onEnd: (e, committed) => {
        // A gesture that never committed moved nothing, so there is nothing to
        // settle. Neither is there for a dispose (`#teardown`, disconnect),
        // which owns the resting state itself — and settling here would
        // re-enter `#close()` from inside the teardown that called it.
        if (!committed || !e) return;
        // A cancelled pointer (native scroll takeover, system gesture) replaces
        // `pointerup` on a captured pointer and carries no meaningful end
        // position, so return to the last committed state instead of measuring
        // it against the threshold.
        if (e.type === "pointercancel") {
          if (mode === "close")
            this.#applyOffset(0); // stay open, snap back
          else this.#close("swipe"); // opening never committed — dismiss
          return;
        }
        const threshold = this.#size() * 0.4;
        if (mode === "close") {
          if (this.#closingDistance(e.clientX, e.clientY) > threshold) this.#close("swipe");
          else this.#applyOffset(0); // snap back open
        } else {
          if (this.#openingDistance(e.clientX, e.clientY) > threshold)
            this.#applyOffset(0); // commit open
          else this.#close(); // abort — dismiss
        }
      },
    };
  }

  /** End whichever gesture is in flight, leaving the resting state to the caller. */
  #endDrag() {
    this.#disposeHandleDrag?.();
    this.#disposeSwipeDrag?.();
  }

  /**
   * Whether the press landed on something *inside the handle* that can still
   * scroll in the drawer's own axis. A handle that wraps the content (the
   * whole sheet as the grip) routinely contains a scroller, and a scroller
   * that has somewhere left to go owns the gesture — otherwise the first
   * upward flick in a half-scrolled bottom sheet dismisses it instead of
   * scrolling the list. The walk stops at the handle: what scrolls *around* a
   * dedicated grip is not the grip's business, or a sticky handle at the top
   * of a scrolled popup would go dead until scrolled back to the edge.
   */
  #startedOnScroller(target: EventTarget | null, handle: Element) {
    let node = target instanceof Element ? target : null;
    while (node && node !== handle.parentElement) {
      if (node instanceof HTMLElement) {
        const style = getComputedStyle?.(node);
        const overflow = this.#horizontal ? style?.overflowX : style?.overflowY;
        const scrollable = overflow === "auto" || overflow === "scroll";
        const pos = this.#horizontal ? node.scrollLeft : node.scrollTop;
        const max = this.#horizontal
          ? node.scrollWidth - node.clientWidth
          : node.scrollHeight - node.clientHeight;
        // Only a scroller with room left in the closing direction claims the
        // gesture; one already pinned at that edge hands it back to the drawer,
        // which is what makes "scroll to the top, then keep pulling to dismiss"
        // work as a single continuous motion.
        if (scrollable && max > 0) {
          if (this.#closingSign === 1 ? pos > 0 : pos < max) return true;
        }
      }
      if (node === handle) break;
      node = node.parentElement;
    }
    return false;
  }

  // ---- virtual keyboard avoidance --------------------------------------
  #onViewportResize = () => {
    const vv = window.visualViewport;
    if (!vv) return;
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    this.style.setProperty("--drawer-keyboard-inset", `${Math.round(inset)}px`);
  };
  #trackKeyboard() {
    const vv = window.visualViewport;
    if (!vv) return;
    this.#onViewportResize();
    vv.addEventListener("resize", this.#onViewportResize);
    vv.addEventListener("scroll", this.#onViewportResize);
  }
  #untrackKeyboard() {
    const vv = window.visualViewport;
    vv?.removeEventListener("resize", this.#onViewportResize);
    vv?.removeEventListener("scroll", this.#onViewportResize);
    this.style.removeProperty("--drawer-keyboard-inset");
  }
}

/** The drawer's top-layer sheet (`role=dialog`, focus-trapped). */
export class UIDrawerPopup extends UIModalPopupElement {}
/** Dimming layer behind the drawer popup. */
export class UIDrawerBackdrop extends HTMLElement {}

define("ui-drawer", UIDrawer);
define("ui-drawer-popup", UIDrawerPopup);
define("ui-drawer-backdrop", UIDrawerBackdrop);

declare global {
  interface HTMLElementTagNameMap {
    "ui-drawer": UIDrawer;
    "ui-drawer-popup": UIDrawerPopup;
    "ui-drawer-backdrop": UIDrawerBackdrop;
  }
}
