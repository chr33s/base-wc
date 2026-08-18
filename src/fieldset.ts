/**
 * `ui-fieldset` — groups related controls under a shared label and propagates a
 * disabled state to them (Base UI's Fieldset). `role="group"` with
 * `aria-labelledby` from `[data-fieldset-legend]`. When the fieldset's
 * `disabled` attribute is set it disables every descendant control; removing it
 * re-enables only the controls it disabled (controls disabled on their own are
 * left alone).
 */
import { connectLightDom } from "./lifecycle.ts";
import { nextId } from "./id.ts";

// `ui-switch` / `ui-checkbox` are not listed: they enhance a native checkbox,
// so disabling their inner `input` (matched below) is what suppresses interaction
// and submission.
const CONTROLS = [
  "input",
  "select",
  "textarea",
  "button",
  "ui-radio-group",
  "ui-select",
  "ui-combobox",
  "ui-number-field",
  "ui-slider",
  "ui-toggle",
  "ui-toggle-group",
].join(",");

export class UIFieldset extends HTMLElement {
  static observedAttributes = ["disabled"];

  #wired = false;
  #managed = new Set<Element>();

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    this.#wired = true;
    this.setAttribute("role", "group");
    const legend = this.querySelector<HTMLElement>("[data-fieldset-legend]");
    if (legend) {
      if (!legend.id) legend.id = nextId("ui-fieldset-legend");
      this.setAttribute("aria-labelledby", legend.id);
    }
    this.#propagateDisabled();
  }

  attributeChangedCallback() {
    if (this.#wired) this.#propagateDisabled();
  }

  #propagateDisabled() {
    const disabled = this.hasAttribute("disabled");
    this.setAttribute("aria-disabled", String(disabled));
    const controls = [...this.querySelectorAll<HTMLElement>(CONTROLS)];
    if (disabled) {
      for (const control of controls) {
        if (!control.hasAttribute("disabled")) {
          control.setAttribute("disabled", "");
          this.#managed.add(control);
        }
      }
    } else {
      for (const control of this.#managed) control.removeAttribute("disabled");
      this.#managed.clear();
    }
  }
}

if (!customElements.get("ui-fieldset")) customElements.define("ui-fieldset", UIFieldset);

declare global {
  interface HTMLElementTagNameMap {
    "ui-fieldset": UIFieldset;
  }
}
