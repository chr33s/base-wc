/**
 * `ui-popover` — an anchored, **non-modal** popup (Base UI's Popover). Reuses
 * the whole popup stack via {@link overlay}: {@link anchor} positioning (CSS
 * pairing + JS fallback), the Popover-API top layer, trigger ARIA, and
 * {@link onOutsidePress} light-dismiss. Non-modal means the page behind stays
 * interactive — no focus trap, no scroll lock (that is `ui-dialog`).
 *
 * Markup: a `[data-popover-trigger]` and a `<ui-popover-popup>`. The trigger
 * gets `aria-haspopup="dialog"` / `aria-expanded` / `aria-controls`; the popup
 * is `role="dialog"`, labelled/described from `[data-popover-title]` /
 * `[data-popover-description]` (a light-DOM cross-reference), and any
 * `[data-popover-close]` inside it closes the popup on click. On open, focus
 * moves to the popup's first focusable — or the popup itself when it has none,
 * so `Escape` (listened on the host) always has a live path to dismissal. On
 * close focus returns to the trigger.
 */
import { define } from "./define.ts";
import { UIPopupElement } from "./popup.ts";
import { LightDomElement } from "./lifecycle.ts";
import { getFocusable } from "./focus-trap.ts";
import { labelFrom } from "./id.ts";
import { type Overlay, overlay } from "./overlay.ts";
import type { ChangeReason } from "./reasons.ts";

export class UIPopover extends LightDomElement {
  #trigger: HTMLElement | null = null;
  #popup: HTMLElement | null = null;
  #arrow: HTMLElement | null = null;
  #overlay: Overlay | null = null;

  get open() {
    return this.#overlay?.open ?? false;
  }

  protected override initialize() {
    this.#trigger = this.querySelector<HTMLElement>("[data-popover-trigger]");
    this.#popup = this.querySelector<HTMLElement>("ui-popover-popup");
    if (!this.#trigger || !this.#popup) return false;
    this.#arrow = this.#popup.querySelector<HTMLElement>("ui-arrow");

    // Label/describe the dialog from its title/description so assistive tech
    // announces it (light-DOM cross-reference — no shadow boundary to cross).
    labelFrom(
      this.#popup,
      "aria-labelledby",
      this.querySelector("[data-popover-title]"),
      "ui-popover-title",
    );
    labelFrom(
      this.#popup,
      "aria-describedby",
      this.querySelector("[data-popover-description]"),
      "ui-popover-description",
    );
    this.#trigger.addEventListener("click", this.#onTriggerClick);
    // Escape is listened on the host, not the popup: with no focusable content
    // focus stays on the trigger, and a popup-only listener would never hear it.
    this.addEventListener("keydown", this.#onKeydown);
    this.#popup.addEventListener("click", (e) => {
      if ((e.target as Element).closest("[data-popover-close]")) this.hide("close-press");
    });

    this.#overlay = overlay(this.#popup, {
      anchor: {
        ref: () => this.#trigger,
        options: { offset: 6, padding: 8, arrow: this.#arrow },
        pair: "popover",
      },
      dismiss: {
        within: () => [this.#popup, this.#trigger],
        onDismiss: () => this.#close({ restoreFocus: false, reason: "outside-press" }),
      },
      trigger: { element: this.#trigger, haspopup: "dialog", controls: "ui-popover-popup" },
      events: this,
    });
    return true;
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#close({ restoreFocus: false });
  }

  show(reason: ChangeReason = "none") {
    // Wire synchronously if `show()` is called in the same task as connection,
    // before the deferred wiring microtask has run — otherwise the overlay is
    // still missing and the open would silently no-op.
    this.ensureInitialized();
    if (!this.#overlay?.show(reason)) return;
    // Focus the popup itself when it holds no focusable content, so Escape
    // still reaches the host instead of dying on the (blurred) page.
    (getFocusable(this.#popup!)[0] ?? this.#popup!).focus();
  }

  hide(reason: ChangeReason = "none") {
    this.#close({ reason });
  }

  toggle(reason: ChangeReason = "none") {
    if (this.open) this.#close({ reason });
    else this.show(reason);
  }

  #close({
    restoreFocus = true,
    reason = "none",
  }: { restoreFocus?: boolean; reason?: ChangeReason } = {}) {
    if (!this.#overlay?.open) return;
    const restore =
      restoreFocus && this.#trigger != null && this.#popup!.contains(document.activeElement);
    this.#overlay.hide({ reason });
    if (restore) this.#trigger?.focus();
  }

  #onTriggerClick = () => this.toggle("trigger-press");

  #onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.open) {
      e.preventDefault();
      this.#close({ reason: "escape-key" });
    }
  };
}

export class UIPopoverPopup extends UIPopupElement {
  static override role = "dialog";
  static override focusable = true;
}

define("ui-popover", UIPopover);
define("ui-popover-popup", UIPopoverPopup);

declare global {
  interface HTMLElementTagNameMap {
    "ui-popover": UIPopover;
    "ui-popover-popup": UIPopoverPopup;
  }
}
