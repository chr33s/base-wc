/**
 * `ui-toast` / `ui-toast-viewport` — transient notifications (Base UI's Toast)
 * with a **Sonner-style stack**.
 *
 * A `<ui-toast-viewport>` is a top-layer live region (`role=region`, lifted via
 * the Popover API so it floats above dialogs and stacking contexts). It is also
 * the **manager**: `add()` builds and enqueues a toast, `dismiss(id)` / `clear()`
 * remove them, and the module-level {@link toast} helper targets the first
 * viewport in the document.
 *
 * **Stacking.** The newest toast sits in front; older ones collapse behind it,
 * each peeking out a little and scaled down, with everything past `visible`
 * (default 3) faded out. Pointer-hovering or focusing the viewport **expands** the
 * stack into a full, readable list (and pauses every auto-dismiss timer); leaving
 * collapses it again. The viewport computes the geometry as CSS custom properties
 * on each toast — `--index` (0 = front), `--z`, `--offset` (its expanded resting
 * position) — plus `--front-height` / `--stack-height` on itself, and toggles
 * `data-front` / `data-hidden` / `data-expanded` / `data-position`. Consumer CSS
 * turns those into the `translateY`/`scale` transforms (see `styles.css`), the
 * same headless split used for anchor positioning.
 *
 * A `<ui-toast>` is one notification. It announces itself (`role=status` /
 * `alert` from `data-type`, with a matching `aria-live`), auto-dismisses after
 * its `duration` (pausing on hover/focus), closes on a `[data-toast-close]` click
 * (a `[data-toast-action]` click fires an `action` event then closes), and can be
 * flicked away horizontally (swipe-to-dismiss). Exit is deferred via
 * {@link runExit} so a CSS `[data-state]` animation plays.
 *
 * Toasts can be authored declaratively (markup with `[data-toast-title]` /
 * `[data-toast-description]` / `[data-toast-action]` / `[data-toast-close]`) or
 * created through the manager.
 */
import { nextId } from "./id.ts";
import { runExit, setOpenState } from "./transitions.ts";

/** Options for {@link UIToastViewport.add} / {@link toast}. */
export interface ToastOptions {
  /** Bold heading line. */
  title?: string;
  /** Secondary body line. */
  description?: string;
  /** Severity — `error`/`warning` announce assertively (`role=alert`). */
  type?: "info" | "success" | "warning" | "error";
  /** Auto-dismiss delay in ms; `0` keeps it until dismissed. Default 5000. */
  duration?: number;
  /** Label for an action button; clicking it fires an `action` event. */
  action?: string;
  /** Stable id (for {@link UIToastViewport.dismiss}); auto-generated otherwise. */
  id?: string;
}

const DEFAULT_DURATION = 5000;
/** Horizontal travel (px) past which a swipe dismisses instead of snapping back. */
const SWIPE_THRESHOLD = 100;

/** A single notification. Owns its auto-dismiss timer, close/action and swipe. */
export class UIToast extends HTMLElement {
  #timer = 0;
  #swipeStartX = 0;
  #swiping = false;

  /** Auto-dismiss delay in ms (`0` = sticky). */
  get duration(): number {
    const d = Number(this.getAttribute("duration") ?? DEFAULT_DURATION);
    return Number.isFinite(d) ? d : DEFAULT_DURATION;
  }

