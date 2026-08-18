/**
 * `ui-number-field` — a numeric input with steppers (Base UI's Number Field).
 * The inner input is a `role="spinbutton"` carrying `aria-valuenow/min/max`;
 * increment/decrement buttons and the Arrow/Page/Home/End keys step the value,
 * which is clamped to `[min, max]` and snapped to `step`. It is
 * **form-associated** — the committed value submits under `name`. Typing is left
 * free-form and only clamped/snapped on commit (blur, Enter, or a step).
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
 * the standalone control's behaviour). With a non-`number` input it is the
 * standalone spinbutton described above.
 */
import { connectLightDom } from "./lifecycle.ts";
import { fireNativeChange } from "./native.ts";

export class UINumberField extends HTMLElement {
  static formAssociated = true;
  static observedAttributes = ["disabled"];

  #internals: ElementInternals | null = this.attachInternals?.() ?? null;
  #input!: HTMLInputElement;
  #inc: HTMLElement | null = null;
  #dec: HTMLElement | null = null;
  #scrub: HTMLElement | null = null;
  /** True when the inner input is a native `type="number"` (native-first mode). */
  #native = false;
  #wired = false;
  #value: number | null = null;
  #scrubbing = false;
  #scrubAccum = 0;

  get form(): HTMLFormElement | null {
    return this.#native ? this.#input.form : (this.#internals?.form ?? null);
  }
  get name(): string | null {
    return this.#native ? this.#input.name : this.getAttribute("name");
  }
  get value(): number | null {
    if (!this.#native) return this.#value;
    return this.#input.value === "" ? null : Number(this.#input.value);
  }
  set value(next: number | null) {
    if (!this.#native) {
      this.#commit(next, false);
      return;
    }
    this.#input.value = next == null ? "" : String(next);
    // `#emitNative`'s `input` dispatch already re-runs `#reflectButtons` via the
    // listener wired in `#wireNative`, so don't call it a second time here.
    this.#emitNative();
  }
  get disabled(): boolean {
    // Native-first: `disabled` naturally lives on the adopted input, so read it
    // there; standalone reflects the host attribute.
    return this.#native ? this.#input.disabled : this.hasAttribute("disabled");
  }

  #min(): number | null {
    // Native-first: min/max live on the adopted input; standalone: on the host.
    const raw = this.#native ? this.#input.min : this.getAttribute("min");
    return raw == null || raw === "" ? null : Number(raw);
  }
  #max(): number | null {
    const raw = this.#native ? this.#input.max : this.getAttribute("max");
    return raw == null || raw === "" ? null : Number(raw);
  }
  #step(): number {
    return Number(this.getAttribute("step") ?? 1) || 1;
  }
  #largeStep(): number {
    const raw = this.getAttribute("large-step");
    return raw == null || raw === "" ? this.#step() * 10 : Number(raw);
  }
  #pixelsPerStep(): number {
    return Number(this.getAttribute("scrub-sensitivity") ?? 8) || 8;
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    const input =
      this.querySelector<HTMLInputElement>("[data-number-input]") ??
      this.querySelector<HTMLInputElement>("input");
    if (!input) return;
    this.#input = input;
    this.#inc = this.querySelector<HTMLElement>("[data-number-increment]");
    this.#dec = this.querySelector<HTMLElement>("[data-number-decrement]");
    this.#scrub = this.querySelector<HTMLElement>("[data-number-scrub]");
    this.#wired = true;

    // Native-first: a `type="number"` input is the control (typing/arrows/spinner
    // /min/max/step/submission are native); we only add the custom steppers + scrub.
    this.#native = input.type === "number";
    if (this.#native) return this.#wireNative();

    input.setAttribute("role", "spinbutton");
    if (!input.hasAttribute("inputmode")) input.setAttribute("inputmode", "decimal");
    input.setAttribute("autocomplete", "off");
    // A disabled field must not be editable from the keyboard either — a
    // disabled input can't be focused, so it fires no input/keydown/blur.
    input.disabled = this.disabled;
    const min = this.#min();
    const max = this.#max();
    if (min != null) input.setAttribute("aria-valuemin", String(min));
    if (max != null) input.setAttribute("aria-valuemax", String(max));
    input.addEventListener("input", this.#onInput);
    input.addEventListener("keydown", this.#onKeydown);
    input.addEventListener("blur", this.#onBlur);
    this.#inc?.addEventListener("click", () => this.#stepBy(1, false));
    this.#dec?.addEventListener("click", () => this.#stepBy(-1, false));
    this.#scrub?.addEventListener("pointerdown", this.#onScrubDown);

    this.#commit(this.#parse(this.getAttribute("value") ?? input.value), false);
  }

  /**
   * Native-first mode: the browser's `type="number"` input owns typing / arrows /
   * spinner / validation / submission. We only wire the custom stepper buttons
   * and the scrub area (both via native `stepUp()`/`stepDown()`), and reflect the
   * buttons' disabled state at the bounds.
   */
  #wireNative() {
    const input = this.#input;
    // Honor a `disabled` authored on either the host or the native input itself;
    // don't clobber an input the author disabled directly.
    if (this.hasAttribute("disabled")) input.disabled = true;
    this.#inc?.addEventListener("click", () => this.#nativeStep(1));
    this.#dec?.addEventListener("click", () => this.#nativeStep(-1));
    this.#scrub?.addEventListener("pointerdown", this.#onScrubDown);
    input.addEventListener("input", this.#reflectButtons);
    this.#reflectButtons();
  }

  #nativeStep(steps: number) {
    if (this.disabled || steps === 0) return;
    const method = steps > 0 ? "stepUp" : "stepDown";
    for (let i = 0; i < Math.abs(steps); i++) this.#input[method]();
    this.#emitNative();
  }

  #emitNative() {
    if (!this.#native) return;
    fireNativeChange(this.#input);
  }

  /** Apply a signed number of steps in the current mode (used by the scrub area). */
  #applySteps(steps: number) {
    if (this.#native) this.#nativeStep(steps);
    else this.#stepBy(steps, false);
  }

  disconnectedCallback() {
    if (this.#scrubbing) this.#onScrubUp();
  }

  attributeChangedCallback() {
    if (!this.#wired) return;
    // The host `disabled` attribute now drives the input (in both modes).
    this.#input.disabled = this.hasAttribute("disabled");
    this.#reflectButtons();
  }

  // ---- scrub-area (drag to change) --------------------------------------
  #onScrubDown = (e: PointerEvent) => {
    if (this.disabled) return;
    e.preventDefault();
    this.#scrubbing = true;
    this.#scrubAccum = 0;
    this.#scrub?.setAttribute("data-scrubbing", "");
    // Pointer Lock is best-effort: it needs a user gesture and can reject in
    // headless/embedded contexts; the `movementX` fallback works regardless.
    Promise.resolve(this.#scrub?.requestPointerLock?.()).catch(() => {});
    window.addEventListener("pointermove", this.#onScrubMove);
    window.addEventListener("pointerup", this.#onScrubUp);
  };

  #onScrubMove = (e: PointerEvent) => {
    if (!this.#scrubbing) return;
    this.#scrubAccum += e.movementX;
    const per = this.#pixelsPerStep();
    const steps = Math.trunc(this.#scrubAccum / per);
    if (steps !== 0) {
      this.#scrubAccum -= steps * per; // keep the sub-step remainder
      this.#applySteps(steps); // right (positive movementX) increments
    }
  };

  #onScrubUp = () => {
    if (!this.#scrubbing) return;
    this.#scrubbing = false;
    this.#scrub?.removeAttribute("data-scrubbing");
    document.exitPointerLock?.();
    window.removeEventListener("pointermove", this.#onScrubMove);
    window.removeEventListener("pointerup", this.#onScrubUp);
  };

  #parse(raw: string | null): number | null {
    if (raw == null || raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  #clampSnap(n: number): number {
    const step = this.#step();
    const min = this.#min();
    const max = this.#max();
    const base = min ?? 0;
    let v = base + Math.round((n - base) / step) * step;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    return Number(v.toFixed(10));
  }

  #commit(n: number | null, emit: boolean) {
    if (!this.#wired) return;
    if (n == null) {
      this.#value = null;
      this.#input.value = "";
      this.#input.removeAttribute("aria-valuenow");
      this.#internals?.setFormValue(null);
    } else {
      const v = this.#clampSnap(n);
      this.#value = v;
      this.#input.value = String(v);
      this.#input.setAttribute("aria-valuenow", String(v));
      this.#internals?.setFormValue(String(v));
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
    this.#internals?.setFormValue(this.#input.value);
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

if (!customElements.get("ui-number-field")) customElements.define("ui-number-field", UINumberField);

declare global {
  interface HTMLElementTagNameMap {
    "ui-number-field": UINumberField;
  }
}
