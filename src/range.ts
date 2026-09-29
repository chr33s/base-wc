/**
 * The scalar-in-a-range state shared by `ui-gauge`, `ui-meter` and
 * `ui-progress`: clamp the value into `[min, max]`, derive its 0–1 fraction,
 * mirror all three into `aria-valuemin`/`aria-valuemax`/`aria-valuenow`, and
 * publish the fraction as a custom property for consumer CSS. Each of those
 * elements used to hand-roll exactly this; it lives here once, deliberately
 * outside `chart-core.ts` — a progress bar has no business importing a chart
 * engine.
 *
 * Numeric attributes are read with `numberAttribute` (`math.ts`), the one
 * guarded reader library-wide — `ui-gauge`, `ui-meter` and `ui-progress` import
 * it directly.
 */
import { clamp } from "./math.ts";

/** The clamped value and its 0–1 fraction, as returned by {@link syncRangeState}. */
export interface RangeState {
  value: number;
  fraction: number;
}

/**
 * Clamp `value` into `[min, max]`, mirror the range into the `aria-value*`
 * attributes, and publish the resulting 0–1 fraction as the `property` custom
 * property (a degenerate range, `max <= min`, yields fraction `0`). Returns
 * the clamped value and fraction for whatever the caller derives beyond this
 * (a gauge's arc angle, a meter's level, a progress bar's `data-state`).
 *
 * `aria-valuetext` is written too: a bare number rarely reads well on its own,
 * and it is always derived from the **clamped** value — announcing a raw
 * out-of-range number next to a bar that stops at its end is the one thing a
 * screen-reader user cannot reconcile. With no `format` it is the fraction as a
 * percentage, which is what a progress bar or meter means by default.
 */
export function syncRangeState(
  element: HTMLElement,
  options: {
    min: number;
    max: number;
    value: number;
    property: string;
    /** `Intl.NumberFormat` options for `aria-valuetext`; omit for a percentage. */
    format?: Intl.NumberFormatOptions | null;
    /** BCP-47 locale for that formatting. */
    locale?: string | undefined;
  },
): RangeState {
  const { min, max, property, format, locale } = options;
  const value = clamp(options.value, min, max);
  const fraction = max > min ? (value - min) / (max - min) : 0;
  element.setAttribute("aria-valuemin", String(min));
  element.setAttribute("aria-valuemax", String(max));
  element.setAttribute("aria-valuenow", String(value));
  element.setAttribute(
    "aria-valuetext",
    format
      ? formatNumber(value, locale, format)
      : formatNumber(fraction, locale, { style: "percent" }),
  );
  element.style.setProperty(property, String(fraction));
  return { value, fraction };
}

/**
 * `Intl.NumberFormat` with a plain-number fallback: the constructor throws on an
 * unsupported locale or option, and a range control that cannot format its value
 * should still announce it rather than fail to render.
 */
function formatNumber(
  value: number,
  locale: string | undefined,
  options: Intl.NumberFormatOptions,
) {
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return String(value);
  }
}
