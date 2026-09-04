/**
 * `ui-number-field` — a numeric input with steppers (Base UI's Number Field).
 * The inner input is a `role="spinbutton"` carrying `aria-valuenow/min/max`;
 * increment/decrement buttons and the Arrow/Page/Home/End keys step the value,
 * which is clamped to `[min, max]` and snapped to `step`. It is
 * **form-associated** — the committed value submits under `name`, `required`
 * reports `valueMissing` while empty, and `form.reset()` restores the initial
 * value. Typing is left free-form and only clamped/snapped on commit (blur,
 * Enter, or a step).
 *
 * Markup: `[data-number-input]` plus optional `[data-number-increment]` /
 * `[data-number-decrement]` buttons and a `[data-number-scrub]` area — dragging
 * the scrub area horizontally changes the value (right = up), using the Pointer
 * Lock API where available and `movementX` otherwise; it reflects `data-scrubbing`
 * while active. `scrub-sensitivity` sets the pixels-per-step (default 8).
 *
 * **Native-first.** Author the inner input as `<input type="number" name="qty"
 * value min max step />` and it works with no JavaScript: the browser owns
 * typing, the Arrow keys, the native spinner, min/max/step, and submission. On
 * upgrade the component becomes a thin enhancer — it wires the custom
 * increment/decrement buttons (via `stepUp()`/`stepDown()`) and the scrub area,
 * and reflects the buttons' disabled state at the bounds; `ElementInternals`,
 * the `role`/keyboard override, and clamp/snap-on-blur are **not** used (they are
 * the standalone control's behaviour). The mode is decided once at wire time and
 * captured in a small strategy object (`#mode`); with a non-`number` input it is
 * the standalone spinbutton described above.
 */
import { define } from "./define.ts";
import { FormAssociatedElement, type FormControlOptions } from "./form-control.ts";
import { clampSnap, numberAttribute, toNumber } from "./math.ts";
import { adoptedControl, fireNativeChange, managedDisabled } from "./native.ts";
import { trackPointerDrag } from "./pointer-drag.ts";
import { scopedQuery } from "./query.ts";

/** The mode-dependent surface, bound once at wire time. */
interface NumberMode {
  form(): HTMLFormElement | null;
  name(): string | null;
  get(): number | null;
  /** Programmatic set — never dispatches events (native value-setter contract). */
  set(n: number | null): void;
  disabled(): boolean;
  /** Raw `min`/`max` source (host attributes vs the adopted input). */
  bound(attr: "min" | "max"): string | null;
  /** Apply a signed number of steps (stepper buttons / scrub area). */
  step(steps: number): void;
}

export class UINumberField extends FormAssociatedElement {
  static observedAttributes = ["disabled"];

  protected override formControlOptions(): FormControlOptions {
    return {
      adopted: () => this.#nativeMode,
      value: () => (this.wired ? this.#input.value : null),
      onReset: () => this.#onFormReset(),
    };
  }
  protected override onFormDisabled() {
    if (this.wired) this.#applyDisabled();
  }
  #input!: HTMLInputElement;
  #inc: HTMLElement | null = null;
  #dec: HTMLElement | null = null;
  #scrub: HTMLElement | null = null;
  /** True when the inner input is a native `type="number"` (native-first mode). */
  #nativeMode = false;
  #value: number | null = null;
  /** Set the inner input's `disabled`, re-enabling only what we disabled. */
  #setInputDisabled: ((disabled: boolean) => void) | null = null;
  #scrubAccum = 0;
  #disposeScrub: (() => void) | null = null;

  /**
   * Standalone (`ElementInternals`) strategy — also the pre-wire default, since
   * every branch degrades safely before the parts exist. `#wire` swaps in the
   * native strategy when it adopts a `type="number"` input.
   */
  #mode: NumberMode = {
    form: () => this.formControl.form,
    name: () => this.getAttribute("name"),
    get: () => this.#value,
    set: (n) => this.#commit(n, false),
    disabled: () => this.hasAttribute("disabled") || this.formDisabled,
    bound: (attr) => this.getAttribute(attr),
    step: (steps) => this.#stepBy(steps, false),
  };

