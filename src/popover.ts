/**
 * `ui-popover` — an anchored, **non-modal** popup (Base UI's Popover). Reuses
 * the whole popup stack: {@link anchor} positioning, the Popover-API top layer,
 * and {@link onOutsidePress} light-dismiss. Non-modal means the page behind
 * stays interactive — no focus trap, no scroll lock (that is `ui-dialog`).
 *
 * Markup: a `[data-popover-trigger]` and a `<ui-popover-popup>`. The trigger
 * gets `aria-haspopup="dialog"` / `aria-expanded` / `aria-controls`; the popup
 * is `role="dialog"`, labelled/described from `[data-popover-title]` /
 * `[data-popover-description]` (a light-DOM cross-reference), and any
 * `[data-popover-close]` inside it closes the popup on click. On open, focus
 * optionally moves to the popup's `[autofocus]`; on close it returns to the
 * trigger.
 */
import { connectLightDom } from "./lifecycle.ts";
import { SUPPORTS_ANCHOR } from "./anchor.ts";
import { getFocusable } from "./focus-trap.ts";
import { nextId } from "./id.ts";
import { type Overlay, overlay } from "./overlay.ts";

export class UIPopover extends HTMLElement {
  #trigger: HTMLElement | null = null;
  #popup: HTMLElement | null = null;
  #arrow: HTMLElement | null = null;
  #isOpen = false;
  #wired = false;
  #overlay: Overlay | null = null;

  get open(): boolean {
    return this.#isOpen;
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    this.#trigger = this.querySelector<HTMLElement>("[data-popover-trigger]");
    this.#popup = this.querySelector<HTMLElement>("ui-popover-popup");
    if (!this.#trigger || !this.#popup) return;
    this.#wired = true;
    this.#arrow = this.#popup.querySelector<HTMLElement>("ui-arrow");

    if (this.#trigger instanceof HTMLButtonElement && !this.#trigger.hasAttribute("type")) {
      this.#trigger.type = "button"; // never submit an enclosing form
    }
    if (!this.#popup.id) this.#popup.id = nextId("ui-popover-popup");
    // Label/describe the dialog from its title/description so assistive tech
    // announces it (light-DOM cross-reference — no shadow boundary to cross).
    const title = this.querySelector("[data-popover-title]");
    const description = this.querySelector("[data-popover-description]");
    if (title) {
      if (!title.id) title.id = nextId("ui-popover-title");
      this.#popup.setAttribute("aria-labelledby", title.id);
    }
    if (description) {
      if (!description.id) description.id = nextId("ui-popover-description");
      this.#popup.setAttribute("aria-describedby", description.id);
    }
    this.#trigger.setAttribute("aria-haspopup", "dialog");
    this.#trigger.setAttribute("aria-expanded", "false");
    this.#trigger.setAttribute("aria-controls", this.#popup.id);
    this.#trigger.addEventListener("click", this.#onTriggerClick);
    this.#popup.addEventListener("keydown", this.#onPopupKeydown);
    this.#popup.addEventListener("click", (e) => {
      if ((e.target as Element).closest("[data-popover-close]")) this.hide();
    });

    if (SUPPORTS_ANCHOR) {
      const name = `--popover-${nextId("anchor")}`;
      this.#trigger.style.setProperty("anchor-name", name);
      this.#popup.style.setProperty("position-anchor", name);
    }

    this.#overlay = overlay(this.#popup, {
      anchor: { ref: () => this.#trigger, options: { offset: 6, padding: 8, arrow: this.#arrow } },
      dismiss: {
        within: () => [this.#popup, this.#trigger],
        onDismiss: () => this.#close({ restoreFocus: false }),
      },
    });
  }

  disconnectedCallback() {
    this.#close({ restoreFocus: false });
  }

  show() {
    if (this.#isOpen || !this.#popup || !this.#trigger) return;
    this.#isOpen = true;
    this.#trigger.setAttribute("aria-expanded", "true");
    this.#overlay?.show();
    getFocusable(this.#popup)[0]?.focus();
    this.dispatchEvent(new CustomEvent("open", { bubbles: true }));
  }

  hide() {
    this.#close();
  }

  toggle() {
    if (this.#isOpen) this.#close();
    else this.show();
  }

  #close({ restoreFocus = true }: { restoreFocus?: boolean } = {}) {
    if (!this.#isOpen || !this.#popup) return;
    this.#isOpen = false;
    this.#trigger?.setAttribute("aria-expanded", "false");
    const restore =
      restoreFocus && this.#trigger != null && this.#popup.contains(document.activeElement);
    this.#overlay?.hide();
    if (restore) this.#trigger?.focus();
    this.dispatchEvent(new CustomEvent("close", { bubbles: true }));
  }

  #onTriggerClick = () => this.toggle();

  #onPopupKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      this.#close();
    }
  };
}

export class UIPopoverPopup extends HTMLElement {
  connectedCallback() {
    this.setAttribute("role", "dialog");
    this.setAttribute("popover", "manual");
    this.tabIndex = -1;
  }
}

if (!customElements.get("ui-popover")) customElements.define("ui-popover", UIPopover);
if (!customElements.get("ui-popover-popup"))
  customElements.define("ui-popover-popup", UIPopoverPopup);

declare global {
  interface HTMLElementTagNameMap {
    "ui-popover": UIPopover;
    "ui-popover-popup": UIPopoverPopup;
  }
}
