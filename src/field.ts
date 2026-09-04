/**
 * `ui-field` — wires a label, description and error message to a control by
 * IDREF and reflects its validity (Base UI's Field). This is the **light-DOM is
 * mandatory** case: `aria-labelledby` / `aria-describedby` / `aria-invalid`
 * cross-reference elements the consumer owns, which cannot span a shadow
 * boundary. Errors are shown after the field is "touched" (blur) or on form
 * submit, live-updating as the user corrects them; when the browser's
 * `validationMessage` is empty the element's own fallback text is used.
 *
 * **Custom validation.** Assign a {@link UIField.validate | `validate`} function
 * to run consumer rules on top of the native constraints. It may return a
 * message (or `null`), or a promise of one for a server check. The result is
 * published through the control's own `setCustomValidity`, so a custom error
 * blocks a real `<form>` submission exactly as `required` does — the field never
 * keeps a private notion of validity the form cannot see. `validation-mode`
 * picks when it runs (`submit`, the default, or `change` / `blur`), and
 * `validation-debounce` throttles it in `change` mode.
 *
 * While an async check is in flight the field publishes **neither** valid nor
 * invalid: a fresh all-clear would be a lie about a result nobody has yet, and
 * a stale one is worse. Native constraint failures are the exception — those
 * are known synchronously and still block submission during the wait.
 *
 * State is mirrored on the host as `data-touched`, `data-dirty`, `data-filled`,
 * `data-focused`, `data-valid` and `data-invalid` for consumer CSS.
 *
 * Markup: `[data-field-control]` plus optional `[data-field-label]`,
 * `[data-field-description]` and `[data-field-error]`.
 */
import { define } from "./define.ts";
import { LightDomElement } from "./lifecycle.ts";
import { nextId } from "./id.ts";
import { numberAttribute } from "./math.ts";

// The control contract: native controls implement it, and the library's
// form-value-bearing elements expose the same members via the shared
// form-control layer — so validity is never silently assumed.
type Validatable = HTMLElement & {
  readonly validity: ValidityState;
  readonly validationMessage: string;
  checkValidity(): boolean;
  /** Present on native controls and on the shared form-control layer alike. */
  setCustomValidity?(message: string): void;
  /** Native controls are strings; the library's multi-value ones are arrays. */
  readonly value?: string | number | readonly (string | number)[] | null;
};

/** What a {@link FieldValidate} may report: a message, several, or no error. */
export type FieldValidateResult = string | string[] | null | undefined;

/** A consumer validation rule. Returning a promise makes the field async. */
export type FieldValidate = (
  value: string,
  control: HTMLElement,
) => FieldValidateResult | Promise<FieldValidateResult>;

/** When {@link FieldValidate} runs. */
export type FieldValidationMode = "submit" | "change" | "blur";

export class UIField extends LightDomElement {
  #control: Validatable | null = null;
  #label: HTMLElement | null = null;
  #description: HTMLElement | null = null;
  #error: HTMLElement | null = null;
  #showErrors = false;
  #validate: FieldValidate | null = null;
  /**
   * Monotonic run id. Every async result checks it before publishing, so a
   * slow check for an old value can never overwrite a newer one's verdict —
   * the classic out-of-order-response bug for a field the user keeps typing in.
   */
  #run = 0;
  /** Whether an async check is outstanding, i.e. validity is unknown. */
  #pending = false;
  #debounceTimer = 0;
  /** The value at wire time, against which `data-dirty` is judged. */
  #initialValue = "";
  #touched = false;
  #focused = false;

  /** The associated control (for `ui-form` orchestration). */
  get control() {
    return this.#control;
  }

