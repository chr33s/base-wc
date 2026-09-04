/**
 * `ui-chart-pie` — a pie/donut series ported from `@mui/x-charts`'s
 * `PieArcPlot` (arc geometry only; `PieArcLabelPlot`'s per-slice label
 * placement is not ported — see the note at the bottom of this doc).
 * Registers with its ancestor `<ui-chart>` like every other series
 * ({@link UIChartSeries}), under `type: "pie"`; each dataset row becomes one
 * slice — `row[key]` is that slice's value. Unlike bar/line/scatter, pie
 * ignores cartesian axes entirely (`getExtremum` always returns `null`, for
 * both dimensions) and lays out directly within the shared plot rect
 * (`context.plot`), centered — a `<ui-chart>` with only a `<ui-chart-pie>`
 * child and no `<ui-chart-axis>` children is the typical usage:
 * ```html
 * <ui-chart width="300" height="300">
 *   <table>…</table>
 *   <ui-chart-pie key="Revenue" inner-radius="40"></ui-chart-pie>
 * </ui-chart>
 * ```
 *
 * Attributes — the shared series set (`key`, `label`, `highlight`, `fade`)
 * plus:
 * - `inner-radius` (px, default `"0"`) — `0` renders a pie, `>0` a donut.
 * - `outer-radius` (px, no static default) — when unauthored,
 *   `computeMarks` fits it to the plot at render time as
 *   `Math.min(plot.width, plot.height) / 2 - 4` (a small margin), since a
 *   pixel default can't be known until the chart is measured.
 * - `pad-angle` (radians, default `"0"`) — angular gap between slices,
 *   forwarded to `arcPath`.
 * - `start-angle` / `end-angle` (DEGREES, default `"0"` / `"360"` — a full
 *   circle) — matches MUI's public Pie API, which is degree-based; converted
 *   to radians before calling `chart-shape.ts`.
 * - `sort` (boolean attribute) — absent (default): slices keep data-row
 *   order; present: slices are ordered by descending value (`pieAngles`'s
 *   `sort` option). Either way each slice's `data-index` is its *original*
 *   row index, so alignment with the dataset holds regardless of paint order.
 *
 * Generated marks: one `<path data-part="arc" data-index="N">` per data row
 * (including a zero-value row — an empty/zero-area arc, kept so `data-index`
 * alignment is never gappy), inside its series' own
 * `<g data-part="series" data-type="pie" data-series="<key>">`. This module
 * never touches the DOM directly — `chart-plot.ts` reconciles the
 * `MarkDescriptor`s `computeMarks` returns.
 *
 * Not implemented: `cornerRadius` (MUI's rounded-slice-corner option) —
 * `chart-shape.ts`'s `arcPath` has no support for it (see its own module doc).
 */
import { type SeriesTypeDefinition, registerSeriesType, toNumeric } from "./chart-core.ts";
import { numberAttribute } from "./math.ts";
import { SERIES_ATTRIBUTES, UIChartSeries } from "./chart-series.ts";
import { arcPath, pieAngles } from "./chart-shape.ts";
import { define } from "./define.ts";

const DEGREES_TO_RADIANS = Math.PI / 180;

export class UIChartPie extends UIChartSeries {
  static observedAttributes = [
    ...SERIES_ATTRIBUTES,
    "inner-radius",
    "outer-radius",
    "pad-angle",
    "start-angle",
    "end-angle",
    "sort",
  ];

  readonly type = "pie";

  get innerRadius() {
    return numberAttribute(this, "inner-radius", 0);
  }

  /** `undefined` when unauthored — `computeMarks` then fits the outer radius to the plot (see class doc). */
  get outerRadius() {
    return numberAttribute(this, "outer-radius");
  }

  get padAngle() {
    return numberAttribute(this, "pad-angle", 0);
  }

  /** Radians, converted from the authored (degrees) `start-angle` attribute. */
  get startAngle() {
    return numberAttribute(this, "start-angle", 0) * DEGREES_TO_RADIANS;
  }

  /** Radians, converted from the authored (degrees) `end-angle` attribute. */
  get endAngle() {
    return numberAttribute(this, "end-angle", 360) * DEGREES_TO_RADIANS;
  }

  get sort() {
    return this.hasAttribute("sort");
  }
}

function pieOuterRadius(element: UIChartPie, plot: { width: number; height: number }) {
  return element.outerRadius ?? Math.max(0, Math.min(plot.width, plot.height) / 2 - 4);
}

const pieSeriesType: SeriesTypeDefinition = {
  type: "pie",
  stacks: false,
  // Pie never plots against a cartesian axis — it ignores context.xScale/
  // yScale entirely and lays out directly within context.plot, so it never
  // contributes to either axis' domain.
  getExtremum: () => null,
  computeMarks(context) {
    const element = context.config.element;
    if (!(element instanceof UIChartPie)) return [];
    const cx = context.plot.x + context.plot.width / 2;
    const cy = context.plot.y + context.plot.height / 2;
    const outerRadius = pieOuterRadius(element, context.plot);
    const innerRadius = element.innerRadius;

    const values = context.data.map((row) => {
      const n = toNumeric(row[context.config.key]);
      return Number.isFinite(n) ? n : 0;
    });
    const slices = pieAngles(values, {
      startAngle: element.startAngle,
      endAngle: element.endAngle,
      padAngle: element.padAngle,
      sort: element.sort,
    });

    return slices.map((slice) => ({
      key: String(slice.index),
      tag: "path",
      part: "arc",
      index: slice.index,
      attrs: {
        d: arcPath({
          innerRadius,
          outerRadius,
          startAngle: slice.startAngle,
          endAngle: slice.endAngle,
          padAngle: slice.padAngle,
          cx,
          cy,
        }),
      },
    }));
  },
};
registerSeriesType(pieSeriesType);

define("ui-chart-pie", UIChartPie);

declare global {
  interface HTMLElementTagNameMap {
    "ui-chart-pie": UIChartPie;
  }
}
