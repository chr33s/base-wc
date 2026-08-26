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
import { connectLightDom } from "./lifecycle.ts";
import { type Overlay, overlay } from "./overlay.ts";

export class UIDrawer extends HTMLElement {
  #trigger: HTMLElement | null = null;
  #popup: HTMLElement | null = null;
  #wired = false;
  #overlay: Overlay | null = null;
  #dragMode: "open" | "close" | null = null;
  #dragOrigin = 0;

  get open() {
    return this.#overlay?.open ?? false;
  }
  /** When set, suppress Escape + outside-press dismissal (same as `ui-dialog`). */
  get static() {
    return this.hasAttribute("static");
  }
  get side() {
    const s = this.getAttribute("side");
    return s === "left" || s === "top" || s === "bottom" ? s : "right";
  }
  get #horizontal() {
    return this.side === "left" || this.side === "right";
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    this.#trigger = this.querySelector<HTMLElement>("[data-drawer-trigger]");
    this.#popup = this.querySelector<HTMLElement>("ui-drawer-popup");
    if (!this.#popup) return;
    this.#wired = true;

    this.#popup.setAttribute("role", "dialog");
    this.#popup.setAttribute("aria-modal", "true");
    this.#popup.setAttribute("popover", "manual");
    this.#popup.tabIndex = -1;
    this.#popup.setAttribute("data-side", this.side);
    this.#applyOffset(0);

    this.#trigger?.addEventListener("click", () => this.#toggle());
    this.#popup.addEventListener("keydown", this.#onKeydown);
    this.#popup.addEventListener("click", (e) => {
      if ((e.target as Element).closest("[data-drawer-close]")) this.hide();
    });
    this.querySelector<HTMLElement>("[data-drawer-handle]")?.addEventListener(
      "pointerdown",
      this.#onHandleDown,
    );
    this.querySelector<HTMLElement>("[data-drawer-swipe]")?.addEventListener(
      "pointerdown",
      this.#onSwipeDown,
    );

    this.#overlay = overlay(this.#popup, {
      trigger: { element: this.#trigger, haspopup: "dialog", controls: "ui-drawer-popup" },
      modal: true,
      // The trigger is treated as inside so its own click handler owns toggling
      // instead of double-firing with dismissal.
      dismiss: {
        within: () => [this.#popup, this.#trigger],
        onDismiss: () => this.#close(),
        enabled: () => !this.static,
      },
      events: this,
    });
  }

  disconnectedCallback() {
    this.#teardown({ restoreFocus: false });
  }

  show() {
    // Wire synchronously if `show()` is called in the same task as connection,
    // before the deferred wiring microtask has run — otherwise #popup is still
    // null and the open would silently no-op.
    if (!this.#wired) this.#wire();
    if (!this.#overlay?.show()) return;
    this.#applyOffset(0);
    this.#trackKeyboard();
  }

  hide() {
    this.#close();
  }

  #toggle() {
    if (this.open) this.#close();
    else this.show();
  }

  #close() {
    this.#teardown({ restoreFocus: true });
  }

  #teardown({ restoreFocus }: { restoreFocus: boolean }) {
    if (!this.#overlay?.open) return;
    this.#endDrag();
    this.#untrackKeyboard();
    this.#applyOffset(0);
    this.#overlay.hide({ restoreFocus });
  }

  #onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !this.static) {
      e.preventDefault();
      this.#close();
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
    const raw = pos - this.#dragOrigin;
    return this.side === "right" || this.side === "bottom" ? raw : -raw;
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
    const sign = this.side === "right" || this.side === "bottom" ? 1 : -1;
    const axis = this.#horizontal ? "X" : "Y";
    this.#popup.style.transform = distance > 0 ? `translate${axis}(${sign * distance}px)` : "";
  }

  #beginDrag(mode: "open" | "close", e: PointerEvent) {
    this.#dragMode = mode;
    this.#dragOrigin = this.#horizontal ? e.clientX : e.clientY;
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    window.addEventListener("pointermove", this.#onPointerMove);
    window.addEventListener("pointerup", this.#onPointerUp);
    window.addEventListener("pointercancel", this.#onPointerCancel);
  }

  #endDrag() {
    if (!this.#dragMode) return;
    this.#dragMode = null;
    window.removeEventListener("pointermove", this.#onPointerMove);
    window.removeEventListener("pointerup", this.#onPointerUp);
    window.removeEventListener("pointercancel", this.#onPointerCancel);
  }

  // Drag the in-panel handle toward the edge to dismiss.
  #onHandleDown = (e: PointerEvent) => {
    if (!this.open) return;
    this.#beginDrag("close", e);
  };

  // Drag inward from the edge swipe zone to reveal + open.
  #onSwipeDown = (e: PointerEvent) => {
    if (this.open) return;
    this.show(); // present in the top layer…
    this.#applyOffset(this.#size()); // …starting fully off-screen, then reveal on drag
    this.#beginDrag("open", e);
  };

  #onPointerMove = (e: PointerEvent) => {
    if (this.#dragMode === "close") {
      this.#applyOffset(this.#closingDistance(e.clientX, e.clientY));
    } else if (this.#dragMode === "open") {
      const revealed = Math.min(this.#openingDistance(e.clientX, e.clientY), this.#size());
      this.#applyOffset(this.#size() - revealed);
    }
  };

  #onPointerUp = (e: PointerEvent) => {
    const mode = this.#dragMode;
    if (!mode) return;
    this.#endDrag();
    const threshold = this.#size() * 0.4;
    if (mode === "close") {
      if (this.#closingDistance(e.clientX, e.clientY) > threshold) this.#close();
      else this.#applyOffset(0); // snap back open
    } else {
      if (this.#openingDistance(e.clientX, e.clientY) > threshold)
        this.#applyOffset(0); // commit open
      else this.#close(); // abort — dismiss
    }
  };

  // A cancelled pointer (native scroll takeover, system gesture) replaces
  // pointerup on a captured pointer, so end the drag here too or its window
  // listeners leak and the drawer stays stuck to the stale drag origin. There
  // is no meaningful end position, so return to the last committed state.
  #onPointerCancel = () => {
    const mode = this.#dragMode;
    if (!mode) return;
    this.#endDrag();
    if (mode === "close")
      this.#applyOffset(0); // stay open, snap back
    else this.#close(); // opening never committed — dismiss
  };

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

export class UIDrawerPopup extends HTMLElement {}
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
