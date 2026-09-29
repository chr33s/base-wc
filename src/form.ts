/**
 * `ui-form` — validation orchestration over its `ui-field`s (Base UI's Form). On
 * submit it validates every field once, through each field's `reportValidity()`
 * — one pass, so an implicit submit (Enter in a text field) does not validate
 * twice; if any is invalid it blocks the submit,
 * moves focus to the first invalid control, fills an optional
 * `[data-form-error-summary]`, and dispatches a `form-invalid` event. A clean
 * submit dispatches `form-valid` and proceeds. Wraps a native `<form>` when
 * present so real submission and `FormData` keep working.
 */
import { define } from "./define.ts";
import { LightDomElement } from "./lifecycle.ts";
import type { UIField } from "./field.ts";

/** Validates every `ui-field` on submit, blocks an invalid submit, focuses the first error and reports `form-invalid` / `form-valid`. */
export class UIForm extends LightDomElement {
  protected override initialize() {
    const form = this.querySelector("form");
    (form ?? this).addEventListener("submit", this.#onSubmit);
    // Marked wired only once the listener is attached. The native <form> is a
    // genuinely optional part — `submit` bubbles, so the host-level fallback
    // listener covers a form even if one parses in later — hence no retry.
    return true;
  }

  #fields() {
    return [...this.querySelectorAll<UIField>("ui-field")];
  }

  #onSubmit = (e: Event) => {
    const invalid: UIField[] = [];
    for (const field of this.#fields()) {
      if (!field.reportValidity()) invalid.push(field);
    }

    const summary = this.querySelector<HTMLElement>("[data-form-error-summary]");
    if (invalid.length > 0) {
      e.preventDefault();
      invalid[0]?.control?.focus?.();
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

define("ui-form", UIForm);

declare global {
  interface HTMLElementTagNameMap {
    "ui-form": UIForm;
  }
}
