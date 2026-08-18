/**
 * Overlay popup lifecycle — the show / position / light-dismiss / exit-transition
 * / hide dance shared by every anchored, top-layer popup (Popover, Select,
 * Combobox, Menu). A component owns its trigger ARIA, focus and content; this
 * owns the **popup element**: it lifts it into the Popover-API top layer, marks
 * `data-open` + `data-state` (so CSS enter/exit animations run), positions it
 * with the JS fallback where CSS anchor positioning is unavailable, wires
 * light-dismiss, and defers `hidePopover` until the exit transition finishes
 * (via {@link runExit}) so `[data-state="closed"]` animations play out.
 *
 * The component keeps its own open flag for its ARIA/focus logic; this exposes
 * `open` purely to guard double show/hide and the deferred-hide race.
 */
import { anchor, type AnchorOptions, SUPPORTS_ANCHOR, type VirtualElement } from "./anchor.ts";
import { onOutsidePress } from "./dismiss.ts";
import { runExit, setOpenState } from "./transitions.ts";

export interface OverlayOptions {
  /**
   * Reference for JS positioning. By default it runs only as the fallback when
   * CSS anchor positioning is unavailable; set `always` to position via JS
   * regardless (e.g. point-anchored context menus and side-anchored submenus,
   * which don't use the CSS `anchor-name` pairing). `ref` and `options` are
   * read on each `show()`, so a caller can vary placement per open.
   */
  anchor?: {
    ref: () => Element | VirtualElement | null | undefined;
    options?: AnchorOptions | (() => AnchorOptions | undefined);
    always?: boolean | (() => boolean);
  };
  /** Light-dismiss: `within` lists the elements treated as "inside". */
  dismiss?: {
    within: () => (Element | null | undefined)[];
    onDismiss: () => void;
  };
}

export interface Overlay {
  /** Lift the popup into the top layer, position it, and arm light-dismiss. */
  show(): void;
  /** Play the exit transition, then drop the popup from the top layer. */
  hide(): void;
  readonly open: boolean;
}

/** Create a lifecycle controller for a `popover="manual"` popup element. */
export function overlay(popup: HTMLElement, options: OverlayOptions = {}): Overlay {
  let isOpen = false;
  let stopPosition: (() => void) | null = null;
  let stopDismiss: (() => void) | null = null;

  return {
    get open() {
      return isOpen;
    },
    show() {
      if (isOpen) return;
      isOpen = true;
      popup.setAttribute("data-open", "");
      setOpenState(popup, true);
      try {
        popup.showPopover?.();
      } catch {
        /* not supported / already shown */
      }
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
      if (options.dismiss) {
        const within = options.dismiss.within().filter((el): el is Element => el != null);
        stopDismiss = onOutsidePress(within, options.dismiss.onDismiss);
      }
    },
    hide() {
      if (!isOpen) return;
      isOpen = false;
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
    },
  };
}
