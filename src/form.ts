/**
 * `ui-form` — validation orchestration over its `ui-field`s (Base UI's Form). On
 * submit it validates every field; if any is invalid it blocks the submit,
 * moves focus to the first invalid control, fills an optional
 * `[data-form-error-summary]`, and dispatches a `form-invalid` event. A clean
 * submit dispatches `form-valid` and proceeds. Wraps a native `<form>` when
 * present so real submission and `FormData` keep working.
 */
import { connectLightDom } from "./lifecycle.ts";
import type { UIField } from "./field.ts";

export class UIForm extends HTMLElement {
  #wired = false;

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    this.#wired = true;
    const form = this.querySelector("form");
    (form ?? this).addEventListener("submit", this.#onSubmit as EventListener);
  }

  #fields(): UIField[] {
    return [...this.querySelectorAll<UIField>("ui-field")];
  }

  #onSubmit = (e: Event) => {
    const invalid: UIField[] = [];
    for (const field of this.#fields()) {
      if (!field.validate()) invalid.push(field);
    }

    const summary = this.querySelector<HTMLElement>("[data-form-error-summary]");
    if (invalid.length > 0) {
      e.preventDefault();
      invalid[0].control?.focus?.();
      if (summary) {
        summary.hidden = false;
        summary.textContent = `${invalid.length} field${invalid.length === 1 ? "" : "s"} need attention.`;
      }
      this.dispatchEvent(
        new CustomEvent("form-invalid", { bubbles: true, detail: { count: invalid.length } }),
      );
    } else {
      if (summary) summary.hidden = true;
      this.dispatchEvent(new CustomEvent("form-valid", { bubbles: true }));
    }
  };
}

if (!customElements.get("ui-form")) customElements.define("ui-form", UIForm);

declare global {
  interface HTMLElementTagNameMap {
    "ui-form": UIForm;
  }
}
