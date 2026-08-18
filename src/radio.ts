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
 * radio's `value` submits under `name`), `role="radio"` items, one roving tab
 * stop via {@link roving} with selection-follows-focus. Use only where JS is
 * guaranteed — it submits nothing with scripting off.
 */
import { connectLightDom } from "./lifecycle.ts";
import { nextId } from "./id.ts";
import { adoptedControl } from "./native.ts";
import { roving, type Roving } from "./roving.ts";

export class UIRadioGroup extends HTMLElement {
  static formAssociated = true;

  #internals: ElementInternals | null = this.attachInternals?.() ?? null;
  #roving: Roving | null = null;
  /** True when the radios wrap authored native `<input type="radio">`s. */
  #native = false;
  #wired = false;

  get form(): HTMLFormElement | null {
    return this.#internals?.form ?? null;
  }
  get name(): string | null {
    return this.getAttribute("name");
  }
  get value(): string | null {
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

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    this.#wired = true;
    this.#native = adoptedControl(this, 'input[type="radio"]') != null;
    if (this.#native) return this.#wireNative();

    this.setAttribute("role", "radiogroup");
    if (!this.id) this.id = nextId("ui-radio-group");

    this.#roving = roving(this, {
      items: () => this.#radios(),
      orientation: "both",
      loop: true,
      onMove: (item) => this.#select(item as UIRadio, true),
      onActivate: (item) => this.#select(item as UIRadio, true),
    });
    this.addEventListener("click", this.#onClick);

    // Reflect a pre-checked radio (or the `value` attribute) without emitting.
    const preset = this.getAttribute("value");
    if (preset != null)
      this.#applyChecked(this.#allRadios().find((r) => r.value === preset) ?? null);
    const selectedIndex = this.#radios().findIndex((r) => r.checked);
    this.#internals?.setFormValue(this.value);
    this.#roving.refresh(selectedIndex >= 0 ? selectedIndex : 0);
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
    // A radio may have applied standalone attrs synchronously before its native
    // input parsed (streaming); the native input is the control, so clear them.
    for (const radio of this.#allRadios()) {
      radio.removeAttribute("role");
      radio.removeAttribute("aria-checked");
      radio.removeAttribute("tabindex");
    }
    this.addEventListener("change", this.#syncRadios);
    this.#syncRadios();
  }

  #syncRadios = () => {
    for (const radio of this.#allRadios()) {
      radio.setAttribute("data-state", radio.checked ? "checked" : "unchecked");
    }
  };

  #allRadios(): UIRadio[] {
    return [...this.querySelectorAll<UIRadio>("ui-radio")];
  }
  #radios(): UIRadio[] {
    return this.#allRadios().filter((r) => !r.hasAttribute("disabled"));
  }
  #selected(): UIRadio | null {
    return this.#allRadios().find((r) => r.checked) ?? null;
  }

  #applyChecked(radio: UIRadio | null) {
    this.#allRadios().forEach((r) => r.setAttribute("aria-checked", String(r === radio)));
  }

  #select(radio: UIRadio, emit: boolean) {
    if (radio.hasAttribute("disabled")) return;
    this.#applyChecked(radio);
    this.#internals?.setFormValue(radio.value);
    const idx = this.#radios().indexOf(radio);
    if (idx >= 0) this.#roving?.refresh(idx);
    if (emit) {
      this.dispatchEvent(
        new CustomEvent("change", { bubbles: true, detail: { value: radio.value } }),
      );
    }
  }

  #onClick = (e: MouseEvent) => {
    const radio = (e.target as Element).closest("ui-radio") as UIRadio | null;
    if (radio && !radio.hasAttribute("disabled")) {
      radio.focus();
      this.#select(radio, true);
    }
  };
}

export class UIRadio extends HTMLElement {
  static observedAttributes = ["disabled"];

  /** The adopted native radio (native-first mode), or `null` (standalone). */
  #native: HTMLInputElement | null = null;
  nativeInput(): HTMLInputElement | null {
    // Memoize the found input (the group re-reads `checked` across all radios on
    // every change). Only a positive result is cached — before the child parses
    // (streaming) the scan returns null and is retried on the next read.
    return (this.#native ??= adoptedControl<HTMLInputElement>(this, 'input[type="radio"]'));
  }

  get value(): string {
    return this.nativeInput()?.value ?? this.getAttribute("value") ?? "";
  }
  get checked(): boolean {
    const native = this.nativeInput();
    if (native) return native.checked;
    const aria = this.getAttribute("aria-checked");
    // Before the group wires `aria-checked`, fall back to the `checked` attribute
    // so the group's preset detection works regardless of wiring order.
    return aria === "true" || (aria == null && this.hasAttribute("checked"));
  }
  get disabled(): boolean {
    return this.nativeInput()?.disabled ?? this.hasAttribute("disabled");
  }

  connectedCallback() {
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

if (!customElements.get("ui-radio-group")) customElements.define("ui-radio-group", UIRadioGroup);
if (!customElements.get("ui-radio")) customElements.define("ui-radio", UIRadio);

declare global {
  interface HTMLElementTagNameMap {
    "ui-radio-group": UIRadioGroup;
    "ui-radio": UIRadio;
  }
}
