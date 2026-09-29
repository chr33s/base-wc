/**
 * `ui-progress` — a determinate/indeterminate progress bar (Base UI's Progress).
 * `role="progressbar"` with `aria-valuenow`/`min`/`max`; omitting `value` (or
 * setting the `indeterminate` attribute) drops `aria-valuenow` for an
 * indeterminate bar. A `--progress` custom property (0–1) and a `data-state`
 * hook (`loading` / `complete` / `indeterminate`) drive the consumer's fill.
 */
import { define } from "./define.ts";
import { numberAttribute } from "./math.ts";
import { localeOf } from "./text.ts";
import { syncRangeState } from "./range.ts";

/** Custom element `ui-progress`; see the module comment for attributes and state hooks. */
export class UIProgress extends HTMLElement {
  static observedAttributes = ["value", "min", "max", "indeterminate"];

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
    // `null` (not a fallback number) is meaningful here: no authored `value` is
    // what makes the bar indeterminate.
    return numberAttribute(this, "value") ?? null;
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
      // Nothing to announce either: a value text without a value would assert a
      // progress the bar is explicitly saying it does not know.
      this.removeAttribute("aria-valuetext");
      this.setAttribute("data-state", "indeterminate");
      this.style.setProperty("--progress", "0");
      return;
    }
    const { fraction } = syncRangeState(this, {
      min: this.min,
      max: this.max,
      value: this.value ?? this.min,
      property: "--progress",
      format: this.#format,
      locale: localeOf(this),
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
