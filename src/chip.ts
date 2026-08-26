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
import { define } from "./define.ts";
import { connectLightDom } from "./lifecycle.ts";
import { ensureButton } from "./parts.ts";
import { runExit, setOpenState } from "./transitions.ts";

export interface ChipRemoveDetail {
  readonly value: string | null;
}

export class UIChip extends HTMLElement {
  static observedAttributes = ["removable", "disabled"];
  #wired = false;
  #closing = false;

  get disabled() {
    return this.hasAttribute("disabled");
  }
  get removable() {
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
    if (this.removable) {
      const btn = ensureButton(this, {
        marker: "data-chip-remove",
        generatedMarker: "data-chip-generated",
        label: "Remove",
        text: "✕",
      });
      // Re-adding the same listener is a no-op, so re-syncs need no wired flag.
      btn.addEventListener("click", this.#onRemoveClick);
      // A removable chip is a keyboard target so Delete/Backspace can reach it.
      if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    } else {
      const btn = this.querySelector<HTMLElement>("[data-chip-remove]");
      if (btn?.hasAttribute("data-chip-generated")) btn.remove();
      if (this.getAttribute("tabindex") === "0") this.removeAttribute("tabindex");
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

define("ui-chip", UIChip);

declare global {
  interface HTMLElementTagNameMap {
    "ui-chip": UIChip;
  }
}
