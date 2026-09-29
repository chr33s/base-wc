/**
 * `ui-meter` — a scalar gauge within a known range (Base UI's Meter).
 * `role="meter"` with `aria-valuenow`/`min`/`max`. Following the HTML `<meter>`
 * model, `low`/`high`/`optimum` split the range into three regions and classify
 * the current value relative to the optimum region, exposed as `data-state`
 * (`optimal` / `suboptimal` / `poor`) alongside a `--meter` fraction (0–1) for
 * the fill.
 */
import { define } from "./define.ts";
import { clamp, numberAttribute } from "./math.ts";
import { localeOf } from "./text.ts";
import { syncRangeState } from "./range.ts";

/** Custom element `ui-meter`; see the module comment for attributes and state hooks. */
export class UIMeter extends HTMLElement {
  static observedAttributes = ["value", "min", "max", "low", "high", "optimum"];

  /** Lower bound (`min` attribute, default 0). */
  get min(): number {
    return numberAttribute(this, "min", 0);
  }
  /** Upper bound (`max` attribute, default 100). */
  get max(): number {
    return numberAttribute(this, "max", 100);
  }
  /**
   * `Intl.NumberFormat` options for the announced value (`aria-valuetext`).
   * Set as a property — an options object is not an attribute. Omit it and the
   * value is announced as a percentage of its range.
   */
  get format(): Intl.NumberFormatOptions | null {
    return this.#format;
  }
  set format(next: Intl.NumberFormatOptions | null) {
    this.#format = next;
    this.#sync();
  }
  #format: Intl.NumberFormatOptions | null = null;

  get value() {
    return numberAttribute(this, "value", 0);
  }

  connectedCallback() {
    this.setAttribute("role", "meter");
    this.#sync();
  }

  attributeChangedCallback() {
    this.#sync();
  }

  #sync() {
    const { min, max } = this;
    const { value } = syncRangeState(this, {
      min,
      max,
      value: this.value,
      property: "--meter",
      format: this.#format,
      locale: localeOf(this),
    });
    this.setAttribute("data-state", this.#level(value, min, max));
  }

  #level(value: number, min: number, max: number) {
    const low = clamp(numberAttribute(this, "low", min), min, max);
    const high = clamp(numberAttribute(this, "high", max), low, max);
    const optimum = clamp(numberAttribute(this, "optimum", (min + max) / 2), min, max);
    const region = (x: number) => (x < low ? 0 : x > high ? 2 : 1);
    const distance = Math.abs(region(value) - region(optimum));
    return distance === 0 ? "optimal" : distance === 1 ? "suboptimal" : "poor";
  }
}

define("ui-meter", UIMeter);

declare global {
  interface HTMLElementTagNameMap {
    "ui-meter": UIMeter;
  }
}
