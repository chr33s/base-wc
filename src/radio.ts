/**
 * `ui-radio-group` / `ui-radio` — single-choice selection (Base UI's Radio
 * Group).
 *
 * **Default (native-first).** Author a native radio inside each `ui-radio`, all
 * sharing the group's `name` —
 * `<ui-radio-group><ui-radio><input type="radio" name="plan" value="pro" /></ui-radio>…</ui-radio-group>`
 * — and it works with no JavaScript: the browser owns roving, single-selection,
 * and submission. On upgrade the component only mirrors each radio's checked
 * state onto its `data-state` hook (style the pip off `ui-radio:has(input:checked)`
 * — no JS required — or `[data-state="checked"]`).
 *
 * **Fallback (JS-only).** With no native radios authored, the group is a
 * self-rendered control: `role="radiogroup"` + form-associated (the chosen
 * radio's `value` submits under `name`; `required` reports `valueMissing` while
 * nothing is selected, and `form.reset()` restores the preset), `role="radio"`
 * items, one roving tab stop via {@link roving} with selection-follows-focus.
 * Use only where JS is guaranteed — it submits nothing with scripting off.
 */
import { define } from "./define.ts";
import { FormAssociatedElement, type FormControlOptions } from "./form-control.ts";
import { LightDomElement } from "./lifecycle.ts";
import { nextId } from "./id.ts";
import { adoptedControl } from "./native.ts";
import { roving, type Roving } from "./roving.ts";

export class UIRadioGroup extends FormAssociatedElement {
  protected override formControlOptions(): FormControlOptions {
    return {
      adopted: () => this.#native,
      value: () => this.value,
      onReset: () => this.#onFormReset(),
    };
  }
  protected override onFormDisabled(disabled: boolean) {
    this.toggleAttribute("data-disabled", disabled);
  }
  #roving: Roving | null = null;
  /** True when the radios wrap authored native `<input type="radio">`s. */
  #native = false;

  get value() {
    return this.#selected()?.value ?? null;
  }
  set value(next: string | null) {
    const match = this.#allRadios().find((r) => r.value === next);
    if (!match) return;
    if (this.#native) {
      // A matched radio may be authored attribute-only (no inner input) in a
      // mixed group; guard rather than deref a null native input.
      const input = match.nativeInput();
      if (!input) return;
      input.checked = true;
      this.#syncRadios();
    } else {
      this.#select(match, false);
    }
  }

  override connectedCallback() {
    // A re-inserted group keeps its wiring (connectLightDom skips a wired host)
    // but not its roving helper, which `disconnectedCallback` dropped; the new
    // one adopts the tab stop still marked in the DOM. Native-adoption mode
    // never had one — the browser's own radios do the roving.
    if (this.wired && !this.#native) this.#attachRoving();
    super.connectedCallback();
  }

  disconnectedCallback() {
    this.#roving?.destroy();
    this.#roving = null;
  }

  protected override wire() {
    this.wired = true;
    this.#native = adoptedControl(this, 'input[type="radio"]') != null;
    if (this.#native) return this.#wireNative();

    this.setAttribute("role", "radiogroup");
    if (!this.id) this.id = nextId("ui-radio-group");

    this.#attachRoving();
    this.addEventListener("click", this.#onClick);
    this.#applyPreset();
  }

  #attachRoving() {
    this.#roving ??= roving(this, {
      items: () => this.#radios(),
      orientation: "both",
      loop: true,
      onMove: (item) => this.#selectByUser(item as UIRadio),
      onActivate: (item) => this.#selectByUser(item as UIRadio),
    });
  }

  /**
   * Native-adoption mode: the browser's radios own roving / selection /
   * submission. We only listen for their (bubbling) `change` — one radio's
   * selection silently unchecks its siblings, which fire no event — and refresh
   * every item's `data-state` hook. `ElementInternals` is unused (the native
   * radios carry the form value).
   */
  #wireNative() {
    this.setAttribute("role", "radiogroup");
    this.addEventListener("change", this.#syncRadios);
    this.#syncRadios();
  }

