/**
 * Tiny numeric helpers shared by the value-bearing controls. `clampSnap` is the
 * one copy of the snap-to-step arithmetic (`ui-number-field`, `ui-slider`):
 * values snap to the step grid anchored at `min` (so `min="1" step="2"` yields
 * 1, 3, 5, …), clamp into `[min, max]`, and have the float noise from the grid
 * arithmetic trimmed so `0.1 + 0.2`-style artifacts never surface in values or
 * ARIA attributes.
 */

/** `n` clamped into `[min, max]`. */
export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export interface ClampSnapBounds {
  /** Lower bound; also anchors the step grid. `null`/absent → unbounded (grid anchors at 0). */
  min?: number | null;
  /** Upper bound; `null`/absent → unbounded. */
  max?: number | null;
  /** Step between allowed values. */
  step: number;
}

/** Snap `n` to the step grid, clamp into `[min, max]`, and trim float noise. */
export function clampSnap(n: number, { min, max, step }: ClampSnapBounds) {
  const base = min ?? 0;
  let v = base + Math.round((n - base) / step) * step;
  if (min != null) v = Math.max(min, v);
  if (max != null) v = Math.min(max, v);
  return Number(v.toFixed(10));
}
