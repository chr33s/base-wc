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
import { define } from "./define.ts";
import { numberAttribute } from "./math.ts";
import { labelFrom, nextId } from "./id.ts";
import { type PointerDragOptions, trackPointerDrag } from "./pointer-drag.ts";
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

/**
 * Travel (px) before a stroke is attributed to an axis. Below it the gesture is
 * still ambiguous — a scroll and a dismiss look identical — so the toast neither
 * moves nor claims the pointer.
 */
const SWIPE_SLOP = 8;

/** A single notification. Owns its auto-dismiss timer, close/action and swipe. */
export class UIToast extends HTMLElement {
  /**
   * Whether this element derived its own `role`/`aria-live` from `data-type`.
   * An authored `role` is the consumer's decision and survives a later type
   * change; one we computed has to be recomputed, or an `info` toast promoted
   * to `error` would keep announcing politely.
   */
  #ownsAnnouncement = false;
  #timer = 0;
  /** ms still owed on the auto-dismiss timer; `null` before it first starts. */
  #remaining: number | null = null;
  /** `Date.now()` when the running timer was (re)started. */
  #startedAt = 0;
  /** Where the swipe pressed — every offset is measured from here. */
  #swipeStartX = 0;
  /** True from press to release, including a stroke the scroller won: the
   * auto-dismiss timer must not restart under a finger that is still down. */
  #swiping = false;
  #disposeSwipe: (() => void) | null = null;

  /** Auto-dismiss delay in ms (`0` = sticky). */
  get duration() {
    return numberAttribute(this, "duration", DEFAULT_DURATION);
  }

  connectedCallback() {
    this.#ownsAnnouncement = !this.getAttribute("role") && !this.hasAttribute("aria-live");
    this.#syncAnnouncement();
    this.setAttribute("aria-atomic", "true");

    // Label/describe from the title/description parts for assistive tech.
    labelFrom(this, "aria-labelledby", this.querySelector("[data-toast-title]"), "ui-toast-title");
    labelFrom(
      this,
      "aria-describedby",
      this.querySelector("[data-toast-description]"),
      "ui-toast-description",
    );

    this.setAttribute("data-open", "");
    setOpenState(this, true);
    this.addEventListener("click", this.#onClick);
    this.addEventListener("pointerenter", this.pause);
    this.addEventListener("pointerleave", this.resume);
    this.addEventListener("focusin", this.pause);
    this.addEventListener("focusout", this.resume);
    // Armed once and kept: `trackPointerDrag` leaves its `pointerdown` listener
    // on the element, so a toast moved between viewports keeps swiping.
    this.#disposeSwipe ??= trackPointerDrag(this, this.#swipeOptions());
    this.#start();
  }

  disconnectedCallback() {
    // End an in-flight swipe first — its `onEnd` snaps back and resumes the
    // timer, so banking the time afterwards is what actually leaves the
    // detached toast stopped rather than counting down off-screen.
    this.#disposeSwipe?.();
    this.pause();
    clearTimeout(this.#timer);
  }

  /** Derive `role`/`aria-live` from `data-type`, unless the consumer set them. */
  #syncAnnouncement() {
    if (!this.#ownsAnnouncement) {
      if (!this.hasAttribute("aria-live") && this.getAttribute("role"))
        this.setAttribute(
          "aria-live",
          this.getAttribute("role") === "alert" ? "assertive" : "polite",
        );
      return;
    }
    const assertive = this.dataset.type === "error" || this.dataset.type === "warning";
    this.setAttribute("role", assertive ? "alert" : "status");
    this.setAttribute("aria-live", assertive ? "assertive" : "polite");
  }

  /**
   * Re-announce and restart the auto-dismiss countdown. Called after a manager
   * update: a toast whose text just changed has to give the reader the full
   * duration to read it, exactly as a freshly added one would.
   */
  refresh() {
    this.#syncAnnouncement();
    clearTimeout(this.#timer);
    this.#remaining = null;
    this.#start();
  }

  #start() {
    const d = this.duration;
    if (d <= 0) return; // sticky
    this.#remaining = d;
    this.#arm();
  }

  /** (Re)arm the timer for whatever time is still owed. */
  #arm() {
    const remaining = this.#remaining;
    if (remaining == null) return; // sticky, or never started
    this.#startedAt = Date.now();
    this.#timer = window.setTimeout(() => this.close(), remaining);
  }

