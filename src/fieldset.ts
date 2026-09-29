/**
 * `ui-fieldset` — groups related controls under a shared label and propagates a
 * disabled state to them (Base UI's Fieldset). `role="group"` with
 * `aria-labelledby` from `[data-fieldset-legend]`. When the fieldset's
 * `disabled` attribute is set it disables every descendant control; removing it
 * re-enables only the controls it disabled (controls disabled on their own are
 * left alone).
 */
import { define } from "./define.ts";
import { FORM_CONTROL_TAGS } from "./form-control.ts";
import { LightDomElement } from "./lifecycle.ts";
import { nextId } from "./id.ts";

// Native controls plus the library's form-value-bearing elements (the shared
// {@link FORM_CONTROL_TAGS} roster, so a new form control is picked up here
// automatically). Pure native enhancers (`ui-switch`, `ui-checkbox`,
// `ui-date-field`, …) are not listed: disabling their inner `input` (matched
// below) is what suppresses interaction and submission.
const CONTROLS = ["input", "select", "textarea", "button", ...FORM_CONTROL_TAGS].join(",");

export class UIFieldset extends LightDomElement {
  static observedAttributes = ["disabled"];

  #managed = new Set<Element>();

  protected override initialize() {
    this.setAttribute("role", "group");
    const legend = this.querySelector<HTMLElement>("[data-fieldset-legend]");
    if (legend) {
      if (!legend.id) legend.id = nextId("ui-fieldset-legend");
      this.setAttribute("aria-labelledby", legend.id);
    }
    this.#propagateDisabled();
    return true;
  }

  attributeChangedCallback() {
    if (this.wired) this.#propagateDisabled();
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

define("ui-fieldset", UIFieldset);

declare global {
  interface HTMLElementTagNameMap {
    "ui-fieldset": UIFieldset;
  }
}
