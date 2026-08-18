/**
 * `ui-slider` — a range slider with one or more thumbs (Base UI's Slider). Each
 * thumb is `role="slider"` with `aria-valuemin/max/now` and `aria-orientation`;
 * Arrow / Page / Home / End keys move the focused thumb, and a pointer press on
 * the track moves the nearest thumb to that position and drags it. Values are
 * clamped to `[min, max]`, snapped to `step`, and kept ordered (thumbs cannot
 * cross and stay `min-distance` apart). The value fractions are exposed as
 * `--slider` (first thumb) plus `--slider-start` / `--slider-end` for a range
 * fill, and the selection submits under `name` (**form-associated**).
 *
 * Markup: a `<ui-slider-track>` containing one `<ui-slider-thumb>` (single) or
 * several (range). Initial values come from the host `value` (comma-separated)
 * or each thumb's own `value`.
 *
 * **Native-first (single thumb).** Author a native range —
 * `<ui-slider><input type="range" name="volume" value min max step /></ui-slider>`
 * — and it works with no JavaScript: the browser owns the thumb, keyboard, drag,
 * and submission. On upgrade the component only publishes the value fraction as
 * `--slider` / `--slider-start` / `--slider-end` (for a custom fill) and reads
 * value/min/max from the input. The multi-thumb **range** has no native
 * equivalent, so it stays the standalone control described above.
 */
import { connectLightDom } from "./lifecycle.ts";
import { adoptedControl } from "./native.ts";

export class UISlider extends HTMLElement {
  static formAssociated = true;

  #internals: ElementInternals | null = this.attachInternals?.() ?? null;
  #track!: HTMLElement;
  #thumbs: HTMLElement[] = [];
  #values: number[] = [];
  /** The adopted native `<input type="range">` (native-first), or `null`. */
  #native: HTMLInputElement | null = null;
  #wired = false;
  #dragIndex = -1;

