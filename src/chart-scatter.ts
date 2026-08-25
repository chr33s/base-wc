/**
 * `ui-chart-scatter` — an x/y scatter series inside a `ui-chart`, ported from
 * `@mui/x-charts`'s `ScatterPlot`. Unlike `ui-chart-bar`/`ui-chart-line` it
 * never reads the shared category/index axis: it plots two independent
 * dataset columns as coordinate pairs, so both the chart's x- and y-axis must
 * be continuous (`linear`/`log`/`sqrt`/`time`) — a band/point axis has no
 * meaning for a scatter series and yields no marks.
 *
 * Markup contract:
 * ```html
 * <ui-chart width="480" height="280">
 *   <table>…</table>
 *   <ui-chart-axis position="bottom" scale="linear"></ui-chart-axis>
 *   <ui-chart-axis position="left" scale="linear"></ui-chart-axis>
 *   <ui-chart-scatter x-key="Weight" key="Height" r="4"></ui-chart-scatter>
 * </ui-chart>
 * ```
 *
 * Attributes: the shared series set (`key` — the column plotted on y — plus
 * `label`, `highlight`, `fade`; see {@link UIChartSeries}), `x-key`
 * (required — the dataset column plotted on x), and `r` (marker radius in px,
 * default `"4"`).
 *
 * Generated marks: one `<circle data-part="mark" cx="…" cy="…" r="…">` per
 * data row that has a finite value in both `x-key` and `key` — a row missing
 * either coordinate is skipped entirely (no mark emitted); this module's own
 * `computeMarks` supplies each one's `index`. `chart-plot.ts` (not this
 * module) is what writes that out as `data-index`, applies
 * `data-highlighted`/`data-faded` from the active {@link HighlightState}, and
 * sets `data-series`/`data-series-index`/`--series-index` on the series'
 * parent `<g>`. This module dispatches no events of its own — interaction
 * (`select`/`highlight`) is emitted by `ui-chart` from clicks/hover on these
 * marks.
 *
 * Because a scatter point carries its own x (rather than sitting on a shared
 * index axis), this is also the one series type that implements
 * {@link SeriesTypeDefinition.hitTest}: `ui-chart` calls it on `pointermove`
 * over a continuous axis and highlights whichever series' point is nearest.
 */
import {
  type ChartRow,
  type SeriesRegistration,
  type SeriesRenderContext,
  type SeriesTypeDefinition,
  numericExtent,
  registerSeriesType,
  toNumeric,
} from "./chart-core.ts";
import { isDiscreteScale } from "./chart-scale.ts";
import { SERIES_ATTRIBUTES, UIChartSeries } from "./chart-series.ts";
import { round } from "./chart-shape.ts";

export class UIChartScatter extends UIChartSeries {
  static observedAttributes = [...SERIES_ATTRIBUTES, "x-key", "r"];

  protected readonly seriesType = "scatter";

  get xKey(): string {
    return this.getAttribute("x-key") ?? "";
  }

  get r(): string {
    return this.getAttribute("r") ?? "4";
  }

  protected override seriesFields(): Partial<SeriesRegistration> {
    return { xKey: this.xKey };
  }
}

interface ScatterPoint {
  index: number;
  cx: number;
  cy: number;
}

/**
 * Every row's plotted `(cx, cy)` in local plot-pixel space, skipping rows
 * missing either coordinate. `[]` when either axis scale is missing/discrete
 * or the series has no `xKey` — a scatter series is meaningless without both.
 */
function scatterPoints(context: SeriesRenderContext): ScatterPoint[] {
  const { xScale, yScale, config, data } = context;
  const xKey = config.xKey;
  if (!xKey || !xScale || !yScale || isDiscreteScale(xScale) || isDiscreteScale(yScale)) return [];

  const points: ScatterPoint[] = [];
  data.forEach((row: ChartRow, index: number) => {
    const xValue = toNumeric(row[xKey]);
    const yValue = toNumeric(row[config.key]);
    if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) return;
    points.push({ index, cx: xScale(xValue), cy: yScale(yValue) });
  });
  return points;
}

const scatterSeriesType: SeriesTypeDefinition = {
  type: "scatter",
  stacks: false,

  getExtremum(data, key) {
    return numericExtent(data, key);
  },

  computeMarks(context) {
    const scatter = context.element;
    if (!(scatter instanceof UIChartScatter)) return [];
    return scatterPoints(context).map(({ index, cx, cy }) => ({
      key: String(index),
      tag: "circle",
      part: "mark",
      index,
      attrs: { cx: String(round(cx)), cy: String(round(cy)), r: scatter.r },
    }));
  },

  hitTest(context, pointerX, pointerY) {
    let nearest: { index: number; distance: number } | null = null;
    for (const point of scatterPoints(context)) {
      const dx = point.cx - pointerX;
      const dy = point.cy - pointerY;
      const distance = Math.hypot(dx, dy);
      if (!nearest || distance < nearest.distance) nearest = { index: point.index, distance };
    }
    return nearest;
  },
};

registerSeriesType(scatterSeriesType);

if (!customElements.get("ui-chart-scatter"))
  customElements.define("ui-chart-scatter", UIChartScatter);

declare global {
  interface HTMLElementTagNameMap {
    "ui-chart-scatter": UIChartScatter;
  }
}
