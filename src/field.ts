/**
 * `ui-field` — wires a label, description and error message to a control by
 * IDREF and reflects its validity (Base UI's Field). This is the **light-DOM is
 * mandatory** case: `aria-labelledby` / `aria-describedby` / `aria-invalid`
 * cross-reference elements the consumer owns, which cannot span a shadow
 * boundary. Errors are shown after the field is "touched" (blur) or on form
 * submit, live-updating as the user corrects them; when the browser's
 * `validationMessage` is empty the element's own fallback text is used.
 *
 * Markup: `[data-field-control]` plus optional `[data-field-label]`,
 * `[data-field-description]` and `[data-field-error]`.
 */
import { connectLightDom } from "./lifecycle.ts";
import { nextId } from "./id.ts";

type Validatable = HTMLElement & {
  validity?: ValidityState;
  validationMessage?: string;
  checkValidity?: () => boolean;
};

export class UIField extends HTMLElement {
  #control: Validatable | null = null;
  #label: HTMLElement | null = null;
  #description: HTMLElement | null = null;
  #error: HTMLElement | null = null;
  #wired = false;
  #showErrors = false;

  /** The associated control (for `ui-form` orchestration). */
  get control(): HTMLElement | null {
    return this.#control;
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    this.#control =
      this.querySelector<Validatable>("[data-field-control]") ??
      this.querySelector<Validatable>("input, select, textarea");
    if (!this.#control) return;
    this.#wired = true;
    if (!this.#control.id) this.#control.id = nextId("ui-field-control");

    this.#label = this.querySelector<HTMLElement>("[data-field-label]");
    if (this.#label) {
      if (!this.#label.id) this.#label.id = nextId("ui-field-label");
      if (this.#label.tagName === "LABEL" && !this.#label.hasAttribute("for")) {
        (this.#label as HTMLLabelElement).htmlFor = this.#control.id;
      }
      this.#control.setAttribute("aria-labelledby", this.#label.id);
    }

    this.#description = this.querySelector<HTMLElement>("[data-field-description]");
    if (this.#description && !this.#description.id) {
      this.#description.id = nextId("ui-field-description");
    }

    this.#error = this.querySelector<HTMLElement>("[data-field-error]");
    if (this.#error) {
      if (!this.#error.id) this.#error.id = nextId("ui-field-error");
      this.#error.setAttribute("role", "alert");
      this.#error.setAttribute("aria-live", "polite");
      this.#error.hidden = true;
    }

    this.#applyDescribedBy();
    this.#control.addEventListener("invalid", this.#onInvalid);
    this.#control.addEventListener("input", this.#onInteract);
    this.#control.addEventListener("change", this.#onInteract);
    this.#control.addEventListener("blur", this.#onBlur);
  }

  #isValid(): boolean {
    return this.#control?.validity ? this.#control.validity.valid : true;
  }

  #applyDescribedBy() {
    if (!this.#control) return;
    const ids: string[] = [];
    if (this.#description) ids.push(this.#description.id);
    if (this.#error && this.#showErrors && !this.#isValid()) ids.push(this.#error.id);
    if (ids.length) this.#control.setAttribute("aria-describedby", ids.join(" "));
    else this.#control.removeAttribute("aria-describedby");
  }

  #refresh() {
    if (!this.#control) return;
    if (this.#showErrors && !this.#isValid()) {
      this.#control.setAttribute("aria-invalid", "true");
      if (this.#error) {
        const message = this.#control.validationMessage;
        if (message) this.#error.textContent = message; // else keep the fallback text
        this.#error.hidden = false;
      }
    } else {
      this.#control.removeAttribute("aria-invalid");
      if (this.#error) this.#error.hidden = true;
    }
    this.#applyDescribedBy();
  }

  #onInvalid = (e: Event) => {
    e.preventDefault(); // suppress the native bubble; we render the message
    this.#showErrors = true;
    this.#refresh();
  };
  #onInteract = () => {
    if (this.#showErrors) this.#refresh();
  };
  #onBlur = () => {
    this.#showErrors = true;
    this.#refresh();
  };

  /** Force validation display; returns whether the control is valid. */
  validate(): boolean {
    this.#showErrors = true;
    const valid =
      typeof this.#control?.checkValidity === "function"
        ? this.#control.checkValidity()
        : this.#isValid();
    this.#refresh();
    return valid;
  }
}

if (!customElements.get("ui-field")) customElements.define("ui-field", UIField);

declare global {
  interface HTMLElementTagNameMap {
    "ui-field": UIField;
  }
}
