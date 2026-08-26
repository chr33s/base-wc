/**
 * The scalar-in-a-range state shared by `ui-gauge`, `ui-meter` and
 * `ui-progress`: clamp the value into `[min, max]`, derive its 0–1 fraction,
 * mirror all three into `aria-valuemin`/`aria-valuemax`/`aria-valuenow`, and
 * publish the fraction as a custom property for consumer CSS. Each of those
 * elements used to hand-roll exactly this; it lives here once, deliberately
 * outside `chart-core.ts` — a progress bar has no business importing a chart
 * engine.
 */

/** Read a numeric attribute with a fallback: the parsed number, or `fallback` when the attribute is absent or empty (an empty attribute carries no value, which is not the same as `0`). */
export function rangeNumber(element: HTMLElement, name: string, fallback: number) {
  const raw = element.getAttribute(name);
  return raw == null || raw === "" ? fallback : Number(raw);
}

/**
 * Clamp `value` into `[min, max]`, mirror the range into the `aria-value*`
 * attributes, and publish the resulting 0–1 fraction as the `property` custom
 * property (a degenerate range, `max <= min`, yields fraction `0`). Returns
 * the clamped value and fraction for whatever the caller derives beyond this
 * (a gauge's arc angle, a meter's level, a progress bar's `data-state`).
 */
export function syncRangeState(
  element: HTMLElement,
  options: { min: number; max: number; value: number; property: string },
) {
  const { min, max, property } = options;
  const value = Math.max(min, Math.min(options.value, max));
  const fraction = max > min ? (value - min) / (max - min) : 0;
  element.setAttribute("aria-valuemin", String(min));
  element.setAttribute("aria-valuemax", String(max));
  element.setAttribute("aria-valuenow", String(value));
  element.style.setProperty(property, String(fraction));
  return { value, fraction };
}
