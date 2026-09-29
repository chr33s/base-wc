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
  type ChartDimension,
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
  bandScale,
  categoryKey,
  continuousScale,
  niceLinearDomain,
  pointScale,
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
  dim: ChartDimension,
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
  // The type sees the whole registration: which column feeds `dim` (scatter's
  // xKey-vs-key choice) and whether a zero baseline must stay in-domain (bar,
  // an unstacked area line) are the series' own business, not this module's.
  return type.getExtremum(data, registration, dim);
}

/** Inputs for resolving one axis's scale in {@link axisScale}. */
export interface AxisScaleOptions {
  /** The axis being resolved. */
  axis: AxisRegistration;
  /** The dataset rows. */
  data: readonly ChartRow[];
  /** The pixel range this axis maps onto, already oriented (a y-axis passes `[bottom, top]`). */
  range: readonly [number, number];
  /** Which dimension this axis runs along. */
  dim: ChartDimension;
  /** The series contributing to this axis's domain — the visible ones only, so hiding a series rescales the axis. */
  series: readonly SeriesRegistration[];
  /** Each series' stacked edges, when it stacks (see `chart.ts`, which computes them once per render). */
  stacks: ReadonlyMap<SeriesRegistration, StackedValue[]>;
}

/**
 * The extent an axis reads off the data: from its own column (`key`) or,
 * lacking one, merged across every series that plots against it.
 *
 * A linear domain is rounded outward to a "nice" boundary (the same algorithm
 * the axis's ticks use) — a data point at the exact extreme would otherwise
 * land precisely on the plot's own pixel edge, where its mark's stroke/radius,
 * centered on that point, spills past the plot box.
 */
function dataExtent({
  axis,
  data,
  dim,
  series,
  stacks,
}: AxisScaleOptions): [number, number] | null {
  const extent = axis.key
    ? numericExtent(data, axis.key)
    : mergeExtent(...series.map((s) => seriesExtremum(s, data, dim, stacks.get(s))));
  if (!extent || axis.scaleType !== "linear") return extent;
  return niceLinearDomain(extent[0], extent[1], axis.tickCount ?? DEFAULT_TICK_COUNT);
}

/**
 * The numeric domain for a continuous axis. A bound pinned by an explicit
 * `min`/`max` wins over the data and is never rounded — the consumer asked for
 * exactly that range — so a fully pinned axis skips the data scan entirely,
 * and a half-pinned one keeps the data-derived edge on its open side.
 */
function resolveExtent(options: AxisScaleOptions): [number, number] {
  const { min, max } = options.axis;
  let extent: [number, number] | null =
    min !== undefined && max !== undefined ? [min, max] : dataExtent(options);
  if (min !== undefined) extent = [min, extent?.[1] ?? min];
  if (max !== undefined) extent = [extent?.[0] ?? max, max];
  if (!extent) return [0, 1];
  // A single-valued domain has no span to map onto the range; widen it so the
  // one value sits in the plot rather than at 0/0 — but only on a side the
  // consumer left open, since a pinned bound wins over the data: `min="0"`
  // over an all-zero (or empty) dataset must not produce a domain starting
  // below zero.
  if (extent[0] === extent[1]) {
    const [lo, hi] = extent;
    if (min !== undefined && max === undefined) return [lo, hi + 1];
    if (max !== undefined && min === undefined) return [lo - 1, hi];
    // Neither side is open (both pinned to the same value, or neither pinned
    // at all), so there is no bound to respect — widen both rather than hand
    // back a zero-span scale that maps every value onto one pixel.
    return [lo - 1, hi + 1];
  }
  return extent;
}

/**
 * Build the scale for one axis: a band/point scale over its column's
 * categories, or a continuous scale over the numeric extent {@link
 * resolveExtent} settles on.
 */
export function axisScale(options: AxisScaleOptions): Scale {
  const { axis, data, range } = options;

  if (axis.scaleType === "band" || axis.scaleType === "point") {
    const domain = axis.key ? categoricalDomain(data, axis.key) : [];
    // A point axis takes the same outer padding a band axis gets — zero would
    // sit its end categories exactly on the plot's pixel edges.
    return axis.scaleType === "band"
      ? bandScale(domain, range, BAND_PADDING)
      : pointScale(domain, range, { padding: BAND_PADDING.paddingOuter });
  }

  return continuousScale(axis.scaleType, resolveExtent(options), range);
}
