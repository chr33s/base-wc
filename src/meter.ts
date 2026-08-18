/**
 * `ui-meter` — a scalar gauge within a known range (Base UI's Meter).
 * `role="meter"` with `aria-valuenow`/`min`/`max`. Following the HTML `<meter>`
 * model, `low`/`high`/`optimum` split the range into three regions and classify
 * the current value relative to the optimum region, exposed as `data-state`
 * (`optimal` / `suboptimal` / `poor`) alongside a `--meter` fraction (0–1) for
 * the fill.
 */
export class UIMeter extends HTMLElement {
  static observedAttributes = ["value", "min", "max", "low", "high", "optimum"];

  get min(): number {
    return Number(this.getAttribute("min") ?? 0);
  }
  get max(): number {
    return Number(this.getAttribute("max") ?? 100);
  }
  get value(): number {
    return Number(this.getAttribute("value") ?? 0);
  }

  connectedCallback() {
    this.setAttribute("role", "meter");
    this.#sync();
  }

  attributeChangedCallback() {
    this.#sync();
  }

  #num(attr: string, fallback: number): number {
    const raw = this.getAttribute(attr);
    return raw == null || raw === "" ? fallback : Number(raw);
  }

  #sync() {
    const { min, max } = this;
    const value = Math.max(min, Math.min(this.value, max));
    const fraction = max > min ? (value - min) / (max - min) : 0;
    this.setAttribute("aria-valuemin", String(min));
    this.setAttribute("aria-valuemax", String(max));
    this.setAttribute("aria-valuenow", String(value));
    this.style.setProperty("--meter", String(fraction));
    this.setAttribute("data-state", this.#level(value, min, max));
  }

  #level(value: number, min: number, max: number): "optimal" | "suboptimal" | "poor" {
    const low = Math.max(min, Math.min(this.#num("low", min), max));
    const high = Math.max(low, Math.min(this.#num("high", max), max));
    const optimum = Math.max(min, Math.min(this.#num("optimum", (min + max) / 2), max));
    const region = (x: number) => (x < low ? 0 : x > high ? 2 : 1);
    const distance = Math.abs(region(value) - region(optimum));
    return distance === 0 ? "optimal" : distance === 1 ? "suboptimal" : "poor";
  }
}

if (!customElements.get("ui-meter")) customElements.define("ui-meter", UIMeter);

declare global {
  interface HTMLElementTagNameMap {
    "ui-meter": UIMeter;
  }
}
