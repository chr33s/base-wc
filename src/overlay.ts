/**
 * Overlay popup controller — the full anchored-popup lifecycle shared by every
 * top-layer popup (Popover, Select, Combobox, Menu, Tooltip, Preview Card) and,
 * in `modal` mode, by the modal surfaces (Dialog, Drawer). It owns the **popup
 * element**: it lifts it into the Popover-API top layer, marks `data-open` +
 * `data-state` (so CSS enter/exit animations run), positions it with the JS
 * fallback where CSS anchor positioning is unavailable, wires light-dismiss,
 * and defers `hidePopover` until the exit transition finishes (via
 * {@link runExit}) so `[data-state="closed"]` animations play out.
 *
 * Beyond the popup it can also own the shared **trigger ceremony** — the CSS
 * `anchor-name` pairing ({@link pairAnchor}), `type="button"` on a bare
 * `<button>`, `aria-haspopup`, an `aria-expanded` kept in sync with open state,
 * a generated popup id wired to `aria-controls` — plus the host's bubbling
 * `open`/`close` CustomEvents and, for modal surfaces, {@link trapFocus} +
 * {@link lockScroll}. Every option is additive: a bare `overlay(popup)` still
 * behaves exactly as the original popup-lifecycle controller did, and a
 * component keeps only its focus policy and selection semantics.
 *
 * `open` is the single source of truth for the popup's open state; components
 * read it instead of shadowing it with their own flag.
 */
import {
  anchor,
  type AnchorOptions,
  pairAnchor,
  SUPPORTS_ANCHOR,
  type VirtualElement,
} from "./anchor.ts";
import { onOutsidePress } from "./dismiss.ts";
import { trapFocus } from "./focus-trap.ts";
import { nextId } from "./id.ts";
import { lockScroll } from "./scroll-lock.ts";
import { runExit, setOpenState } from "./transitions.ts";

export interface OverlayTriggerOptions {
  /** The trigger element (`null` tolerated — e.g. a context-menu-driven menu). */
  element: HTMLElement | null;
  /**
   * `aria-haspopup` token to set on the trigger (`"menu"`, `"listbox"`,
   * `"dialog"`). Omit to leave `aria-haspopup` alone (e.g. preview cards).
   */
  haspopup?: string;
  /**
   * Prefix for the popup's generated id (assigned only when it has none),
   * pointed at by the trigger's `aria-controls`. `false` skips the id/controls
   * wiring. Default `"ui-popup"`.
   */
  controls?: string | false;
}

export interface OverlayOptions {
  /**
   * Reference for JS positioning. By default it runs only as the fallback when
   * CSS anchor positioning is unavailable; set `always` to position via JS
   * regardless (e.g. point-anchored context menus and side-anchored submenus,
   * which don't use the CSS `anchor-name` pairing). `ref` and `options` are
   * read on each `show()`, so a caller can vary placement per open. Passing a
   * `pair` prefix also wires the CSS `anchor-name`/`position-anchor` pairing at
   * creation (skipped when the reference is not an element yet, or when
   * `always` already holds at creation — an always-JS popup never uses the CSS
   * pairing).
   */
  anchor?: {
    ref: () => Element | VirtualElement | null | undefined;
    options?: AnchorOptions | (() => AnchorOptions | undefined);
    always?: boolean | (() => boolean);
    pair?: string | false;
  };
  /**
   * Light-dismiss: `within` lists the elements treated as "inside". `enabled`
   * is read on each `show()` so a per-open policy (e.g. a `static` dialog) can
   * suppress dismissal without rebuilding the controller.
   */
  dismiss?: {
    within: () => (Element | null | undefined)[];
    onDismiss: () => void;
    enabled?: () => boolean;
  };
  /**
   * Trigger ARIA wiring, applied at creation: `type="button"` on a bare
   * `<button>` (so it never submits an enclosing form), `aria-haspopup`,
   * `aria-controls` → generated popup id, and `aria-expanded` kept in sync
   * with open state.
   */
  trigger?: OverlayTriggerOptions;
  /**
   * Modal composition: {@link trapFocus} (focus cycle + focus restore) and
   * {@link lockScroll} (reference-counted background lock) while open.
   * `hide({ restoreFocus: false })` releases the trap without restoring focus
   * (e.g. teardown on disconnect).
   */
  modal?: boolean;
  /**
   * Host element that dispatches bubbling `open`/`close` CustomEvents as the
   * overlay's state changes, so components stop hand-rolling the dispatch.
   */
  events?: HTMLElement;
}