  connectedCallback() {
    const assertive = this.dataset.type === "error" || this.dataset.type === "warning";
    if (!this.getAttribute("role")) this.setAttribute("role", assertive ? "alert" : "status");
    if (!this.hasAttribute("aria-live"))
      this.setAttribute(
        "aria-live",
        this.getAttribute("role") === "alert" ? "assertive" : "polite",
      );
    this.setAttribute("aria-atomic", "true");

    // Label/describe from the title/description parts for assistive tech.
    const title = this.querySelector("[data-toast-title]");
    const description = this.querySelector("[data-toast-description]");
    if (title) {
      if (!title.id) title.id = nextId("ui-toast-title");
      this.setAttribute("aria-labelledby", title.id);
    }
    if (description) {
      if (!description.id) description.id = nextId("ui-toast-description");
      this.setAttribute("aria-describedby", description.id);
    }

    this.setAttribute("data-open", "");
    setOpenState(this, true);
    this.addEventListener("click", this.#onClick);
    this.addEventListener("pointerenter", this.pause);
    this.addEventListener("pointerleave", this.resume);
    this.addEventListener("focusin", this.pause);
    this.addEventListener("focusout", this.resume);
    this.addEventListener("pointerdown", this.#onSwipeStart);
    this.#start();
  }

  disconnectedCallback() {
    clearTimeout(this.#timer);
  }

  #start() {
    const d = this.duration;
    if (d > 0) this.#timer = window.setTimeout(() => this.close(), d);
  }
  /** Pause the auto-dismiss timer (hover/focus, or the whole stack expanding). */
  pause = () => clearTimeout(this.#timer);
  /** Resume the auto-dismiss timer from the start. */
  resume = () => {
    if (this.#swiping || this.#viewportExpanded()) return; // don't restart mid-swipe/stack interaction
    clearTimeout(this.#timer);
    this.#start();
  };

  #viewportExpanded() {
    return this.parentElement?.closest("ui-toast-viewport")?.hasAttribute("data-expanded") ?? false;
  }

  #onClick = (e: MouseEvent) => {
    const target = e.target as Element;
    if (target.closest("[data-toast-close]")) {
      this.close();
    } else if (target.closest("[data-toast-action]")) {
      this.dispatchEvent(new CustomEvent("action", { bubbles: true, detail: { id: this.id } }));
      this.close();
    }
  };

  // ---- swipe-to-dismiss (horizontal flick) ------------------------------
  #onSwipeStart = (e: PointerEvent) => {
    if (e.button !== 0) return;
    // Let the action/close buttons handle their own clicks.
    if ((e.target as Element).closest("[data-toast-close],[data-toast-action]")) return;
    this.#swiping = true;
    this.#swipeStartX = e.clientX;
    this.pause();
    this.setPointerCapture?.(e.pointerId);
    this.addEventListener("pointermove", this.#onSwipeMove);
    this.addEventListener("pointerup", this.#onSwipeEnd);
  };

  #onSwipeMove = (e: PointerEvent) => {
    if (!this.#swiping) return;
    const dx = e.clientX - this.#swipeStartX;
    this.setAttribute("data-swiping", "");
    this.style.setProperty("--swipe-x", `${dx}px`);
    this.style.setProperty(
      "--swipe-opacity",
      String(Math.max(0, 1 - Math.abs(dx) / (SWIPE_THRESHOLD * 2))),
    );
  };

  #onSwipeEnd = (e: PointerEvent) => {
    if (!this.#swiping) return;
    this.#swiping = false;
    this.removeAttribute("data-swiping");
    this.removeEventListener("pointermove", this.#onSwipeMove);
    this.removeEventListener("pointerup", this.#onSwipeEnd);
    const dx = e.clientX - this.#swipeStartX;
    if (Math.abs(dx) > SWIPE_THRESHOLD) {
      // Fling it the rest of the way out, then close.
      this.style.setProperty("--swipe-x", `${Math.sign(dx) * window.innerWidth}px`);
      this.style.setProperty("--swipe-opacity", "0");
      this.close();
    } else {
      this.style.removeProperty("--swipe-x");
      this.style.removeProperty("--swipe-opacity");
      this.resume();
    }
  };

  /** Dismiss the toast, playing its exit animation before removal. */
  close() {
    clearTimeout(this.#timer);
    if (!this.hasAttribute("data-open")) return;
    this.removeAttribute("data-open");
    this.dispatchEvent(new CustomEvent("dismiss", { bubbles: true, detail: { id: this.id } }));
    runExit(this, () => this.remove());
  }
}

/** Top-layer live region + toast manager + stack layout. */
export class UIToastViewport extends HTMLElement {
  #observer: MutationObserver | null = null;

  /** How many toasts stay visible before the rest fade behind (default 3). */
  get #visible(): number {
    const n = Number(this.getAttribute("visible"));
    return Number.isFinite(n) && n > 0 ? n : 3;
  }
  /** Vertical gap between toasts when the stack is expanded, in px (default 14). */
  get #gap(): number {
    const n = Number(this.getAttribute("gap"));
    return Number.isFinite(n) ? n : 14;
  }

  connectedCallback() {
    this.setAttribute("role", "region");
    if (!this.hasAttribute("aria-label")) this.setAttribute("aria-label", "Notifications");
    // Manual popover: the region lives in the top layer above other content.
    this.setAttribute("popover", "manual");
    // Toasts float above dialogs/popups but must never light-dismiss them:
    // a press on a toast is not an "outside press" for the surface beneath.
    this.setAttribute("data-dismiss-ignore", "");
    // Vertical stack direction — `top`-anchored viewports peek/expand downward.
    this.dataset.position = (this.getAttribute("position") ?? "").includes("top")
      ? "top"
      : "bottom";
    try {
      this.showPopover?.();
    } catch {
      /* not supported / already shown */
    }

    this.addEventListener("pointerenter", this.#expand);
    this.addEventListener("pointerleave", this.#collapse);
    this.addEventListener("focusin", this.#expand);
    this.addEventListener("focusout", this.#onFocusOut);
    // Re-layout whenever toasts are added or removed.
    this.#observer = new MutationObserver(() => this.#layout());
    this.#observer.observe(this, { childList: true });
    this.#layout();
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
    try {
      this.hidePopover?.();
    } catch {
      /* not supported / already hidden */
    }
  }

  #expand = () => {
    if (this.hasAttribute("data-expanded")) return;
    this.setAttribute("data-expanded", "");
    this.#pauseAll(true);
    this.#layout();
  };
  #collapse = () => {
    if (!this.hasAttribute("data-expanded")) return;
    this.removeAttribute("data-expanded");
    this.#pauseAll(false);
    this.#layout();
  };
  #onFocusOut = (e: FocusEvent) => {
    if (!this.contains(e.relatedTarget as Node | null)) this.#collapse();
  };

  #pauseAll(paused: boolean) {
    for (const t of this.querySelectorAll<UIToast>("ui-toast")) {
      if (paused) t.pause();
      else t.resume();
    }
  }

  /** Assign each toast its stack geometry (front-first) as CSS custom props. */
  #layout = () => {
    const toasts = [...this.querySelectorAll<UIToast>("ui-toast")].reverse(); // newest → front
    const n = toasts.length;
    this.toggleAttribute("data-empty", n === 0);
    const expanded = this.hasAttribute("data-expanded");
    const visible = this.#visible;
    const gap = this.#gap;

    let offset = 0;
    toasts.forEach((t, i) => {
      t.style.setProperty("--index", String(i));
      t.style.setProperty("--z", String(n - i));
      t.style.setProperty("--offset", `${offset}px`);
      t.toggleAttribute("data-front", i === 0);
      t.toggleAttribute("data-hidden", !expanded && i >= visible);
      offset += (t.offsetHeight || 0) + gap;
    });

    const frontHeight = toasts[0]?.offsetHeight ?? 0;
    const total = Math.max(offset - gap, 0);
    this.style.setProperty("--front-height", `${frontHeight}px`);
    this.style.setProperty("--stack-height", `${expanded ? total : frontHeight}px`);
  };

  /** Build, enqueue and return a toast for `options`. */
  add(options: ToastOptions): UIToast {
    const toast = document.createElement("ui-toast") as UIToast;
    toast.id = options.id ?? nextId("ui-toast");
    if (options.type) toast.dataset.type = options.type;
    if (options.duration != null) toast.setAttribute("duration", String(options.duration));

    if (options.title) {
      const el = document.createElement("div");
      el.setAttribute("data-toast-title", "");
      el.textContent = options.title;
      toast.appendChild(el);
    }
    if (options.description) {
      const el = document.createElement("div");
      el.setAttribute("data-toast-description", "");
      el.textContent = options.description;
      toast.appendChild(el);
    }
    if (options.action) {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("data-toast-action", "");
      el.textContent = options.action;
      toast.appendChild(el);
    }
    const close = document.createElement("button");
    close.type = "button";
    close.setAttribute("data-toast-close", "");
    close.setAttribute("aria-label", "Close");
    toast.appendChild(close);

    this.appendChild(toast);
    // If the stack is currently expanded (pointer already inside), keep the new
    // toast's timer paused like its siblings.
    if (this.hasAttribute("data-expanded")) toast.pause();
    this.#layout();
    return toast;
  }

  /** Dismiss the toast with the given id. */
  dismiss(id: string) {
    for (const t of this.querySelectorAll<UIToast>("ui-toast")) {
      if (t.id === id) {
        t.close();
        break;
      }
    }
  }

  /** Dismiss every toast in the viewport. */
  clear() {
    for (const t of this.querySelectorAll<UIToast>("ui-toast")) t.close();
  }
}

/** Show a toast via the first `<ui-toast-viewport>` in the document. */
export function toast(options: ToastOptions): UIToast | null {
  const viewport = document.querySelector<UIToastViewport>("ui-toast-viewport");
  return viewport ? viewport.add(options) : null;
}

if (!customElements.get("ui-toast")) customElements.define("ui-toast", UIToast);
if (!customElements.get("ui-toast-viewport"))
  customElements.define("ui-toast-viewport", UIToastViewport);

declare global {
  interface HTMLElementTagNameMap {
    "ui-toast": UIToast;
    "ui-toast-viewport": UIToastViewport;
  }
}
