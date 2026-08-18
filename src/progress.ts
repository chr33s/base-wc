/**
 * `ui-progress` — a determinate/indeterminate progress bar (Base UI's Progress).
 * `role="progressbar"` with `aria-valuenow`/`min`/`max`; omitting `value` (or
 * setting the `indeterminate` attribute) drops `aria-valuenow` for an
 * indeterminate bar. A `--progress` custom property (0–1) and a `data-state`
 * hook (`loading` / `complete` / `indeterminate`) drive the consumer's fill.
 */
export class UIProgress extends HTMLElement {
  static observedAttributes = ["value", "min", "max", "indeterminate"];

  get min(): number {
    return Number(this.getAttribute("min") ?? 0);
  }
  get max(): number {
    return Number(this.getAttribute("max") ?? 100);
  }
  get value(): number | null {
    const raw = this.getAttribute("value");
    return raw == null || raw === "" ? null : Number(raw);
  }
  get indeterminate(): boolean {
    return this.hasAttribute("indeterminate") || this.value == null;
  }

  connectedCallback() {
    this.setAttribute("role", "progressbar");
    this.#sync();
  }

  attributeChangedCallback() {
    this.#sync();
  }

  #sync() {
    this.setAttribute("aria-valuemin", String(this.min));
    this.setAttribute("aria-valuemax", String(this.max));
    if (this.indeterminate) {
      this.removeAttribute("aria-valuenow");
      this.setAttribute("data-state", "indeterminate");
      this.style.setProperty("--progress", "0");
      return;
    }
    const value = Math.max(this.min, Math.min(this.value ?? this.min, this.max));
    const fraction = this.max > this.min ? (value - this.min) / (this.max - this.min) : 0;
    this.setAttribute("aria-valuenow", String(value));
    this.style.setProperty("--progress", String(fraction));
    this.setAttribute("data-state", fraction >= 1 ? "complete" : "loading");
  }
}

if (!customElements.get("ui-progress")) customElements.define("ui-progress", UIProgress);

declare global {
  interface HTMLElementTagNameMap {
    "ui-progress": UIProgress;
  }
}