  /**
   * Standalone: reflect the preset selection — the `value` attribute, or a
   * radio's own `checked` attribute — without emitting. Runs at wire and again
   * on `form.reset()`.
   */
  #applyPreset() {
    const preset = this.getAttribute("value");
    const radios = this.#allRadios();
    const match =
      preset != null
        ? (radios.find((r) => r.value === preset) ?? null)
        : (radios.find((r) => r.hasAttribute("checked")) ?? null);
    this.#applyChecked(match);
    this.formControl.setValue(match?.value ?? null);
    const idx = match ? this.#radios().indexOf(match) : -1;
    this.#roving?.refresh(idx >= 0 ? idx : 0);
  }

  #onFormReset() {
    if (!this.wired) return;
    if (this.#native) {
      // The browser restores each native radio's own default checkedness during
      // the same reset pass; refresh the `data-state` hooks once it has.
      queueMicrotask(this.#syncRadios);
    } else {
      this.#applyPreset();
    }
  }

  #syncRadios = () => {
    for (const radio of this.#allRadios()) {
      radio.setAttribute("data-state", radio.checked ? "checked" : "unchecked");
    }
  };

  #allRadios() {
    return [...this.querySelectorAll<UIRadio>("ui-radio")];
  }
  #radios() {
    return this.#allRadios().filter((r) => !r.hasAttribute("disabled"));
  }
  #selected() {
    return this.#allRadios().find((r) => r.checked) ?? null;
  }

  #applyChecked(radio: UIRadio | null) {
    this.#allRadios().forEach((r) => r.setAttribute("aria-checked", String(r === radio)));
  }

  /** User-driven selection: blocked while the group is (form-)disabled. */
  #selectByUser(radio: UIRadio) {
    if (this.disabled) return;
    this.#select(radio, true);
  }

  #select(radio: UIRadio, emit: boolean) {
    if (radio.hasAttribute("disabled")) return;
    this.#applyChecked(radio);
    this.formControl.setValue(radio.value);
    const idx = this.#radios().indexOf(radio);
    if (idx >= 0) this.#roving?.refresh(idx);
    if (emit) {
      this.dispatchEvent(
        new CustomEvent("change", { bubbles: true, detail: { value: radio.value } }),
      );
    }
  }

  #onClick = (e: MouseEvent) => {
    if (this.disabled) return;
    const radio = (e.target as Element).closest("ui-radio") as UIRadio | null;
    if (radio && !radio.hasAttribute("disabled")) {
      radio.focus();
      this.#selectByUser(radio);
    }
  };
}

export class UIRadio extends LightDomElement {
  static observedAttributes = ["disabled"];

  /** The adopted native radio (native-first mode), or `null` (standalone). */
  #native: HTMLInputElement | null = null;

  nativeInput() {
    // Memoize the found input (the group re-reads `checked` across all radios on
    // every change). Only a positive result is cached — before the child parses
    // (streaming) the scan returns null and is retried on the next read.
    return (this.#native ??= adoptedControl<HTMLInputElement>(this, 'input[type="radio"]'));
  }

  get value() {
    return this.nativeInput()?.value ?? this.getAttribute("value") ?? "";
  }
  get checked() {
    const native = this.nativeInput();
    // Standalone state lives in `aria-checked` (the group presets it from the
    // `value`/`checked` attributes before any radio wires).
    return native ? native.checked : this.getAttribute("aria-checked") === "true";
  }
  get disabled() {
    return this.nativeInput()?.disabled ?? this.hasAttribute("disabled");
  }

  override connectedCallback() {
    // Deferred like its siblings, so an authored native radio has parsed before
    // the standalone-vs-native decision is made.
    super.connectedCallback();
  }

  protected override wire() {
    this.wired = true;
    const native = this.nativeInput();
    if (native) {
      // Native-first: the input is the radio; only mirror its state for the pip.
      this.setAttribute("data-state", native.checked ? "checked" : "unchecked");
      this.toggleAttribute("data-disabled", native.disabled);
      return;
    }
    this.setAttribute("role", "radio");
    if (!this.hasAttribute("aria-checked")) {
      this.setAttribute("aria-checked", this.hasAttribute("checked") ? "true" : "false");
    }
    this.setAttribute("aria-disabled", String(this.disabled));
    if (!this.hasAttribute("tabindex")) this.tabIndex = -1;
  }

  attributeChangedCallback() {
    if (this.nativeInput()) return; // native input owns disabled
    this.setAttribute("aria-disabled", String(this.disabled));
  }
}

define("ui-radio-group", UIRadioGroup);
define("ui-radio", UIRadio);

declare global {
  interface HTMLElementTagNameMap {
    "ui-radio-group": UIRadioGroup;
    "ui-radio": UIRadio;
  }
}
