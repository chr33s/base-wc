/**
 * Shared form-association layer for the value-bearing controls.
 *
 * Every self-rendered control (`ui-calendar`, `ui-color-picker`,
 * `ui-number-field`, `ui-slider`, `ui-radio-group`, `ui-otp-field`, …) is
 * form-associated through {@link ElementInternals}; the native-first ones also
 * support the {@link adoptedControl} convention where an authored `<input>` is
 * the submitting value source instead. {@link formControl} is the one copy of
 * that split: it owns the internals instance, routes every form-value write
 * through a single `setValue`, stays inert while a native control is adopted
 * (no double submission), and adds the constraint-validation minimum the
 * hand-rolled versions all missed — `required`/`valueMissing` with a
 * validation message, so `ui-field` can render real errors.
 *
 * The lifecycle callbacks (`formResetCallback`, `formDisabledCallback`) must be
 * **methods on the component class** for the browser to invoke them; each
 * component declares them as one-line delegates to `handleReset` /
 * `handleDisabled`, and passes `onReset` / `onFormDisabled` callbacks that
 * restore its own UI state. Adoption is mechanical: add the delegates, the
 * validity getters, and route `setFormValue` calls through `setValue`.
 *
 * {@link NativeCheckboxElement} lives here too: the shared base for the pure
 * native-checkbox enhancers (`ui-checkbox`, `ui-switch`), which carry no
 * internals at all — their adopted `<input type="checkbox">` is the control.
 */
import { connectLightDom } from "./lifecycle.ts";
import { adoptedControl } from "./native.ts";

/**
 * The library's form-value-bearing tags — every `ui-*` element that submits a
 * value of its own (via `ElementInternals` or an adopted native control).
 * `ui-fieldset` derives its disable-propagation list from this. Pure native
 * enhancers (`ui-switch`, `ui-checkbox`, `ui-date-field`, `ui-color-field`,
 * `ui-search-field`) are absent on purpose: their inner `<input>` is the
 * submitting control and is matched directly.
 */
export const FORM_CONTROL_TAGS = [
  "ui-autocomplete",
  "ui-calendar",
  "ui-color-picker",
  "ui-combobox",
  "ui-number-field",
  "ui-otp-field",
  "ui-radio-group",
  "ui-select",
  "ui-slider",
] as const;

/** Default `required`-but-empty message (mirrors the browsers' own wording). */
const MISSING_MESSAGE = "Please fill out this field.";

export interface FormControlOptions {
  /**
   * True while an authored native control is the adopted, submitting value
   * source ({@link adoptedControl} convention). While adopted the controller
   * is inert: `setValue` writes nothing to internals (the native control
   * submits — no double submission) and the host reports itself valid, since
   * the native control carries its own constraint validation.
   */
  adopted?: () => boolean;
  /** The control's current value; `null` / `""` count as empty for `required`. */
  value: () => string | FormData | null;
  /** Restore the component's own UI/value on `form.reset()`. */
  onReset?: () => void;
  /**
   * Reflect the form-driven disabled state (the host's `disabled` attribute or
   * a disabled native `<fieldset>` ancestor) onto the component's UI.
   */
  onFormDisabled?: (disabled: boolean) => void;
  /** Overrides the default `required`-but-empty validation message. */
  missingMessage?: string;
}

export interface FormControl {
  readonly internals: ElementInternals | null;
  /** The owning form (standalone mode; adopted mode reads the native control). */
  readonly form: HTMLFormElement | null;
  readonly validity: ValidityState;
  readonly validationMessage: string;
  /** The single entry point for form-value writes; refreshes validity too. */
  setValue(value: string | FormData | null): void;
  /** Like a native control's: fires `invalid` on the host when invalid. */
  checkValidity(): boolean;
  reportValidity(): boolean;
  /** Delegate of the component's `formResetCallback`. */
  handleReset(): void;
  /** Delegate of the component's `formDisabledCallback`. */
  handleDisabled(disabled: boolean): void;
}

/** A ValidityState where only `valueMissing` can be raised. */
function validityOf(valueMissing: boolean) {
  return {
    badInput: false,
    customError: false,
    patternMismatch: false,
    rangeOverflow: false,
    rangeUnderflow: false,
    stepMismatch: false,
    tooLong: false,
    tooShort: false,
    typeMismatch: false,
    valueMissing,
    valid: !valueMissing,
  } as ValidityState;
}

/**
 * Create the form-association controller for a form-associated custom element.
 * Construct once, from a field initializer (internals can only be attached
 * once per element).
 */