  /** Native-first strategy: the adopted input is the source of truth. */
  #nativeStrategy(input: HTMLInputElement): NumberMode {
    return {
      form: () => input.form,
      name: () => input.name,
      get: () => (input.value === "" ? null : Number(input.value)),
      set: (n) => {
        input.value = n == null ? "" : String(n);
        this.#reflectButtons();
      },
      disabled: () => input.disabled || this.formDisabled,
      bound: (attr) => input[attr],
      step: (steps) => this.#nativeStep(steps),
    };
  }

  override get form() {
    return this.#mode.form();
  }
  override get name() {
    return this.#mode.name();
  }
  get value() {
    return this.#mode.get();
  }
  set value(next: number | null) {
    this.#mode.set(next);
  }
  override get disabled() {
    return this.#mode.disabled();
  }

  #min() {
    return toNumber(this.#mode.bound("min")) ?? null;
  }
  #max() {
    return toNumber(this.#mode.bound("max")) ?? null;
  }
  #step() {
    // `|| 1` is not redundant with the reader's fallback: `step="0"` parses
    // fine but would freeze the control, so zero falls back too.
    return numberAttribute(this, "step", 1) || 1;
  }
  #largeStep() {
    return numberAttribute(this, "large-step") ?? this.#step() * 10;
  }
  #pixelsPerStep() {
    return numberAttribute(this, "scrub-sensitivity", 8) || 8;
  }

  protected override wire() {
    // Adoption-scoped queries: an input (or part) belonging to a *nested*
    // component inside our light DOM must never be wired as ours.
    const input =
      adoptedControl<HTMLInputElement>(this, "[data-number-input]") ??
      adoptedControl<HTMLInputElement>(this, "input");
    if (!input) return;
    this.#input = input;
    this.#setInputDisabled = managedDisabled(input);
    this.#inc = scopedQuery(this, "[data-number-increment]")[0] ?? null;
    this.#dec = scopedQuery(this, "[data-number-decrement]")[0] ?? null;
    this.#scrub = scopedQuery(this, "[data-number-scrub]")[0] ?? null;
    this.wired = true;
    this.#wireScrub();

    // Native-first: a `type="number"` input is the control (typing/arrows/spinner
    // /min/max/step/submission are native); we only add the custom steppers + scrub.
    this.#nativeMode = input.type === "number";
    if (this.#nativeMode) {
      this.#mode = this.#nativeStrategy(input);
      return this.#wireNative();
    }

    input.setAttribute("role", "spinbutton");
    if (!input.hasAttribute("inputmode")) input.setAttribute("inputmode", "decimal");
    input.setAttribute("autocomplete", "off");
    // A disabled field must not be editable from the keyboard either — a
    // disabled input can't be focused, so it fires no input/keydown/blur.
    this.#applyDisabled();
    const min = this.#min();
    const max = this.#max();
    if (min != null) input.setAttribute("aria-valuemin", String(min));
    if (max != null) input.setAttribute("aria-valuemax", String(max));
    input.addEventListener("input", this.#onInput);
    input.addEventListener("keydown", this.#onKeydown);
    input.addEventListener("blur", this.#onBlur);
    this.#inc?.addEventListener("click", () => this.#stepBy(1, false));
    this.#dec?.addEventListener("click", () => this.#stepBy(-1, false));

    this.#commit(this.#parse(this.getAttribute("value") ?? input.value), false);
  }

  /**
   * Native-first mode: the browser's `type="number"` input owns typing / arrows /
   * spinner / validation / submission. We only wire the custom stepper buttons
   * and the scrub area (both via native `stepUp()`/`stepDown()`), and reflect the
   * buttons' disabled state at the bounds.
   */
  #wireNative() {
    // Honor a `disabled` authored on either the host or the native input itself;
    // never clobber an input the author disabled directly.
    this.#applyDisabled();
    this.#inc?.addEventListener("click", () => this.#nativeStep(1));
    this.#dec?.addEventListener("click", () => this.#nativeStep(-1));
    this.#input.addEventListener("input", this.#reflectButtons);
    this.#reflectButtons();
  }

  #nativeStep(steps: number) {
    if (this.disabled || steps === 0) return;
    const method = steps > 0 ? "stepUp" : "stepDown";
    for (let i = 0; i < Math.abs(steps); i++) this.#input[method]();
    // Stepping emulates user input, so fire the events a form expects from it
    // (unlike the programmatic value setter, which stays silent).
    fireNativeChange(this.#input);
  }

  disconnectedCallback() {
    this.#disposeScrub?.();
  }

  attributeChangedCallback() {
    if (!this.wired) return;
    this.#applyDisabled();
  }

  /**
   * One-way managed `disabled`: the host attribute (or a form-driven disable)
   * can disable the inner input, but removing it only re-enables an input *we*
   * disabled — an input the author disabled directly is left alone (same
   * ownership rule as `ui-fieldset`'s propagation).
   */
  #applyDisabled() {
    this.#setInputDisabled?.(this.hasAttribute("disabled") || this.formDisabled);
    this.#reflectButtons();
  }

  #onFormReset() {
    if (!this.wired) return;
    if (this.#nativeMode) {
      // The browser restores the native input's own default value during the
      // same reset pass; re-reflect the stepper bounds once it has.
      queueMicrotask(() => this.#reflectButtons());
    } else {
      this.#commit(this.#parse(this.getAttribute("value")), false);
    }
  }

  // ---- scrub-area (drag to change) --------------------------------------
  #wireScrub() {
    const scrub = this.#scrub;
    if (!scrub) return;
    this.#disposeScrub = trackPointerDrag(scrub, {
      onStart: (e) => {
        if (this.disabled) return false;
        e.preventDefault();
        this.#scrubAccum = 0;
        scrub.setAttribute("data-scrubbing", "");
        // Pointer Lock is best-effort: it needs a user gesture and can reject in
        // headless/embedded contexts; the `movementX` fallback works regardless.
        Promise.resolve(scrub.requestPointerLock?.()).catch(() => {});
      },
      onMove: (e) => {
        this.#scrubAccum += e.movementX;
        const per = this.#pixelsPerStep();
        const steps = Math.trunc(this.#scrubAccum / per);
        if (steps !== 0) {
          this.#scrubAccum -= steps * per; // keep the sub-step remainder
          this.#mode.step(steps); // right (positive movementX) increments
        }
      },
      onEnd: () => {
        scrub.removeAttribute("data-scrubbing");
        document.exitPointerLock?.();
      },
    });
  }

  #parse(raw: string | null) {
    if (raw == null || raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  #commit(n: number | null, emit: boolean) {
    if (!this.wired) return;
    if (n == null) {
      this.#value = null;
      this.#input.value = "";
      this.#input.removeAttribute("aria-valuenow");
      this.formControl.setValue(null);
    } else {
      const v = clampSnap(n, { min: this.#min(), max: this.#max(), step: this.#step() });
      this.#value = v;
      this.#input.value = String(v);
      this.#input.setAttribute("aria-valuenow", String(v));
      this.formControl.setValue(String(v));
    }
    this.#reflectButtons();
    if (emit) {
      this.dispatchEvent(
        new CustomEvent("change", { bubbles: true, detail: { value: this.#value } }),
      );
    }
  }

  #reflectButtons = () => {
    const cur = this.value; // native reads the input; standalone reads #value
    const min = this.#min();
    const max = this.#max();
    const atMax = max != null && cur != null && cur >= max;
    const atMin = min != null && cur != null && cur <= min;
    this.#inc?.toggleAttribute("disabled", this.disabled || atMax);
    this.#dec?.toggleAttribute("disabled", this.disabled || atMin);
  };

  #stepBy(direction: number, large: boolean) {
    if (this.disabled) return;
    const amount = large ? this.#largeStep() : this.#step();
    const current = this.#value ?? this.#min() ?? 0;
    this.#commit(current + direction * amount, true);
  }

  #onInput = () => {
    // Free-form while typing; reflect the raw text as the form value and update
    // aria-valuenow when it parses, but defer clamping/snapping to commit.
    this.formControl.setValue(this.#input.value);
    const n = this.#parse(this.#input.value);
    if (n != null) this.#input.setAttribute("aria-valuenow", String(n));
  };

  #onBlur = () => this.#commit(this.#parse(this.#input.value), true);

  #onKeydown = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        this.#stepBy(1, false);
        break;
      case "ArrowDown":
        e.preventDefault();
        this.#stepBy(-1, false);
        break;
      case "PageUp":
        e.preventDefault();
        this.#stepBy(1, true);
        break;
      case "PageDown":
        e.preventDefault();
        this.#stepBy(-1, true);
        break;
      case "Home": {
        const min = this.#min();
        if (min != null) {
          e.preventDefault();
          this.#commit(min, true);
        }
        break;
      }
      case "End": {
        const max = this.#max();
        if (max != null) {
          e.preventDefault();
          this.#commit(max, true);
        }
        break;
      }
      case "Enter":
        this.#commit(this.#parse(this.#input.value), true);
        break;
    }
  };
}

define("ui-number-field", UINumberField);

declare global {
  interface HTMLElementTagNameMap {
    "ui-number-field": UINumberField;
  }
}
