/**
 * Tiny numeric helpers shared by the value-bearing controls, plus the one
 * numeric-attribute reader the whole library uses.
 *
 * {@link clampSnap} is the one copy of the snap-to-step arithmetic
 * (`ui-number-field`, `ui-slider`): values snap to the step grid anchored at
 * `min` (so `min="1" step="2"` yields 1, 3, 5, …), clamp into `[min, max]`, and
 * have the float noise from the grid arithmetic trimmed so `0.1 + 0.2`-style
 * artifacts never surface in values or ARIA attributes.
 *
 * {@link numberAttribute} replaces the four different spellings of "read a
 * number off an attribute" the components used to carry — a bare
 * `Number(getAttribute(x) ?? d)` reads `delay=""` as `0` and `delay="soon"` as
 * `NaN`, neither of which is what a fallback is for. One guarded reader treats
 * absent, empty, and unparsable alike: none of them carries a number, so all
 * three yield the fallback.
 */

/** `n` clamped into `[min, max]`. */
export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Parse an attribute-shaped string. Absent, empty, and unparsable
 * (`NaN`/`±Infinity`) strings all yield `fallback` — a value that carries no
 * number is not the same as one carrying `0`, and a typo should not poison
 * arithmetic with `NaN`. A legitimate `0` is kept.
 *
 * Exposed alongside {@link numberAttribute} for the callers whose raw string
 * does not come from `getAttribute` (`ui-slider` reads an adopted
 * `<input type="range">`'s `min`/`max`/`step` properties).
 */
/** Parse `raw`, yielding `undefined` when it carries no finite number. */
export function toNumber(raw: string | null | undefined): number | undefined;
/** Parse `raw`, yielding `fallback` when it carries no finite number. */
export function toNumber(raw: string | null | undefined, fallback: number): number;
export function toNumber(raw: string | null | undefined, fallback?: number): number | undefined {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Read a numeric attribute with {@link toNumber}'s rules. Omit `fallback` to
 * get `undefined` for "unauthored, derive it".
 */
/** Read attribute `name` as a finite number, or `undefined` when unauthored or unparsable. */
export function numberAttribute(element: Element, name: string): number | undefined;
/** Read attribute `name` as a finite number, or `fallback` when unauthored or unparsable. */
export function numberAttribute(element: Element, name: string, fallback: number): number;
export function numberAttribute(
  element: Element,
  name: string,
  fallback?: number,
): number | undefined {
  const raw = element.getAttribute(name);
  return fallback === undefined ? toNumber(raw) : toNumber(raw, fallback);
}

/** Bounds and step grid for {@link clampSnap}. */
export interface ClampSnapBounds {
  /** Lower bound; also anchors the step grid. `null`/absent → unbounded (grid anchors at 0). */
  min?: number | null;
  /** Upper bound; `null`/absent → unbounded. */
  max?: number | null;
  /** Step between allowed values. */
  step: number;
}

/** Snap `n` to the step grid, clamp into `[min, max]`, and trim float noise. */
export function clampSnap(n: number, { min, max, step }: ClampSnapBounds): number {
  const base = min ?? 0;
  let v = base + Math.round((n - base) / step) * step;
  if (min != null) v = Math.max(min, v);
  if (max != null) v = Math.min(max, v);
  return Number(v.toFixed(10));
}
