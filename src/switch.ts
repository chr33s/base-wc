/**
 * `ui-switch` — an on/off toggle (Base UI's Switch).
 *
 * A **pure enhancer of a native checkbox**: author `<ui-switch><input
 * type="checkbox" name="notify" /></ui-switch>` and it works with no JavaScript
 * (the checkbox toggles and submits on its own). On upgrade the component
 * {@link adoptedControl | adopts} that input — announces it as a switch
 * (`role=switch`) and mirrors its checked/disabled state onto the `data-state` /
 * `data-disabled` hooks — while the **browser owns focus, keyboard, and
 * submission**. There is no self-rendered / `ElementInternals` fallback: the
 * native input is the control.
 *
 * Renders in **light DOM** (no shadow root, so no `::part`). Overlay the input on
 * the visual switch and style a thumb off the state hooks — with or without JS —
 * e.g. `ui-switch:has(input:checked) .thumb`, `ui-switch[data-state="checked"]
 * .thumb`.
 */
import { adoptedControl } from "./native.ts";
import { connectLightDom } from "./lifecycle.ts";

export class UISwitch extends HTMLElement {
  /** The adopted native checkbox — the interactive control + form value. */
  #native: HTMLInputElement | null = null;
  #wired = false;

  get form(): HTMLFormElement | null {
    return this.#native?.form ?? null;
  }
  get name(): string | null {
    return this.#native?.name ?? null;
  }
  get value(): string {
    return this.#native?.value || "on";
  }
  get checked(): boolean {
    return this.#native?.checked ?? false;
  }
  set checked(next: boolean) {
    if (!this.#native) return;
    this.#native.checked = next;
    this.#sync();
  }
  get disabled(): boolean {
    return this.#native?.disabled ?? false;
  }
  set disabled(next: boolean) {
    if (!this.#native) return;
    this.#native.disabled = next;
    this.#sync();
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
    this.#native = adoptedControl<HTMLInputElement>(this, 'input[type="checkbox"]');
    if (!this.#native) return; // no control to enhance
    this.#wired = true;
    this.#native.setAttribute("role", "switch");
    this.#native.addEventListener("change", this.#sync);
    this.#sync();
  }

  /** Mirror the native control's state onto the CSS state hooks. */
  #sync = () => {
    if (!this.#native) return;
    // The native `role=switch` needs `aria-checked` to convey on/off to AT;
    // keep it in step with the checkbox's checked state.
    this.#native.setAttribute("aria-checked", String(this.#native.checked));
    this.setAttribute("data-state", this.#native.checked ? "checked" : "unchecked");
    this.toggleAttribute("data-disabled", this.#native.disabled);
  };
}

if (!customElements.get("ui-switch")) customElements.define("ui-switch", UISwitch);

declare global {
  interface HTMLElementTagNameMap {
    "ui-switch": UISwitch;
  }
}
