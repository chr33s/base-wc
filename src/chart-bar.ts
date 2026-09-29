/**
 * `ui-chart-bar` — one bar series inside a `ui-chart` (ported from
 * `@mui/x-charts`'s `BarPlot` / `BatchBarPlot`). Declared as a child of
 * `ui-chart`, alongside a band/point-scaled index axis:
 * ```html
 * <ui-chart width="480" height="280">
 *   <table>…</table>
 *   <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
 *   <ui-chart-axis position="left"></ui-chart-axis>
 *   <ui-chart-bar key="Revenue"></ui-chart-bar>
 * </ui-chart>
 * ```
 *
 * Attributes: the shared series set (`key`, `label`, `highlight`, `fade` — see
 * {@link UIChartSeries}) plus `stack`: series sharing a `stack` id are stacked
 * vertically (cumulative `y0`/`y1` per row) instead of sitting side-by-side.
 * Unstacked `ui-chart-bar` siblings sharing the same category axis are grouped
 * side-by-side instead, splitting the shared band evenly — one column per
 * stack group plus one per unstacked series. That split comes from
 * `ui-chart`'s own registry ({@link SeriesRenderContext.groupIndex} /
 * `groupCount`, computed over the *visible* series), so hiding one bar
 * re-splits the band across the rest rather than leaving a gap where it was.
 *
 * This file both defines the `UIChartBar` element (which registers itself
 * with its `ui-chart` parent) and registers the `"bar"` {@link
 * SeriesTypeDefinition} that computes its marks — two separate
 * responsibilities, one module, so unused chart types tree-shake away.
 *
 * Generated marks: one `<rect data-part="mark" data-index="…">` per data
 * row, positioned in local plot-pixel coordinates (`x`/`y`/`width`/`height`
 * only — no color, no `fill`). `ui-chart-bar` never touches the DOM itself;
 * `chart-plot.ts` reconciles the returned {@link MarkDescriptor}s into its
 * `<g data-part="series">` group and applies `data-highlighted`/
 * `data-faded` for the active {@link HighlightState}. `ui-chart-bar` does
 * not dispatch any events of its own — clicking a mark bubbles `ui-chart`'s
 * own `select` event, and hovering a band bubbles its `highlight` event.
 */
import {
  type MarkDescriptor,
  type SeriesRenderContext,
  type SeriesTypeDefinition,
  mergeExtent,
  numericExtent,
  registerSeriesType,
  toNumeric,
} from "./chart-core.ts";
import { isDiscreteScale } from "./chart-scale.ts";
import { SERIES_ATTRIBUTES, UIChartSeries } from "./chart-series.ts";
import { round } from "./chart-shape.ts";
import { define } from "./define.ts";

/** A bar series: one rect per row, grouped side by side or stacked. */
export class UIChartBar extends UIChartSeries {
  static observedAttributes = [...SERIES_ATTRIBUTES, "stack"];

  readonly type = "bar";

  /** The stack group this bar belongs to — a registration field like the shared ones. An empty attribute is not an id — `stack=""` means unstacked, not "stack with every other series that left it empty". */
  get stack(): string | undefined {
    return this.getAttribute("stack") || undefined;
  }
}

// ---------------------------------------------------------------------------
// "bar" series-type renderer
// ---------------------------------------------------------------------------

function computeBarMarks(context: SeriesRenderContext): MarkDescriptor[] {
  const { xScale, yScale, data, categoryKey, config, stacked, groupIndex, groupCount } = context;
  if (!xScale || !yScale) return [];
  if (!isDiscreteScale(xScale) || isDiscreteScale(yScale)) return [];
  if (categoryKey === undefined) return [];

  const barWidth = xScale.bandwidth() / Math.max(1, groupCount);

  const marks: MarkDescriptor[] = [];
  data.forEach((row, i) => {
    const bandStart = xScale(row[categoryKey] ?? null);
    if (bandStart === undefined) return;

    // A bar spans its stacked segment, or plain 0 → value when unstacked.
    const entry = stacked?.[i];
    const py0 = yScale(entry ? entry.y0 : 0);
    const py1 = yScale(entry ? entry.y1 : toNumeric(row[config.key]) || 0);

    marks.push({
      key: String(i),
      tag: "rect",
      part: "mark",
      index: i,
      attrs: {
        x: String(round(bandStart + groupIndex * barWidth)),
        y: String(round(Math.min(py0, py1))),
        width: String(round(Math.max(0, barWidth))),
        height: String(round(Math.abs(py0 - py1))),
      },
    });
  });
  return marks;
}

const barSeriesType: SeriesTypeDefinition = {
  type: "bar",
  stacks: true,
  getExtremum(data, series, dim) {
    if (dim === "x") return null;
    // A bar's baseline is always 0 (see computeBarMarks), regardless of the
    // data's own range — so 0 must always be inside the value-axis domain,
    // or a bar from y=0 up to its value extrapolates far outside the plot on
    // an axis whose aggregated domain excludes 0 (e.g. data spanning
    // [101, 134] with no explicit axis min/max). Unconditional: every bar
    // needs this, unlike a plain line, which only shares this rule once its
    // `area` fills to the same baseline (see chart-line.ts).
    return mergeExtent([0, 0], numericExtent(data, series.key));
  },
  computeMarks: computeBarMarks,
};

registerSeriesType(barSeriesType);

define("ui-chart-bar", UIChartBar);

declare global {
  interface HTMLElementTagNameMap {
    "ui-chart-bar": UIChartBar;
  }
}