export interface Overlay {
  /**
   * Lift the popup into the top layer, position it, and arm light-dismiss.
   * Returns whether state changed (false when already open).
   */
  show(): boolean;
  /**
   * Play the exit transition, then drop the popup from the top layer. Returns
   * whether state changed. `restoreFocus` (default true) only applies to the
   * modal focus trap's restore.
   */
  hide(options?: { restoreFocus?: boolean }): boolean;
  readonly open: boolean;
}

/** Create a lifecycle controller for a `popover="manual"` popup element. */
export function overlay(popup: HTMLElement, options: OverlayOptions = {}) {
  let isOpen = false;
  let stopPosition: (() => void) | null = null;
  let stopDismiss: (() => void) | null = null;
  let unlockScroll: (() => void) | null = null;
  let releaseFocus: ((restoreFocus?: boolean) => void) | null = null;

  const trigger = options.trigger?.element ?? null;
  if (options.trigger && trigger) {
    if (trigger instanceof HTMLButtonElement && !trigger.hasAttribute("type")) {
      trigger.type = "button"; // never submit an enclosing form
    }
    if (options.trigger.haspopup) trigger.setAttribute("aria-haspopup", options.trigger.haspopup);
    trigger.setAttribute("aria-expanded", "false");
    if (options.trigger.controls !== false) {
      if (!popup.id) popup.id = nextId(options.trigger.controls ?? "ui-popup");
      trigger.setAttribute("aria-controls", popup.id);
    }
  }

  // CSS anchor pairing, unique per instance to avoid the multi-instance
  // "everything resolves to the last one" collision. Skipped for always-JS
  // popups (side-anchored submenus, point anchors) and non-element references.
  if (options.anchor?.pair) {
    const always =
      typeof options.anchor.always === "function" ? options.anchor.always() : options.anchor.always;
    const ref = options.anchor.ref();
    if (!always && ref instanceof HTMLElement) pairAnchor(ref, popup, options.anchor.pair);
  }

  return {
    get open() {
      return isOpen;
    },
    show() {
      if (isOpen) return false;
      isOpen = true;
      popup.setAttribute("data-open", "");
      setOpenState(popup, true);
      try {
        popup.showPopover?.();
      } catch {
        /* not supported / already shown */
      }
      trigger?.setAttribute("aria-expanded", "true");
      if (options.anchor) {
        const always =
          typeof options.anchor.always === "function"
            ? options.anchor.always()
            : options.anchor.always;
        if (always || !SUPPORTS_ANCHOR) {
          const ref = options.anchor.ref();
          if (ref) {
            const opts =
              typeof options.anchor.options === "function"
                ? options.anchor.options()
                : options.anchor.options;
            stopPosition = anchor(ref, popup, opts);
          }
        }
      }
      if (options.modal) {
        unlockScroll = lockScroll();
        releaseFocus = trapFocus(popup);
      }
      if (options.dismiss && (options.dismiss.enabled?.() ?? true)) {
        const within = options.dismiss.within().filter((el): el is Element => el != null);
        stopDismiss = onOutsidePress(within, options.dismiss.onDismiss);
      }
      options.events?.dispatchEvent(new CustomEvent("open", { bubbles: true }));
      return true;
    },
    hide({ restoreFocus = true }: { restoreFocus?: boolean } = {}) {
      if (!isOpen) return false;
      isOpen = false;
      trigger?.setAttribute("aria-expanded", "false");
      popup.removeAttribute("data-open");
      runExit(popup, () => {
        if (isOpen) return; // reopened during the exit — keep it shown
        try {
          popup.hidePopover?.();
        } catch {
          /* not supported / already hidden */
        }
      });
      stopPosition?.();
      stopPosition = null;
      stopDismiss?.();
      stopDismiss = null;
      unlockScroll?.();
      unlockScroll = null;
      // Always release the trap so its document-level keydown listener is
      // detached; only restore focus to the pre-open element when closing
      // normally (on disconnect there is nothing sensible to focus).
      releaseFocus?.(restoreFocus);
      releaseFocus = null;
      options.events?.dispatchEvent(new CustomEvent("close", { bubbles: true }));
      return true;
    },
  };
}
