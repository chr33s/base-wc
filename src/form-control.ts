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
 * **methods on the component class** for the browser to invoke them, so they —
 * and the rest of the plumbing every one of these controls repeated verbatim —
 * live on {@link FormAssociatedElement}, the base each of them extends. A
 * component supplies its value accessor and reset behaviour through
 * `formControlOptions()` and nothing else.
 *
 * {@link NativeCheckboxElement} lives here too: the shared base for the pure
 * native-checkbox enhancers (`ui-checkbox`, `ui-switch`), which carry no
 * internals at all — their adopted `<input type="checkbox">` is the control.
 */
import { LightDomElement } from "./lifecycle.ts";
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

/** How a form-associated component plugs into {@link formControl}: its value source and lifecycle hooks. */
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

/** Form-association controller: value submission, synthesized validity, and reset/disabled delegates. */
export interface FormControl {
  /** The element's `ElementInternals`, or `null` where unsupported. */
  readonly internals: ElementInternals | null;
  /** The owning form (standalone mode; adopted mode reads the native control). */
  readonly form: HTMLFormElement | null;
  /** Synthesized validity: only `valueMissing` and `customError` can be raised. */
  readonly validity: ValidityState;
  /** The custom error if set, else the required-but-empty message, else `""`. */
  readonly validationMessage: string;
  /** The single entry point for form-value writes; refreshes validity too. */
  setValue(value: string | FormData | null): void;
  /** Like a native control's: fires `invalid` on the host when invalid. */
  checkValidity(): boolean;
  /** Like a native control's: as {@link FormControl.checkValidity}, then surfaces the message. */
  reportValidity(): boolean;
  /**
   * Raise (or, with `""`, clear) a consumer-supplied error, exactly as the
   * native method does: a non-empty message sets `customError`, makes the
   * control invalid, and becomes its `validationMessage`. This is the hook
   * `ui-field` drives its `validate` callback through, so a custom error blocks
   * a real `<form>` submission the same way a native constraint does.
   */
  setCustomValidity(message: string): void;
  /** Delegate of the component's `formResetCallback`. */
  handleReset(): void;
  /** Delegate of the component's `formDisabledCallback`. */
  handleDisabled(disabled: boolean): void;
}

