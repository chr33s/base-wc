/**
 * `ui-chip` — a compact, optionally removable token (generalises the combobox's
 * selected-value chip into a standalone element).
 *
 * Set `removable` and it adopts a `[data-chip-remove]` button (or generates one)
 * whose click — or `Delete`/`Backspace` while the chip has focus — fires a
 * bubbling `remove` event carrying the `value` attribute, then plays the
 * `[data-state]` exit animation (via {@link runExit}) and removes the host.
 * `disabled` suppresses removal. Purely presentational otherwise.
 */
import { connectLightDom } from "./lifecycle.ts";
import { runExit, setOpenState } from "./transitions.ts";

export interface ChipRemoveDetail {
  readonly value: string | null;
}

export class UIChip extends HTMLElement {
  static observedAttributes = ["removable", "disabled"];
  #wired = false;
  #closing = false;

  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }
  get removable(): boolean {
    return this.hasAttribute("removable");
  }

  connectedCallback() {
    setOpenState(this, true);
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  attributeChangedCallback() {
    if (this.#wired) this.#syncRemove();
  }

  #wire() {
    this.#wired = true;
    this.addEventListener("keydown", this.#onKeydown);
    this.#syncRemove();
  }

  #syncRemove() {
    let btn = this.querySelector<HTMLElement>("[data-chip-remove]");
    if (this.removable && !btn) {
      btn = document.createElement("button");
      (btn as HTMLButtonElement).type = "button";
      btn.setAttribute("data-chip-remove", "");
      btn.setAttribute("data-chip-generated", "");
      btn.setAttribute("aria-label", "Remove");
      btn.textContent = "✕";
      this.append(btn);
    } else if (!this.removable && btn?.hasAttribute("data-chip-generated")) {
      btn.remove();
      btn = null;
    }
    if (btn && this.removable && !btn.dataset.chipWired) {
      btn.dataset.chipWired = "true";
      btn.addEventListener("click", this.#onRemoveClick);
    }
    // A removable chip is a keyboard target so Delete/Backspace can reach it.
    if (this.removable) {
      if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    } else if (this.getAttribute("tabindex") === "0") {
      this.removeAttribute("tabindex");
    }
  }

  #onRemoveClick = (e: Event) => {
    e.stopPropagation();
    this.dismiss();
  };

  #onKeydown = (e: KeyboardEvent) => {
    if (!this.removable || this.disabled) return;
    if ((e.key === "Delete" || e.key === "Backspace") && e.target === this) {
      e.preventDefault();
      this.dismiss();
    }
  };

  /** Fire `remove`, play the exit animation, then remove the host from the DOM. */
  dismiss() {
    if (this.disabled || this.#closing) return;
    this.#closing = true;
    this.dispatchEvent(
      new CustomEvent<ChipRemoveDetail>("remove", {
        bubbles: true,
        detail: { value: this.getAttribute("value") },
      }),
    );
    runExit(this, () => this.remove());
  }
}

if (!customElements.get("ui-chip")) customElements.define("ui-chip", UIChip);

declare global {
  interface HTMLElementTagNameMap {
    "ui-chip": UIChip;
  }
}
