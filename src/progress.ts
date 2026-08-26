/**
 * `ui-progress` — a determinate/indeterminate progress bar (Base UI's Progress).
 * `role="progressbar"` with `aria-valuenow`/`min`/`max`; omitting `value` (or
 * setting the `indeterminate` attribute) drops `aria-valuenow` for an
 * indeterminate bar. A `--progress` custom property (0–1) and a `data-state`
 * hook (`loading` / `complete` / `indeterminate`) drive the consumer's fill.
 */
import { define } from "./define.ts";
import { rangeNumber, syncRangeState } from "./range.ts";

export class UIProgress extends HTMLElement {
  static observedAttributes = ["value", "min", "max", "indeterminate"];

  get min() {
    return rangeNumber(this, "min", 0);
  }
  get max() {
    return rangeNumber(this, "max", 100);
  }
  get value() {
    const raw = this.getAttribute("value");
    return raw == null || raw === "" ? null : Number(raw);
  }
  get indeterminate() {
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
    if (this.indeterminate) {
      this.setAttribute("aria-valuemin", String(this.min));
      this.setAttribute("aria-valuemax", String(this.max));
      // No `aria-valuenow` at all — that absence is what marks the bar
      // indeterminate to assistive tech, so the shared helper (which always
      // reports a value) stays out of this branch.
      this.removeAttribute("aria-valuenow");
      this.setAttribute("data-state", "indeterminate");
      this.style.setProperty("--progress", "0");
      return;
    }
    const { fraction } = syncRangeState(this, {
      min: this.min,
      max: this.max,
      value: this.value ?? this.min,
      property: "--progress",
    });
    this.setAttribute("data-state", fraction >= 1 ? "complete" : "loading");
  }
}

define("ui-progress", UIProgress);

declare global {
  interface HTMLElementTagNameMap {
    "ui-progress": UIProgress;
  }
}