/** A ValidityState where only `valueMissing` and `customError` can be raised. */
function validityOf(flags: Pick<ValidityState, "valueMissing" | "customError">): ValidityState {
  const { valueMissing, customError } = flags;
  return {
    badInput: false,
    customError,
    patternMismatch: false,
    rangeOverflow: false,
    rangeUnderflow: false,
    stepMismatch: false,
    tooLong: false,
    tooShort: false,
    typeMismatch: false,
    valueMissing,
    valid: !valueMissing && !customError,
  };
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
  /** The consumer-supplied error, or `""` for none — see `setCustomValidity`. */
  let customMessage = "";
  const isEmpty = (v: string | FormData | null) => v == null || v === "";
  const valueMissing = () =>
    !isAdopted() && host.hasAttribute("required") && isEmpty(options.value());
  const message = () => options.missingMessage ?? MISSING_MESSAGE;

  /**
   * Mirror the current validity into internals so real submits are blocked and
   * `:invalid` styling applies where supported. Called after every write to
   * either half of the state — the value and the custom error — because the two
   * share one `setValidity` slot and the last write wins.
   */
  const syncValidity = () => {
    if (isAdopted()) return; // the adopted native control owns validity too
    const missing = valueMissing();
    if (customMessage) internals?.setValidity?.({ customError: true }, customMessage);
    else if (missing) internals?.setValidity?.({ valueMissing: true }, message());
    else internals?.setValidity?.({}, "");
  };

  return {
    internals,
    get form() {
      return internals?.form ?? null;
    },
    // Validity is synthesized (not read back from internals) so it is fresh
    // even when `required` toggles between writes, and identical across DOMs
    // with partial ElementInternals support.
    get validity() {
      return validityOf({ valueMissing: valueMissing(), customError: customMessage !== "" });
    },
    get validationMessage() {
      // A custom error outranks the built-in one, as it does natively.
      if (customMessage) return customMessage;
      return valueMissing() ? message() : "";
    },
    setValue(value) {
      if (isAdopted()) return; // the adopted native control is the form value
      internals?.setFormValue(value);
      syncValidity();
    },
    setCustomValidity(next) {
      customMessage = next;
      syncValidity();
    },
    checkValidity() {
      if (this.validity.valid) return true;
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
 * The base for a **form-associated** control that renders its own UI
 * (`ui-select`, `ui-slider`, `ui-calendar`, …).
 *
 * Each of the nine used to repeat the same thirty lines: the `formAssociated`
 * static, a `#formControl` field, a `#formDisabled` flag, the `form` / `name` /
 * `disabled` / `validity` / `validationMessage` accessors, `checkValidity` /
 * `reportValidity`, and the two lifecycle delegates the browser insists live on
 * the class itself. All of that lives here now; a subclass supplies only what
 * is genuinely its own.
 *
 * What a subclass provides:
 * - {@link formControlOptions} — its value accessor and reset behaviour. It is
 *   read **lazily**, on first use of {@link formControl}, because a base-class
 *   field initializer would run before the subclass's own fields exist.
 * - {@link onFormDisabled} — how a form-driven disable shows in its UI. The
 *   flag itself is the base's; the subclass only reacts.
 * - An `override` of `form` / `name` / `disabled` where an adopted native
 *   control, not this element, is the authority (`ui-number-field`,
 *   `ui-slider`).
 */
export abstract class FormAssociatedElement extends LightDomElement {
  static formAssociated = true;

  #control: FormControl | null = null;
  #formDisabled = false;

  /**
   * This control's form-association options, read once on first use of
   * {@link formControl}. `onFormDisabled` is supplied by the base — override
   * {@link onFormDisabled} instead; anything set here for it is ignored.
   */
  protected abstract formControlOptions(): FormControlOptions;

  /** Reflect a form-driven disable onto this component's own UI. */
  protected onFormDisabled(_disabled: boolean) {}

  /** The form-association controller. Constructed on first access. */
  protected get formControl(): FormControl {
    this.#control ??= formControl(this, {
      ...this.formControlOptions(),
      onFormDisabled: (disabled) => {
        this.#formDisabled = disabled;
        this.onFormDisabled(disabled);
      },
    });
    return this.#control;
  }

  /**
   * Whether an enclosing `<form>`/`<fieldset>` has disabled this control —
   * the half of {@link disabled} that does not come from the attribute.
   */
  protected get formDisabled() {
    return this.#formDisabled;
  }

  /** The owning form, or `null`. */
  get form(): HTMLFormElement | null {
    return this.formControl.form;
  }
  /** Form field name (the `name` attribute), or `null`. */
  get name(): string | null {
    return this.getAttribute("name");
  }
  /** Whether disabled by attribute or by an enclosing form/fieldset. */
  get disabled(): boolean {
    return this.hasAttribute("disabled") || this.#formDisabled;
  }
  /** Synthesized validity state. */
  get validity(): ValidityState {
    return this.formControl.validity;
  }
  /** Current validation message, or `""` when valid. */
  get validationMessage(): string {
    return this.formControl.validationMessage;
  }
  /** Report validity, firing `invalid` on the host when it fails. */
  checkValidity(): boolean {
    return this.formControl.checkValidity();
  }
  /** Like {@link checkValidity}, as the native method. */
  reportValidity(): boolean {
    return this.formControl.reportValidity();
  }
  /** Set (or with `""`, clear) a consumer-supplied error. */
  setCustomValidity(message: string): void {
    this.formControl.setCustomValidity(message);
  }
  /** Browser callback: restore the initial value on `form.reset()`. */
  formResetCallback(): void {
    this.formControl.handleReset();
  }
  /** Browser callback: a form or fieldset changed this control's disabled state. */
  formDisabledCallback(disabled: boolean): void {
    this.formControl.handleDisabled(disabled);
  }
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
export class NativeCheckboxElement extends LightDomElement {
  #input: HTMLInputElement | null = null;

  /** The adopted native checkbox — the interactive control + form value. */
  protected get input() {
    return this.#input;
  }

  /** The adopted input's form, or `null`. */
  get form(): HTMLFormElement | null {
    return this.#input?.form ?? null;
  }
  /** The adopted input's `name`, or `null` before adoption. */
  get name(): string | null {
    return this.#input?.name ?? null;
  }
  /** Submitted value when checked (native default `"on"`). */
  get value(): string {
    return this.#input?.value || "on";
  }
  /** Whether the adopted checkbox is checked. */
  get checked(): boolean {
    return this.#input?.checked ?? false;
  }
  set checked(next: boolean) {
    if (!this.#input) return;
    this.#input.checked = next;
    this.sync();
  }
  /** Whether the adopted input is disabled. */
  get disabled(): boolean {
    return this.#input?.disabled ?? false;
  }
  set disabled(next: boolean) {
    if (!this.#input) return;
    this.#input.disabled = next;
    this.sync();
  }

  override connectedCallback() {
    // Defer a microtask so the authored native child has parsed (an element can
    // upgrade mid-parse, before its children exist).
    super.connectedCallback();
  }

  protected override initialize() {
    const input = adoptedControl<HTMLInputElement>(this, 'input[type="checkbox"]');
    if (!input) return false; // no control to enhance
    this.#input = input;
    this.adopt(input);
    // `change` covers user toggles; `input` lets a host that mutates the control
    // programmatically (e.g. a "select all" driving row boxes) signal the change
    // with `dispatchEvent(new Event("input"))` — the property setters fire no
    // event, and `indeterminate` has none at all.
    input.addEventListener("change", this.sync);
    input.addEventListener("input", this.sync);
    this.sync();
    return true;
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
