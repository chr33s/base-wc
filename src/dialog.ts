/**
 * `ui-dialog` — a **modal** dialog (Base UI's Dialog). Composes the shared
 * {@link overlay} controller in `modal` mode: the Popover-API top layer,
 * {@link trapFocus} (focus cycle + focus restore), {@link lockScroll}
 * (reference-counted background lock) and conditional outside-press dismissal
 * all live there — this element keeps only its ARIA labelling and static
 * policy. `role="dialog"` + `aria-modal="true"`, with `aria-labelledby` /
 * `aria-describedby` wired from `[data-dialog-title]` / `[data-dialog-description]`
 * — a light-DOM cross-reference that only works because there is no shadow root.
 *
 * Markup: a `[data-dialog-trigger]`, an optional `<ui-dialog-backdrop>`, and a
 * `<ui-dialog-popup>`. Dismisses on `Escape` and outside press unless the
 * `static` attribute is set. The `alert` attribute is the Alert Dialog variant:
 * it implies `static` (forced action) and switches the popup to
 * `role="alertdialog"`.
 */
import { define } from "./define.ts";
import { UIModalPopupElement } from "./popup.ts";
import { LightDomElement } from "./lifecycle.ts";
import { labelFrom } from "./id.ts";
import { type Overlay, overlay } from "./overlay.ts";
import type { ChangeReason } from "./reasons.ts";

export class UIDialog extends LightDomElement {
  #trigger: HTMLElement | null = null;
  #popup: HTMLElement | null = null;
  #overlay: Overlay | null = null;

  get open() {
    return this.#overlay?.open ?? false;
  }
  /**
   * When set (via `static`, or implied by `alert`), suppress Escape +
   * outside-press dismissal — the dialog can only be closed by an explicit
   * in-dialog action.
   */
  get static() {
    return this.hasAttribute("static") || this.hasAttribute("alert");
  }

  protected override wire() {
    this.#trigger = this.querySelector<HTMLElement>("[data-dialog-trigger]");
    this.#popup = this.querySelector<HTMLElement>("ui-dialog-popup");
    if (!this.#popup) return;
    this.wired = true;

    // Alert dialogs force an explicit action: role=alertdialog + no dismissal.
    if (this.hasAttribute("alert")) this.#popup.setAttribute("role", "alertdialog");
    labelFrom(
      this.#popup,
      "aria-labelledby",
      this.querySelector("[data-dialog-title]"),
      "ui-dialog-title",
    );
    labelFrom(
      this.#popup,
      "aria-describedby",
      this.querySelector("[data-dialog-description]"),
      "ui-dialog-description",
    );

    this.#trigger?.addEventListener("click", this.#onTriggerClick);
    this.#popup.addEventListener("keydown", this.#onPopupKeydown);

    this.#overlay = overlay(this.#popup, {
      trigger: { element: this.#trigger, haspopup: "dialog", controls: "ui-dialog-popup" },
      modal: true,
      // Outside press closes; the trigger is treated as inside so its own click
      // handler owns toggling instead of double-firing with dismissal.
      dismiss: {
        within: () => [this.#popup, this.#trigger],
        onDismiss: () => this.#close("outside-press"),
        enabled: () => !this.static,
      },
      events: this,
    });
  }

  disconnectedCallback() {
    this.#overlay?.hide({ restoreFocus: false });
  }

  show(reason: ChangeReason = "none") {
    // Wire synchronously if `show()` is called in the same task as connection,
    // before the deferred wiring microtask has run — otherwise #popup is still
    // null and the open would silently no-op.
    if (!this.wired) this.wire();
    this.#overlay?.show(reason);
  }

  hide(reason: ChangeReason = "none") {
    this.#close(reason);
  }

  #close(reason: ChangeReason = "none") {
    this.#overlay?.hide({ reason });
  }

  #onTriggerClick = () => {
    if (this.open) this.#close("trigger-press");
    else this.show("trigger-press");
  };

  #onPopupKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !this.static) {
      e.preventDefault();
      this.#close("escape-key");
    }
  };
}

export class UIDialogPopup extends UIModalPopupElement {}

export class UIDialogBackdrop extends HTMLElement {}

define("ui-dialog", UIDialog);
define("ui-dialog-popup", UIDialogPopup);
define("ui-dialog-backdrop", UIDialogBackdrop);

declare global {
  interface HTMLElementTagNameMap {
    "ui-dialog": UIDialog;
    "ui-dialog-popup": UIDialogPopup;
    "ui-dialog-backdrop": UIDialogBackdrop;
  }
}
