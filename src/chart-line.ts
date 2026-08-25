/**
 * `ui-chart-line` — a line series (optionally area-filled, optionally with
 * point marks) inside a `ui-chart`, ported from `@mui/x-charts`'s
 * `LinePlot` / `AreaPlot` / `MarkPlot`.
 *
 * Markup: `<ui-chart-line key="Revenue"></ui-chart-line>` as a child of
 * `ui-chart`, alongside a shared index/category `ui-chart-axis`.
 *
 * Attributes — the shared series set (`key`, `label`, `highlight`, `fade`, see
 * {@link UIChartSeries}) plus:
 * - `curve` — `"linear" | "step" | "step-before" | "step-after" | "monotone"`
 *   (default `"linear"`), passed straight through to `chart-shape.ts`'s
 *   `linePath`/`areaPath`.
 * - `area` (boolean) — also fill the region under the line down to the y=0
 *   baseline (or the stacked `y0`, when stacked).
 * - `marks` (boolean) — also render a small circle at each non-null data
 *   point, in addition to the line stroke.
 * - `stack` — a stack-group id. Only applied when `area` is also set: a
 *   stacked *bare* line has no visual meaning, so a plain line ignores it.
 * - `connect-nulls` (boolean) — bridge across `null` values instead of
 *   breaking the line into separate segments.
 * - `values` — the sparkline recipe: space-separated numbers plotted with no
 *   dataset or axes at all (see {@link sparklinePoints}).
 *
 * Generated marks (inside this series' own `[data-part="series"]` group,
 * reconciled by `chart-plot.ts`): `[data-part="area"]` (only when `area` is
 * set, painted first, no color set — style it via `[data-part="area"] { fill:
 * currentColor; }`), `[data-part="stroke"]` (the line itself, `fill="none"` —
 * a stroke path is not a filled region, so this is structure not paint), and,
 * when `marks` is set, one `[data-part="mark"]` circle per non-null point.
 * Highlight/fade state lands on whichever mark represents it: a point mark
 * (`data-index` set) gets its own per-row state, same as every other series
 * type; the stroke and area — which represent no single row — carry the
 * *series'* own highlight/fade state directly instead.
 */
import {
  type MarkDescriptor,
  type SeriesRegistration,
  type SeriesRenderContext,
  numericExtent,
  registerSeriesType,
  toNumeric,
} from "./chart-core.ts";
import { type ContinuousScale, isDiscreteScale } from "./chart-scale.ts";
import { SERIES_ATTRIBUTES, UIChartSeries } from "./chart-series.ts";
import { type CurveType, type Point, areaPath, linePath, round } from "./chart-shape.ts";

export class UIChartLine extends UIChartSeries {
  static observedAttributes = [
    ...SERIES_ATTRIBUTES,
    "curve",
    "area",
    "marks",
    "stack",
    "connect-nulls",
    "values",
  ];

  protected readonly seriesType = "line";

  /**
   * The sparkline recipe: space-separated numbers plotted with no shared
   * dataset/axes at all (`<ui-chart><ui-chart-line values="4 7 5 9">`) —
   * `undefined` when unauthored, in which case this series reads the normal
   * `key` column against the chart's registered axes instead.
   */
  get values(): number[] | undefined {
    const raw = this.getAttribute("values");
    if (raw === null) return undefined;
    const parsed = raw
      .trim()
      .split(/\s+/)
      .filter((s) => s.length > 0)
      .map(Number);
    return parsed.length > 0 ? parsed : undefined;
  }

  get curve(): CurveType {
    const value = this.getAttribute("curve");
    return value === "step" ||
      value === "step-before" ||
      value === "step-after" ||
      value === "monotone"
      ? value
      : "linear";
  }

  get area(): boolean {
    return this.hasAttribute("area");
  }

  get marks(): boolean {
    return this.hasAttribute("marks");
  }

  /** The stack group this area belongs to. An empty attribute is not an id — `stack=""` means unstacked. */
  get stack(): string | undefined {
    return this.getAttribute("stack") || undefined;
  }

  get connectNulls(): boolean {
    return this.hasAttribute("connect-nulls");
  }

  protected override seriesFields(): Partial<SeriesRegistration> {
    // A stacked bare line has no visual meaning — only an area stacks.
    return { stack: this.area ? this.stack : undefined };
  }
}