  /**
   * Consumer validation on top of the native constraints. Set as a property —
   * a function cannot be an attribute. Assigning re-validates only if the field
   * has already been asked to show errors, so attaching a rule never makes an
   * untouched field turn red.
   */
  get validate(): FieldValidate | null {
    return this.#validate;
  }
  set validate(next: FieldValidate | null) {
    this.#validate = next;
    if (this.wired && this.#showErrors) this.#runValidation();
  }

  /**
   * When {@link validate} runs: on form submit (the default), on every change,
   * or on blur. Native constraints are always checked on top of this — the mode
   * only governs the consumer rule.
   */
  get validationMode(): FieldValidationMode {
    const mode = this.getAttribute("validation-mode");
    return mode === "change" || mode === "blur" ? mode : "submit";
  }

  /** Debounce for `change` mode, in ms. Ignored in the other modes. */
  get validationDebounce() {
    return numberAttribute(this, "validation-debounce", 0);
  }

  /** Whether an async {@link validate} is still in flight. */
  get validating() {
    return this.#pending;
  }

  protected override wire() {
    this.#control =
      this.querySelector<Validatable>("[data-field-control]") ??
      this.querySelector<Validatable>("input, select, textarea");
    if (!this.#control) return;
    this.wired = true;
    if (!this.#control.id) this.#control.id = nextId("ui-field-control");
    this.#initialValue = this.#value();

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
    this.#control.addEventListener("focus", this.#onFocus);
    this.#control.addEventListener("blur", this.#onBlur);
    this.#refresh();
  }

  disconnectedCallback() {
    clearTimeout(this.#debounceTimer);
    // Retire any in-flight run: its result would publish onto a detached field.
    this.#run++;
  }

  /** The control's value as a string — arrays (multi-select) join, `null` is "". */
  #value() {
    const value = this.#control?.value;
    if (value == null) return "";
    return Array.isArray(value) ? value.join(",") : String(value as string | number);
  }

  #isValid() {
    return this.#control ? this.#control.validity.valid : true;
  }

  #applyDescribedBy() {
    if (!this.#control) return;
    const ids: string[] = [];
    if (this.#description) ids.push(this.#description.id);
    if (this.#error && this.#showing()) ids.push(this.#error.id);
    if (ids.length) this.#control.setAttribute("aria-describedby", ids.join(" "));
    else this.#control.removeAttribute("aria-describedby");
  }

  /** Whether the error message should currently be on screen. */
  #showing() {
    return this.#showErrors && !this.#pending && !this.#isValid();
  }

  #refresh() {
    const control = this.#control;
    if (!control) return;
    const showing = this.#showing();
    if (showing) {
      control.setAttribute("aria-invalid", "true");
      if (this.#error) {
        const message = control.validationMessage;
        if (message) this.#error.textContent = message; // else keep the fallback text
        this.#error.hidden = false;
      }
    } else {
      control.removeAttribute("aria-invalid");
      if (this.#error) this.#error.hidden = true;
    }
    this.#applyDescribedBy();
    this.#reflectState();
  }

  /** Mirror the field's state onto the host for consumer CSS. */
  #reflectState() {
    const value = this.#value();
    this.toggleAttribute("data-touched", this.#touched);
    this.toggleAttribute("data-focused", this.#focused);
    this.toggleAttribute("data-filled", value !== "");
    // Compared against the value the field was wired with, not against "" — a
    // control that starts populated is not dirty until the user changes it.
    this.toggleAttribute("data-dirty", value !== this.#initialValue);
    // Mid-flight the verdict is unknown, so neither flag is published: an
    // all-clear would be a claim nobody has checked, and both together are a
    // contradiction. This is the same neutral state as before first validation.
    const valid = this.#pending ? null : this.#isValid();
    this.toggleAttribute("data-valid", valid === true);
    this.toggleAttribute("data-invalid", valid === false);
  }

  /**
   * Hand the consumer rule's verdict to the control. Routed through
   * `setCustomValidity` rather than kept here so the *control* owns it: a real
   * `<form>` submit, `:invalid` styling and `checkValidity()` all then see the
   * custom error, and the field has no private validity to drift out of step.
   */
  #setCustomError(message: string | null) {
    this.#control?.setCustomValidity?.(message ?? "");
  }

  /**
   * Run the consumer rule and publish its verdict.
   *
   * The previous custom error is cleared *first*, because a lingering
   * `customError` makes the control invalid regardless of everything else — so
   * a field that once failed a custom rule would never report `valueMissing`
   * again once the user emptied it.
   */
  #runValidation() {
    const control = this.#control;
    if (!control) return;
    clearTimeout(this.#debounceTimer);
    const run = ++this.#run;
    this.#pending = false;
    this.#setCustomError(null);

    // A native constraint failure is known now and outranks the custom rule;
    // there is nothing an async check could add, and running it would only put
    // the field into the neutral state while a real failure is already visible.
    if (!this.#validate || !control.validity.valid) {
      this.#refresh();
      return;
    }

    const result = this.#validate(this.#value(), control);
    if (!isPromise(result)) {
      this.#setCustomError(firstMessage(result));
      this.#refresh();
      return;
    }

    this.#pending = true;
    this.#refresh(); // neutral while the answer is unknown
    result.then(
      (message) => {
        if (run !== this.#run) return; // superseded by a newer run
        this.#pending = false;
        this.#setCustomError(firstMessage(message));
        this.#refresh();
      },
      () => {
        // A rejected check is not an assertion that the value is bad; leave the
        // field clear rather than inventing a message for it.
        if (run !== this.#run) return;
        this.#pending = false;
        this.#refresh();
      },
    );
  }

  #onInvalid = (e: Event) => {
    e.preventDefault(); // suppress the native bubble; we render the message
    this.#showErrors = true;
    this.#refresh();
  };

  #onInteract = () => {
    if (this.validationMode === "change") {
      const wait = this.validationDebounce;
      clearTimeout(this.#debounceTimer);
      if (wait > 0) {
        // The pending run is retired immediately so the debounce window does
        // not sit on a stale verdict for a value the user has already changed.
        this.#run++;
        this.#pending = false;
        this.#refresh();
        this.#debounceTimer = window.setTimeout(() => this.#runValidation(), wait);
        return;
      }
      this.#runValidation();
      return;
    }
    // Outside `change` mode a keystroke still clears a custom error it may have
    // invalidated, so the message tracks the value instead of outliving it.
    if (this.#showErrors) {
      this.#setCustomError(null);
      this.#refresh();
      return;
    }
    // `data-filled` / `data-dirty` describe the value, not the verdict, so they
    // track every keystroke even in a mode that validates nothing until submit.
    this.#reflectState();
  };

  #onFocus = () => {
    this.#focused = true;
    this.#reflectState();
  };

  #onBlur = () => {
    this.#focused = false;
    this.#touched = true;
    this.#showErrors = true;
    if (this.validationMode === "blur") this.#runValidation();
    else this.#refresh();
  };

  /**
   * Validate now and show the result — the native method's contract, and the
   * one `ui-form` drives on submit. (`validate` is the *rule*; this runs it.)
   *
   * Synchronous by design: it is called from a `submit` handler, where there is
   * no opportunity to await. A still-pending async check therefore does not
   * block the submit — only results already resolved, and the native
   * constraints, do. Base UI makes the same trade.
   */
  reportValidity() {
    this.#touched = true;
    this.#showErrors = true;
    this.#runValidation();
    const valid = this.#control ? this.#control.checkValidity() : true;
    this.#refresh();
    return valid;
  }
}

/** Narrow an unknown validation result to a thenable. */
function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T> | undefined)?.then === "function";
}

/**
 * The message to publish for a validation result. A rule may report several
 * problems at once; only one can occupy the control's single custom-error slot,
 * and the first is the one the author listed first.
 */
function firstMessage(result: FieldValidateResult): string | null {
  if (result == null) return null;
  const message = Array.isArray(result) ? result[0] : result;
  return message ? message : null;
}

define("ui-field", UIField);

declare global {
  interface HTMLElementTagNameMap {
    "ui-field": UIField;
  }
}
