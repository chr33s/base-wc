/** Resolve one chart frame without mutating the DOM or the chart store. */
import {
  type AxisRegistration,
  type ChartRow,
  type ChartState,
  type SeriesRegistration,
  type SeriesRenderContext,
  type StackOffset,
  type StackedValue,
  getSeriesType,
  stackSeries,
} from "../chart-core.ts";
import { DEFAULT_TICK_COUNT, axisScale, categoryRows } from "../chart-domain.ts";
import type { GridSpec } from "../chart-plot.ts";
import { type Scale, isDiscreteScale } from "../chart-scale.ts";
import { round } from "../chart-shape.ts";

/**
 * Each visible series' slot among the siblings of its own type that share a
 * band: one slot per stack group, plus one per unstacked series, in document
 * order. This is what lets `ui-chart-bar` split a band into side-by-side
 * columns without knowing anything about its siblings — and, because it is
 * derived from the *visible* series on every render, hiding one bar re-splits
 * the band across the rest instead of leaving its column empty.
 */
function groupSlots(visible: readonly SeriesRegistration[]) {
  const byType = new Map<string, SeriesRegistration[]>();
  for (const registration of visible) {
    const siblings = byType.get(registration.type);
    if (siblings) siblings.push(registration);
    else byType.set(registration.type, [registration]);
  }

  const slots = new Map<SeriesRegistration, { index: number; count: number }>();
  for (const siblings of byType.values()) {
    // A stack group occupies one slot however many series are in it; an
    // unstacked series stands for itself (hence the registration as its key).
    const order: Array<string | SeriesRegistration> = [];
    for (const registration of siblings) {
      const slot = registration.stack ?? registration;
      if (!order.includes(slot)) order.push(slot);
    }
    for (const registration of siblings) {
      slots.set(registration, {
        index: order.indexOf(registration.stack ?? registration),
        count: order.length,
      });
    }
  }
  return slots;
}

/** Everything one chart render needs, resolved once from the store without touching the DOM. */
export interface ChartFrame {
  /** The plot area in local SVG coordinates (origin at the top-left). */
  readonly box: { x: number; y: number; width: number; height: number };
  /** The dataset rows the frame was resolved from. */
  readonly data: ChartRow[];
  /** Series that are not hidden, in paint order. */
  readonly visible: SeriesRegistration[];
  /** The shared index (bottom/top) axis, if one is registered. */
  readonly indexAxis: AxisRegistration | undefined;
  /** The value (left/right) axis, if one is registered. */
  readonly valueAxis: AxisRegistration | undefined;
  /** Horizontal scale derived from the index axis. */
  readonly xScale: Scale | undefined;
  /** Vertical scale derived from the value axis. */
  readonly yScale: Scale | undefined;
  /** Dataset row behind each category of a discrete x scale (empty otherwise). */
  readonly bandRows: number[];
  /** Grid lines to draw: one per requested dimension that has a continuous scale. */
  readonly gridSpecs: GridSpec[];
  /** Per-series render context, keyed by registration. */
  readonly contexts: Map<SeriesRegistration, SeriesRenderContext>;
  /** Series that take a palette colour (annotations excluded), hidden ones included. */
  readonly palette: SeriesRegistration[];
}

/** Resolve the frame for the current store state, or `null` while the plot has no area. */
export function prepareChartFrame(
  state: ChartState,
  stackOffset: StackOffset,
  grids: ReadonlyMap<"x" | "y", number>,
): ChartFrame | null {
  const width = round(state.width);
  const height = round(state.height);
  if (width <= 0 || height <= 0) return null;
  const box = { x: 0, y: 0, width, height };
  const data = state.data;
  const visible = state.series.filter((series) => !series.hidden);
  const stackable = visible.filter(
    (series) => series.stack !== undefined && getSeriesType(series.type)?.stacks,
  );
  const stacked = stackSeries(data, stackable, stackOffset);
  const stacks = new Map<SeriesRegistration, StackedValue[]>();
  for (const [index, series] of stackable.entries()) {
    const values = stacked[index];
    if (values) stacks.set(series, values);
  }
  const indexAxis = state.axes.find(
    (axis) => axis.position === "bottom" || axis.position === "top",
  );
  const valueAxis = state.axes.find(
    (axis) => axis.position === "left" || axis.position === "right",
  );
  const common = { data, series: visible, stacks };
  const xScale = indexAxis
    ? axisScale({ ...common, axis: indexAxis, range: [0, width], dim: "x" })
    : undefined;
  const yScale = valueAxis
    ? axisScale({ ...common, axis: valueAxis, range: [height, 0], dim: "y" })
    : undefined;
  const bandRows =
    xScale && isDiscreteScale(xScale) && indexAxis?.key
      ? categoryRows(data, indexAxis.key, xScale.domain())
      : [];
  const gridSpecs: GridSpec[] = [];
  for (const dim of ["x", "y"] as const) {
    if (!grids.has(dim)) continue;
    const scale = dim === "x" ? xScale : yScale;
    if (!scale || isDiscreteScale(scale)) continue;
    const axis = dim === "x" ? indexAxis : valueAxis;
    gridSpecs.push({ dim, scale, tickCount: axis?.tickCount ?? DEFAULT_TICK_COUNT });
  }
  const slots = groupSlots(visible);
  const contexts = new Map<SeriesRegistration, SeriesRenderContext>();
  for (const registration of visible) {
    const slot = slots.get(registration) ?? { index: 0, count: 1 };
    contexts.set(registration, {
      config: registration,
      data,
      xScale,
      yScale,
      categoryKey: indexAxis?.key,
      stacked: stacks.get(registration),
      plot: box,
      groupIndex: slot.index,
      groupCount: slot.count,
    });
  }
  const palette = state.series.filter((series) => !getSeriesType(series.type)?.annotation);
  return {
    box,
    data,
    visible,
    indexAxis,
    valueAxis,
    xScale,
    yScale,
    bandRows,
    gridSpecs,
    contexts,
    palette,
  };
}