export function formControl(host: HTMLElement, options: FormControlOptions): FormControl {
  // Guarded so the element can still be constructed where ElementInternals is
  // unavailable (older DOM shims); everything degrades to no-ops.
  const internals = host.attachInternals?.() ?? null;

  const isAdopted = () => options.adopted?.() ?? false;
  const isEmpty = (v: string | FormData | null) => v == null || v === "";
  const valueMissing = () =>
    !isAdopted() && host.hasAttribute("required") && isEmpty(options.value());
  const message = () => options.missingMessage ?? MISSING_MESSAGE;

  return {
    internals,
    get form() {
      return internals?.form ?? null;
    },
    // Validity is synthesized (not read back from internals) so it is fresh
    // even when `required` toggles between writes, and identical across DOMs
    // with partial ElementInternals support.
    get validity() {
      return validityOf(valueMissing());
    },
    get validationMessage() {
      return valueMissing() ? message() : "";
    },
    setValue(value) {
      if (isAdopted()) return; // the adopted native control is the form value
      internals?.setFormValue(value);
      // Mirror validity into internals so real submits are blocked and
      // `:invalid` styling applies where supported.
      const missing = valueMissing();
      internals?.setValidity?.(missing ? { valueMissing: true } : {}, missing ? message() : "");
    },
    checkValidity() {
      if (!valueMissing()) return true;
      host.dispatchEvent(new Event("invalid", { cancelable: true }));
      return false;
    },
    reportValidity() {
      // No native bubble of our own — `ui-field` renders the message.
      return this.checkValidity();
    },
    handleReset() {
      options.onReset?.();
    },
    handleDisabled(disabled) {
      options.onFormDisabled?.(disabled);
    },
  };
}

/**
 * Base class for the **pure enhancers of an authored native checkbox**
 * (`ui-checkbox`, `ui-switch`). The native input is the interactive control
 * and the form value — there is no `ElementInternals` fallback. The base owns
 * adoption, the shared getters/setters, and the state mirroring onto the
 * `data-state` / `data-disabled` hooks; subclasses refine it through the
 * protected hooks (`ui-switch` announces `role="switch"` and mirrors
 * `aria-checked`; `ui-checkbox` adds `indeterminate`).
 */
export class NativeCheckboxElement extends HTMLElement {
  #input: HTMLInputElement | null = null;
  #wired = false;

  /** The adopted native checkbox — the interactive control + form value. */
  protected get input() {
    return this.#input;
  }

  get form() {
    return this.#input?.form ?? null;
  }
  get name() {
    return this.#input?.name ?? null;
  }
  get value() {
    return this.#input?.value || "on";
  }
  get checked() {
    return this.#input?.checked ?? false;
  }
  set checked(next: boolean) {
    if (!this.#input) return;
    this.#input.checked = next;
    this.sync();
  }
  get disabled() {
    return this.#input?.disabled ?? false;
  }
  set disabled(next: boolean) {
    if (!this.#input) return;
    this.#input.disabled = next;
    this.sync();
  }

  connectedCallback() {
    // Defer a microtask so the authored native child has parsed (an element can
    // upgrade mid-parse, before its children exist).
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    const input = adoptedControl<HTMLInputElement>(this, 'input[type="checkbox"]');
    if (!input) return; // no control to enhance
    this.#wired = true;
    this.#input = input;
    this.adopt(input);
    // `change` covers user toggles; `input` lets a host that mutates the control
    // programmatically (e.g. a "select all" driving row boxes) signal the change
    // with `dispatchEvent(new Event("input"))` — the property setters fire no
    // event, and `indeterminate` has none at all.
    input.addEventListener("change", this.sync);
    input.addEventListener("input", this.sync);
    this.sync();
  }

  /** One-time adoption hook (e.g. announce `role="switch"`). */
  protected adopt(_input: HTMLInputElement) {}

  /** What `data-state` shows (`ui-checkbox` adds `indeterminate`). */
  protected stateOf(input: HTMLInputElement): string {
    return input.checked ? "checked" : "unchecked";
  }

  /** Extra per-sync reflection (e.g. the switch's `aria-checked` mirror). */
  protected reflect(_input: HTMLInputElement) {}

  /** Mirror the native control's state onto the CSS state hooks. */
  protected sync = () => {
    const input = this.#input;
    if (!input) return;
    this.reflect(input);
    this.setAttribute("data-state", this.stateOf(input));
    this.toggleAttribute("data-disabled", input.disabled);
  };
}