  get form(): HTMLFormElement | null {
    return this.#native ? this.#native.form : (this.#internals?.form ?? null);
  }
  get name(): string | null {
    return this.#native ? this.#native.name : this.getAttribute("name");
  }
  /** Whether this is a multi-thumb range slider (never in native mode). */
  get range(): boolean {
    return this.#thumbs.length > 1;
  }
  get value(): number | number[] {
    if (this.#native) return Number(this.#native.value);
    return this.range ? [...this.#values] : (this.#values[0] ?? this.min);
  }
  set value(next: number | number[]) {
    if (this.#native) {
      this.#native.value = String(Array.isArray(next) ? next[0] : next);
      this.#native.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    this.#applyValues(Array.isArray(next) ? next : [next], false);
  }
  #bound(attr: "min" | "max" | "step", fallback: number): number {
    const raw = this.#native ? this.#native[attr] : this.getAttribute(attr);
    if (raw == null || raw === "") return fallback;
    const n = Number(raw);
    // Keep a legitimate 0 (e.g. `max="0"` on a negative range); only a NaN
    // falls back.
    return Number.isFinite(n) ? n : fallback;
  }
  get min(): number {
    return this.#bound("min", 0);
  }
  get max(): number {
    return this.#bound("max", 100);
  }
  get step(): number {
    return this.#bound("step", 1);
  }
  /** Minimum gap kept between adjacent thumbs (range). */
  get minDistance(): number {
    return Number(this.getAttribute("min-distance") ?? 0);
  }
  get orientation(): "horizontal" | "vertical" {
    return this.getAttribute("orientation") === "vertical" ? "vertical" : "horizontal";
  }
  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    // Native-first: a `type="range"` input is the control (thumb / keyboard /
    // drag / submission are native); we only publish the fill fractions.
    this.#native = adoptedControl<HTMLInputElement>(this, 'input[type="range"]');
    if (this.#native) {
      this.#wired = true;
      this.#native.addEventListener("input", this.#reflectNative);
      this.#reflectNative();
      return;
    }

    const track = this.querySelector<HTMLElement>("ui-slider-track");
    const thumbs = [...this.querySelectorAll<HTMLElement>("ui-slider-thumb")];
    if (!track || thumbs.length === 0) return;
    this.#track = track;
    this.#thumbs = thumbs;
    this.#values = thumbs.map(() => this.min);

    thumbs.forEach((thumb, i) => {
      thumb.setAttribute("role", "slider");
      thumb.setAttribute("aria-orientation", this.orientation);
      if (!thumb.hasAttribute("tabindex")) thumb.tabIndex = this.disabled ? -1 : 0;
      thumb.addEventListener("keydown", (e) => this.#onKeydown(e, i));
    });
    track.addEventListener("pointerdown", this.#onPointerDown);

    this.#wired = true;
    const raw = this.getAttribute("value");
    const initial =
      raw != null && raw !== ""
        ? raw.split(",").map((s) => Number(s.trim()))
        : thumbs.map((t) => Number(t.getAttribute("value") ?? this.min));
    this.#applyValues(initial, false);
  }

  disconnectedCallback() {
    this.#endDrag();
  }

  /** Native-first mode: publish the value fraction for a custom fill overlay. */
  #reflectNative = () => {
    if (!this.#native) return;
    const range = this.max - this.min;
    const frac = range > 0 ? (Number(this.#native.value) - this.min) / range : 0;
    this.style.setProperty("--slider", String(frac));
    this.style.setProperty("--slider-start", "0");
    this.style.setProperty("--slider-end", String(frac));
  };

  #clampSnap(n: number): number {
    let v = this.min + Math.round((n - this.min) / this.step) * this.step;
    v = Math.max(this.min, Math.min(v, this.max));
    return Number(v.toFixed(10));
  }

  #fraction(v: number): number {
    return this.max > this.min ? (v - this.min) / (this.max - this.min) : 0;
  }

  /** Bulk-set every thumb value: snap, order ascending, keep min-distance. */
  #applyValues(next: number[], emit: boolean) {
    if (!this.#wired) return;
    const n = this.#thumbs.length;
    const vals = this.#values.slice();
    for (let i = 0; i < n; i++) {
      if (i < next.length && Number.isFinite(next[i])) vals[i] = this.#clampSnap(next[i]);
    }
    // Push apart to keep min-distance, clamping back into [min, max] on each
    // pass so the forward pass can't shove a thumb past max (nor the backward
    // pass below min); the backward pass then slides the group down to fit.
    for (let i = 1; i < n; i++)
      vals[i] = Math.min(this.max, Math.max(vals[i], vals[i - 1] + this.minDistance));
    for (let i = n - 2; i >= 0; i--)
      vals[i] = Math.max(this.min, Math.min(vals[i], vals[i + 1] - this.minDistance));
    this.#writeValues(vals, emit);
  }

  /** Move one thumb, clamped between its neighbors (thumbs cannot cross). */
  #setThumb(index: number, n: number, emit: boolean) {
    const lo = index > 0 ? this.#values[index - 1] + this.minDistance : this.min;
    const hi =
      index < this.#values.length - 1 ? this.#values[index + 1] - this.minDistance : this.max;
    const v = Math.max(lo, Math.min(this.#clampSnap(n), Math.max(lo, hi)));
    const vals = this.#values.slice();
    vals[index] = v;
    this.#writeValues(vals, emit);
  }

  #writeValues(vals: number[], emit: boolean) {
    const changed = vals.some((v, i) => v !== this.#values[i]);
    this.#values = vals;
    this.#reflect();
    if (emit && changed) {
      this.dispatchEvent(
        new CustomEvent("change", { bubbles: true, detail: { value: this.value } }),
      );
    }
  }

  #reflect() {
    const n = this.#values.length;
    this.#thumbs.forEach((thumb, i) => {
      const v = this.#values[i];
      thumb.setAttribute("aria-valuenow", String(v));
      thumb.setAttribute("aria-valuemin", String(i > 0 ? this.#values[i - 1] : this.min));
      thumb.setAttribute("aria-valuemax", String(i < n - 1 ? this.#values[i + 1] : this.max));
      const offset = `${this.#fraction(v) * 100}%`;
      if (this.orientation === "vertical") thumb.style.bottom = offset;
      else thumb.style.left = offset;
    });
    const first = this.#fraction(this.#values[0]);
    const last = this.#fraction(this.#values[n - 1]);
    this.style.setProperty("--slider", String(first));
    this.style.setProperty("--slider-start", String(first));
    this.style.setProperty("--slider-end", String(last));
    if (this.range && this.name) {
      const data = new FormData();
      for (const v of this.#values) data.append(this.name, String(v));
      this.#internals?.setFormValue(data);
    } else {
      this.#internals?.setFormValue(String(this.#values[0] ?? this.min));
    }
  }

  #onKeydown(e: KeyboardEvent, index: number) {
    if (this.disabled) return;
    const large = Math.max(this.step, (this.max - this.min) / 10);
    const at = this.#values[index];
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        e.preventDefault();
        this.#setThumb(index, at + this.step, true);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        e.preventDefault();
        this.#setThumb(index, at - this.step, true);
        break;
      case "PageUp":
        e.preventDefault();
        this.#setThumb(index, at + large, true);
        break;
      case "PageDown":
        e.preventDefault();
        this.#setThumb(index, at - large, true);
        break;
      case "Home":
        e.preventDefault();
        this.#setThumb(index, this.min, true);
        break;
      case "End":
        e.preventDefault();
        this.#setThumb(index, this.max, true);
        break;
    }
  }

  #onPointerDown = (e: PointerEvent) => {
    if (this.disabled) return;
    const v = this.#pointerValue(e);
    this.#dragIndex = v == null ? 0 : this.#nearestThumb(v);
    this.#thumbs[this.#dragIndex]?.focus();
    if (v != null) this.#setThumb(this.#dragIndex, v, true);
    window.addEventListener("pointermove", this.#onPointerMove);
    window.addEventListener("pointerup", this.#onPointerUp);
  };

  #onPointerMove = (e: PointerEvent) => {
    if (this.#dragIndex < 0) return;
    const v = this.#pointerValue(e);
    if (v != null) this.#setThumb(this.#dragIndex, v, true);
  };

  #onPointerUp = () => this.#endDrag();

  #endDrag() {
    if (this.#dragIndex < 0) return;
    this.#dragIndex = -1;
    window.removeEventListener("pointermove", this.#onPointerMove);
    window.removeEventListener("pointerup", this.#onPointerUp);
  }

  #nearestThumb(value: number): number {
    let best = 0;
    let bestDist = Infinity;
    this.#values.forEach((v, i) => {
      const d = Math.abs(v - value);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  #pointerValue(e: PointerEvent): number | null {
    const rect = this.#track.getBoundingClientRect();
    const size = this.orientation === "vertical" ? rect.height : rect.width;
    if (size <= 0) return null; // no layout (e.g. under test) — ignore
    const fraction =
      this.orientation === "vertical"
        ? (rect.bottom - e.clientY) / size
        : (e.clientX - rect.left) / size;
    return this.min + fraction * (this.max - this.min);
  }
}

export class UISliderTrack extends HTMLElement {}
export class UISliderThumb extends HTMLElement {}

if (!customElements.get("ui-slider")) customElements.define("ui-slider", UISlider);
if (!customElements.get("ui-slider-track")) customElements.define("ui-slider-track", UISliderTrack);
if (!customElements.get("ui-slider-thumb")) customElements.define("ui-slider-thumb", UISliderThumb);

declare global {
  interface HTMLElementTagNameMap {
    "ui-slider": UISlider;
    "ui-slider-track": UISliderTrack;
    "ui-slider-thumb": UISliderThumb;
  }
}
