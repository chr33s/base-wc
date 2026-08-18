/**
 * `ui-dialog` — a **modal** dialog (Base UI's Dialog). Composes the overlay
 * infrastructure: the Popover-API top layer, {@link trapFocus} (focus cycle +
 * focus restore), and {@link lockScroll} (reference-counted background lock).
 * `role="dialog"` + `aria-modal="true"`, with `aria-labelledby` /
 * `aria-describedby` wired from `[data-dialog-title]` / `[data-dialog-description]`
 * — a light-DOM cross-reference that only works because there is no shadow root.
 *
 * Markup: a `[data-dialog-trigger]`, an optional `<ui-dialog-backdrop>`, and a
 * `<ui-dialog-popup>`. Dismisses on `Escape` and outside press unless the
 * `static` attribute is set. The `alert` attribute is the Alert Dialog variant:
 * it implies `static` (forced action) and switches the popup to
 * `role="alertdialog"`.
 */
import { connectLightDom } from "./lifecycle.ts";
import { onOutsidePress } from "./dismiss.ts";
import { trapFocus } from "./focus-trap.ts";
import { nextId } from "./id.ts";
import { lockScroll } from "./scroll-lock.ts";
import { runExit, setOpenState } from "./transitions.ts";

export class UIDialog extends HTMLElement {
  #trigger: HTMLElement | null = null;
  #popup: HTMLElement | null = null;
  #isOpen = false;
  #wired = false;
  #releaseFocus: ((restoreFocus?: boolean) => void) | null = null;
  #unlockScroll: (() => void) | null = null;
  #stopDismiss: (() => void) | null = null;

  get open(): boolean {
    return this.#isOpen;
  }
  /**
   * When set (via `static`, or implied by `alert`), suppress Escape +
   * outside-press dismissal — the dialog can only be closed by an explicit
   * in-dialog action.
   */
  get static(): boolean {
    return this.hasAttribute("static") || this.hasAttribute("alert");
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    this.#trigger = this.querySelector<HTMLElement>("[data-dialog-trigger]");
    this.#popup = this.querySelector<HTMLElement>("ui-dialog-popup");
    if (!this.#popup) return;
    this.#wired = true;

    if (!this.#popup.id) this.#popup.id = nextId("ui-dialog-popup");
    // Alert dialogs force an explicit action: role=alertdialog + no dismissal.
    if (this.hasAttribute("alert")) this.#popup.setAttribute("role", "alertdialog");
    const title = this.querySelector("[data-dialog-title]");
    const description = this.querySelector("[data-dialog-description]");
    if (title) {
      if (!title.id) title.id = nextId("ui-dialog-title");
      this.#popup.setAttribute("aria-labelledby", title.id);
    }
    if (description) {
      if (!description.id) description.id = nextId("ui-dialog-description");
      this.#popup.setAttribute("aria-describedby", description.id);
    }

    if (this.#trigger) {
      if (this.#trigger instanceof HTMLButtonElement && !this.#trigger.hasAttribute("type")) {
        this.#trigger.type = "button"; // never submit an enclosing form
      }
      this.#trigger.setAttribute("aria-haspopup", "dialog");
      this.#trigger.setAttribute("aria-expanded", "false");
      this.#trigger.setAttribute("aria-controls", this.#popup.id);
      this.#trigger.addEventListener("click", this.#onTriggerClick);
    }
    this.#popup.addEventListener("keydown", this.#onPopupKeydown);
  }

  disconnectedCallback() {
    this.#teardown({ restoreFocus: false });
  }

  show() {
    // Wire synchronously if `show()` is called in the same task as connection,
    // before the deferred wiring microtask has run — otherwise #popup is still
    // null and the open would silently no-op.
    if (!this.#wired) this.#wire();
    if (this.#isOpen || !this.#popup) return;
    this.#isOpen = true;
    this.#trigger?.setAttribute("aria-expanded", "true");
    this.#popup.setAttribute("data-open", "");
    setOpenState(this.#popup, true);
    try {
      this.#popup.showPopover?.();
    } catch {
      /* not supported / already shown */
    }
    this.#unlockScroll = lockScroll();
    this.#releaseFocus = trapFocus(this.#popup);
    if (!this.static) {
      // Outside press closes; the trigger is treated as inside so its own click
      // handler owns toggling instead of double-firing with dismissal.
      this.#stopDismiss = onOutsidePress([this.#popup, this.#trigger], () => this.#close());
    }
    this.dispatchEvent(new CustomEvent("open", { bubbles: true }));
  }

  hide() {
    this.#close();
  }

  #close() {
    this.#teardown({ restoreFocus: true });
  }

  #teardown({ restoreFocus }: { restoreFocus: boolean }) {
    if (!this.#isOpen || !this.#popup) return;
    this.#isOpen = false;
    this.#trigger?.setAttribute("aria-expanded", "false");
    this.#popup.removeAttribute("data-open");
    const popup = this.#popup;
    runExit(popup, () => {
      if (!this.#isOpen) {
        try {
          popup.hidePopover?.();
        } catch {
          /* not supported / already hidden */
        }
      }
    });
    this.#stopDismiss?.();
    this.#stopDismiss = null;
    this.#unlockScroll?.();
    this.#unlockScroll = null;
    // Always release the trap so its document-level keydown listener is
    // detached; only restore focus to the pre-open element when closing
    // normally (on disconnect there is nothing sensible to focus).
    this.#releaseFocus?.(restoreFocus);
    this.#releaseFocus = null;
    this.dispatchEvent(new CustomEvent("close", { bubbles: true }));
  }

  #onTriggerClick = () => {
    if (this.#isOpen) this.#close();
    else this.show();
  };

  #onPopupKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !this.static) {
      e.preventDefault();
      this.#close();
    }
  };
}

export class UIDialogPopup extends HTMLElement {
  connectedCallback() {
    this.setAttribute("role", "dialog");
    this.setAttribute("aria-modal", "true");
    this.setAttribute("popover", "manual");
    this.tabIndex = -1;
  }
}

export class UIDialogBackdrop extends HTMLElement {}

if (!customElements.get("ui-dialog")) customElements.define("ui-dialog", UIDialog);
if (!customElements.get("ui-dialog-popup")) customElements.define("ui-dialog-popup", UIDialogPopup);
if (!customElements.get("ui-dialog-backdrop"))
  customElements.define("ui-dialog-backdrop", UIDialogBackdrop);

declare global {
  interface HTMLElementTagNameMap {
    "ui-dialog": UIDialog;
    "ui-dialog-popup": UIDialogPopup;
    "ui-dialog-backdrop": UIDialogBackdrop;
  }
}