  /**
   * Pause the auto-dismiss timer (hover/focus, or the whole stack expanding),
   * banking the time already served. Deducting from `#remaining` rather than
   * from the full `duration` is what makes repeated pauses accumulate — hovering
   * a toast three times must not hand it three fresh lifetimes.
   */
  pause = () => {
    if (this.#remaining == null) return; // sticky
    clearTimeout(this.#timer);
    this.#timer = 0;
    if (!this.#startedAt) return; // already paused — don't double-deduct
    const elapsed = Date.now() - this.#startedAt;
    this.#startedAt = 0;
    this.#remaining = Math.max(0, this.#remaining - elapsed);
  };

  /** Resume the auto-dismiss timer for the time it has left. */
  resume = () => {
    if (this.#swiping || this.#viewportExpanded()) return; // don't restart mid-swipe/stack interaction
    if (this.#startedAt) return; // already running
    clearTimeout(this.#timer);
    this.#arm();
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
  /**
   * The flick gesture, on the shared {@link trackPointerDrag}. The toast lives
   * inside a scrollable stack, so the press only arms: below {@link SWIPE_SLOP}
   * the stroke is still ambiguous, and the first axis to clear it wins outright.
   * A two-axis gesture — the diagonal drift of a thumb scrolling the stack —
   * would otherwise translate the toast sideways by its incidental horizontal
   * component the whole way down, fading it as it goes. A stroke the vertical
   * axis wins is tracked but never committed (`await-release`), because the
   * press paused the auto-dismiss timer and the finger resting on the toast is
   * still a reason not to restart it.
   */
  #swipeOptions(): PointerDragOptions {
    return {
      slop: SWIPE_SLOP,
      axis: "x",
      crossAxis: "await-release",
      onStart: (e) => {
        if (e.button !== 0) return false;
        // Let the action/close buttons handle their own clicks.
        if ((e.target as Element).closest("[data-toast-close],[data-toast-action]")) return false;
        this.#swiping = true;
        this.#swipeStartX = e.clientX;
        this.pause();
        return true;
      },
      onCommit: () => this.setAttribute("data-swiping", ""),
      onMove: (e) => {
        const dx = e.clientX - this.#swipeStartX;
        this.style.setProperty("--swipe-x", `${dx}px`);
        this.style.setProperty(
          "--swipe-opacity",
          String(Math.max(0, 1 - Math.abs(dx) / (SWIPE_THRESHOLD * 2))),
        );
      },
      onEnd: (e, committed) => {
        this.#swiping = false;
        this.removeAttribute("data-swiping");
        // Never committed to the horizontal axis: the stroke was a tap or a
        // scroll, so restore the resting position rather than measuring it for
        // dismissal. A cancelled pointer (the browser taking a `pan-y` scroll
        // over) and a dispose carry no meaningful end position, so they snap
        // back too — without this the toast would strand mid-swipe with
        // `data-swiping` set and its timer paused forever.
        if (!committed || !e || e.type === "pointercancel") {
          this.#snapBack();
          return;
        }
        const dx = e.clientX - this.#swipeStartX;
        if (Math.abs(dx) > SWIPE_THRESHOLD) {
          // Fling it the rest of the way out, then close.
          this.style.setProperty("--swipe-x", `${Math.sign(dx) * window.innerWidth}px`);
          this.style.setProperty("--swipe-opacity", "0");
          this.close();
        } else {
          this.#snapBack();
        }
      },
    };
  }

  /** Return to the resting position and let the auto-dismiss timer run again. */
  #snapBack() {
    this.style.removeProperty("--swipe-x");
    this.style.removeProperty("--swipe-opacity");
    this.resume();
  }

  /** Dismiss the toast, playing its exit animation before removal. */
  close() {
    clearTimeout(this.#timer);
    this.#timer = 0;
    this.#startedAt = 0;
    this.#remaining = null; // a closing toast owes no more time
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
  get #visible() {
    const n = numberAttribute(this, "visible", 3);
    return n > 0 ? n : 3;
  }
  /** Vertical gap between toasts when the stack is expanded, in px (default 14). An absent or empty attribute carries no value — which is not the same as `gap="0"`. */
  get #gap() {
    return numberAttribute(this, "gap", 14);
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
  add(options: ToastOptions) {
    const toast = document.createElement("ui-toast") as UIToast;
    toast.id = options.id ?? nextId("ui-toast");
    applyToastOptions(toast, options);

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

  /**
   * Amend a live toast in place — the "loading → succeeded" transition, where
   * replacing the element would restart the stack animation and drop the
   * reader's place in it.
   *
   * `patch` supplies only the fields that change; anything omitted is left as
   * it is. Passing a **function** derives the patch from what the toast
   * currently shows, which is the only race-free way to amend a toast some
   * other code may have updated since — reading it first and passing an object
   * would write back stale fields. Explicitly passing `undefined` for a field
   * (or `""`) removes that part.
   *
   * Returns the toast, or `null` when no toast with that id is live.
   */
  update(
    id: string,
    patch: Partial<ToastOptions> | ((current: ToastOptions) => Partial<ToastOptions>),
  ) {
    const toast = this.#find(id);
    if (!toast) return null;
    const next = typeof patch === "function" ? patch(readToastOptions(toast)) : patch;
    applyToastOptions(toast, next);
    toast.refresh();
    // Match `add`: a toast that lands while the stack is expanded stays paused
    // with its siblings rather than counting down under the pointer.
    if (this.hasAttribute("data-expanded")) toast.pause();
    this.#layout();
    return toast;
  }

  /** Dismiss the toast with the given id. */
  dismiss(id: string) {
    this.#find(id)?.close();
  }

  #find(id: string) {
    for (const t of this.querySelectorAll<UIToast>("ui-toast")) {
      if (t.id === id) return t;
    }
    return null;
  }

  /** Dismiss every toast in the viewport. */
  clear() {
    for (const t of this.querySelectorAll<UIToast>("ui-toast")) t.close();
  }
}

/**
 * The parts a manager-built toast renders, in the order `add` appends them —
 * the close button always stays last, so an update that introduces a part slots
 * it in ahead of the close button rather than after it.
 */
const TOAST_PARTS = [
  ["title", "data-toast-title", "div"],
  ["description", "data-toast-description", "div"],
  ["action", "data-toast-action", "button"],
] as const;

/** Read back the options a toast currently renders. */
function readToastOptions(toast: UIToast): ToastOptions {
  const options: ToastOptions = { id: toast.id };
  for (const [key, attribute] of TOAST_PARTS) {
    const text = toast.querySelector(`[${attribute}]`)?.textContent;
    if (text) options[key] = text;
  }
  if (toast.dataset.type) options.type = toast.dataset.type as NonNullable<ToastOptions["type"]>;
  if (toast.hasAttribute("duration")) options.duration = toast.duration;
  return options;
}

/**
 * Write `options` onto a toast, creating, retexting or removing each part.
 * Only the keys actually present are touched, so this doubles as the partial
 * update the manager applies.
 */
function applyToastOptions(toast: UIToast, options: Partial<ToastOptions>) {
  if ("type" in options) {
    if (options.type) toast.dataset.type = options.type;
    else delete toast.dataset.type;
  }
  if ("duration" in options) {
    if (options.duration == null) toast.removeAttribute("duration");
    else toast.setAttribute("duration", String(options.duration));
  }

  for (const [key, attribute, tag] of TOAST_PARTS) {
    if (!(key in options)) continue;
    const text = options[key];
    let part = toast.querySelector<HTMLElement>(`[${attribute}]`);
    if (!text) {
      part?.remove();
      continue;
    }
    if (!part) {
      part = document.createElement(tag);
      if (part instanceof HTMLButtonElement) part.type = "button";
      part.setAttribute(attribute, "");
      // Keep the authored order: insert before the close button when one is
      // already rendered, else append.
      toast.insertBefore(part, toast.querySelector("[data-toast-close]"));
    }
    part.textContent = text;
  }
}

/** Show a toast via the first `<ui-toast-viewport>` in the document. */
export function toast(options: ToastOptions) {
  return firstToastViewport()?.add(options) ?? null;
}

/**
 * Amend a live toast via the first `<ui-toast-viewport>` in the document — see
 * {@link UIToastViewport.update}.
 */
export function updateToast(
  id: string,
  patch: Partial<ToastOptions> | ((current: ToastOptions) => Partial<ToastOptions>),
) {
  return firstToastViewport()?.update(id, patch) ?? null;
}

function firstToastViewport() {
  return document.querySelector<UIToastViewport>("ui-toast-viewport");
}

define("ui-toast", UIToast);
define("ui-toast-viewport", UIToastViewport);

declare global {
  interface HTMLElementTagNameMap {
    "ui-toast": UIToast;
    "ui-toast-viewport": UIToastViewport;
  }
}
