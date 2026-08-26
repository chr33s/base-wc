/**
 * `ui-meter` — a scalar gauge within a known range (Base UI's Meter).
 * `role="meter"` with `aria-valuenow`/`min`/`max`. Following the HTML `<meter>`
 * model, `low`/`high`/`optimum` split the range into three regions and classify
 * the current value relative to the optimum region, exposed as `data-state`
 * (`optimal` / `suboptimal` / `poor`) alongside a `--meter` fraction (0–1) for
 * the fill.
 */
import { define } from "./define.ts";
import { rangeNumber, syncRangeState } from "./range.ts";

export class UIMeter extends HTMLElement {
  static observedAttributes = ["value", "min", "max", "low", "high", "optimum"];

  get min() {
    return rangeNumber(this, "min", 0);
  }
  get max() {
    return rangeNumber(this, "max", 100);
  }
  get value() {
    return rangeNumber(this, "value", 0);
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
    const { value } = syncRangeState(this, { min, max, value: this.value, property: "--meter" });
    this.setAttribute("data-state", this.#level(value, min, max));
  }

  #level(value: number, min: number, max: number) {
    const low = Math.max(min, Math.min(rangeNumber(this, "low", min), max));
    const high = Math.max(low, Math.min(rangeNumber(this, "high", max), max));
    const optimum = Math.max(min, Math.min(rangeNumber(this, "optimum", (min + max) / 2), max));
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
