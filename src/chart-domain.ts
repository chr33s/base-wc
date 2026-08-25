/**
 * Domain resolution for the `ui-chart` family: turning a registered axis plus
 * the current dataset and series list into the {@link Scale} that axis draws
 * with. Split out of `chart.ts` because none of it needs the element — it is
 * ordinary data-in/scale-out code (`ui-chart` supplies the pixel range it
 * measured, and gets a scale back), which keeps the container down to wiring,
 * rendering, and interaction.
 *
 * Every function here is pure and side-effect-free.
 */
import {
  type AxisRegistration,
  type ChartRow,
  type SeriesRegistration,
  type StackedValue,
  getSeriesType,
  mergeExtent,
  numericExtent,
} from "./chart-core.ts";
import {
  type CategoryValue,
  type Scale,
  categoryKey,
  createScale,
  niceLinearDomain,
} from "./chart-scale.ts";

/** Band padding as a fraction of one step — MUI's own bar-chart defaults. */
const BAND_PADDING = { paddingInner: 0.3, paddingOuter: 0.15 };

/** Target tick count when an axis doesn't name one — shared by tick generation, grid lines, and the "nice" domain rounding, so all three land on the same boundaries. */
export const DEFAULT_TICK_COUNT = 6;

/** The distinct non-null values of `key` across `data`, in first-seen order: a band/point axis's domain. Categories are compared by {@link categoryKey}, so two `Date` cells for the same instant are one category. */
export function categoricalDomain(data: readonly ChartRow[], key: string): CategoryValue[] {
  const seen = new Set<string | number>();
  const domain: CategoryValue[] = [];
  for (const row of data) {
    const raw = row[key];
    if (raw === null || raw === undefined) continue;
    const id = categoryKey(raw);
    if (!seen.has(id)) {
      seen.add(id);
      domain.push(raw);
    }
  }
  return domain;
}

/**
 * The first data row carrying each category in `domain`, positionally. Band hit
 * rects report *this* as their `data-index`, not their slot in the domain:
 * everything downstream — keyboard navigation, the tooltip's `chart.data[index]`
 * lookup, per-mark highlighting — reads a highlight index as a **data row**, and
 * the two only coincide when every row has a distinct, non-null category.
 */
export function categoryRows(
  data: readonly ChartRow[],
  key: string,
  domain: readonly CategoryValue[],
): number[] {
  const first = new Map<string | number, number>();
  data.forEach((row, i) => {
    const raw = row[key];
    if (raw === null || raw === undefined) return;
    const id = categoryKey(raw);
    if (!first.has(id)) first.set(id, i);
  });
  return domain.map((value, i) => first.get(categoryKey(value)) ?? i);
}

/**
 * One series' contribution to `dim`'s domain. A stacked series reports the
 * span of its own stacked edges (`y0`…`y1`) rather than its raw column, so the
 * axis covers the cumulative height the marks actually reach.
 */
export function seriesExtremum(
  registration: SeriesRegistration,
  data: readonly ChartRow[],
  dim: "x" | "y",
  stacked: readonly StackedValue[] | undefined,
): [number, number] | null {
  const type = getSeriesType(registration.type);
  if (!type) return null;
  if (dim === "y" && stacked) {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const { y0, y1 } of stacked) {
      lo = Math.min(lo, y0, y1);
      hi = Math.max(hi, y0, y1);
    }
    return lo <= hi ? [lo, hi] : null;
  }
  const key = dim === "x" ? (registration.xKey ?? registration.key) : registration.key;
  return type.getExtremum(data, key, dim);
}

export interface AxisScaleOptions {
  axis: AxisRegistration;
  data: readonly ChartRow[];
  /** The pixel range this axis maps onto, already oriented (a y-axis passes `[bottom, top]`). */
  range: readonly [number, number];
  dim: "x" | "y";
  /** The series contributing to this axis's domain — the visible ones only, so hiding a series rescales the axis. */
  series: readonly SeriesRegistration[];
  /** Each series' stacked edges, when it stacks (see `chart.ts`, which computes them once per render). */
  stacks: ReadonlyMap<SeriesRegistration, StackedValue[]>;
}

/**
 * Build the scale for one axis: a band/point scale over its column's
 * categories, or a continuous scale over the numeric extent of its own column
 * (`key`) or, lacking one, of every series that plots against it.
 *
 * A data-derived continuous domain is rounded outward to a "nice" boundary
 * (the same algorithm the axis's ticks use) — a data point at the exact
 * extreme would otherwise land precisely on the plot's own pixel edge, where
 * its mark's stroke/radius, centered on that point, spills past the plot box.
 * A bound pinned by an explicit `min`/`max` is never rounded: the consumer
 * asked for exactly that range.
 */
export function axisScale(options: AxisScaleOptions): Scale {
  const { axis, data, range, dim, series, stacks } = options;

  if (axis.scaleType === "band" || axis.scaleType === "point") {
    const domain = axis.key ? categoricalDomain(data, axis.key) : [];
    return createScale(axis.scaleType, domain, range, BAND_PADDING);
  }

  let extent: [number, number] | null = null;
  if (axis.min !== undefined && axis.max !== undefined) {
    extent = [axis.min, axis.max];
  } else {
    extent = axis.key
      ? numericExtent(data, axis.key)
      : mergeExtent(...series.map((s) => seriesExtremum(s, data, dim, stacks.get(s))));
    if (axis.scaleType === "linear" && extent) {
      extent = niceLinearDomain(extent[0], extent[1], axis.tickCount ?? DEFAULT_TICK_COUNT);
    }
  }
  if (axis.min !== undefined) extent = [axis.min, extent?.[1] ?? axis.min];
  if (axis.max !== undefined) extent = [extent?.[0] ?? axis.max, axis.max];
  if (!extent) extent = [0, 1];
  // A single-valued domain has no span to map onto the range; widen it so the
  // one value sits in the middle of the plot rather than at 0/0.
  if (extent[0] === extent[1]) extent = [extent[0] - 1, extent[1] + 1];
  return createScale(axis.scaleType, extent, range);
}