/**
 * Points for the sparkline recipe (`values` attribute, no axes/dataset at
 * all): index positions spread evenly across the plot width, values mapped
 * to their own min–max span across the plot height — entirely self-contained,
 * bypassing `xScale`/`yScale`/`categoryKey` (there are none, by design: a
 * sparkline is `<ui-chart><ui-chart-line values="…"></ui-chart-line></ui-chart>`
 * with no `<ui-chart-axis>` children).
 */
function sparklinePoints(
  values: readonly number[],
  plot: { width: number; height: number },
): Point[] {
  const finite = values.filter((v) => Number.isFinite(v));
  const lo = finite.length > 0 ? Math.min(...finite) : 0;
  const hi = finite.length > 0 ? Math.max(...finite) : 1;
  const span = hi - lo || 1;
  const step = values.length > 1 ? plot.width / (values.length - 1) : 0;
  return values.map((v, i) => ({
    x: step * i,
    y: Number.isFinite(v) ? plot.height - ((v - lo) / span) * plot.height : null,
  }));
}

/**
 * Points for the normal cartesian case: one per data row, x from the shared
 * category axis, y from this series' own column (or its stacked upper edge).
 * `null` if the axes this series needs aren't present — and when they are, the
 * value scale comes back alongside the points, so the area baseline below is
 * computed from the same narrowed scale rather than re-asserting its type.
 */
function cartesianPoints(
  context: SeriesRenderContext,
  line: UIChartLine,
): { points: Point[]; yScale: ContinuousScale } | null {
  const { xScale, yScale, categoryKey, config, data, stacked } = context;
  if (!xScale || !yScale || !categoryKey || isDiscreteScale(yScale)) return null;
  const useStacked = line.area && stacked !== undefined;

  const points = data.map((row, i) => {
    const categoryValue = row[categoryKey] ?? null;
    const x = isDiscreteScale(xScale)
      ? (xScale.center(categoryValue) ?? 0)
      : xScale(toNumeric(categoryValue));

    const numeric = toNumeric(row[config.key] ?? null);
    if (!Number.isFinite(numeric)) return { x, y: null };
    return { x, y: useStacked ? yScale(stacked[i]?.y1 ?? 0) : yScale(numeric) };
  });
  return { points, yScale };
}

/** This series' marks for a resolved set of points: the optional area fill (down to `baseline`), the stroke, and the optional per-point circles. */
function lineMarks(
  points: readonly Point[],
  baseline: number | number[],
  line: UIChartLine,
): MarkDescriptor[] {
  const marks: MarkDescriptor[] = [];
  if (line.area) {
    marks.push({
      key: "area",
      tag: "path",
      part: "area",
      attrs: { d: areaPath(points, baseline, line.curve, line.connectNulls) },
    });
  }
  marks.push({
    key: "stroke",
    tag: "path",
    part: "stroke",
    attrs: { d: linePath(points, line.curve, line.connectNulls), fill: "none" },
  });
  if (line.marks) {
    points.forEach((point, i) => {
      if (point.y === null) return;
      marks.push({
        key: String(i),
        tag: "circle",
        part: "mark",
        index: i,
        attrs: { cx: String(round(point.x)), cy: String(round(point.y)), r: "3" },
      });
    });
  }
  return marks;
}

registerSeriesType({
  type: "line",
  stacks: true,
  getExtremum(data, key, dim) {
    return dim === "y" ? numericExtent(data, key) : null;
  },
  computeMarks(context): MarkDescriptor[] {
    const line = context.element;
    if (!(line instanceof UIChartLine)) return [];

    // The sparkline recipe and the cartesian one are separate flows, not one
    // flow with a mode flag: they share only the mark set they end up with.
    const values = line.values;
    if (values) return lineMarks(sparklinePoints(values, context.plot), context.plot.height, line);

    const resolved = cartesianPoints(context, line);
    if (!resolved) return [];
    const { points, yScale } = resolved;
    const stacked = line.area ? context.stacked : undefined;
    const baseline = stacked ? stacked.map((s) => yScale(s.y0)) : yScale(0);
    return lineMarks(points, baseline, line);
  },
});

if (!customElements.get("ui-chart-line")) customElements.define("ui-chart-line", UIChartLine);

declare global {
  interface HTMLElementTagNameMap {
    "ui-chart-line": UIChartLine;
  }
}
