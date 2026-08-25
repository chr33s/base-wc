/**
 * `ui-chart-reference-line` — a fixed horizontal or vertical line (with an
 * optional label) marking a constant value on an axis — a target, threshold,
 * or average — ported from `@mui/x-charts`'s `ChartsReferenceLine`.
 *
 * This is **not a chart series**: it carries no data. It reuses the series
 * registration plumbing ({@link UIChartSeries}) purely as the channel through
 * which `ui-chart` hands out its already-computed scales, and registers its
 * own series type, `"reference-line"`, marked `annotation: true`. That flag is
 * what keeps it out of the places a data series belongs: it never contributes
 * to an axis domain (`getExtremum` returns `null` for both dimensions), never
 * takes a palette slot (so adding one doesn't shift the colours of the series
 * around it), and never appears in `ui-chart-legend` or `ui-chart-tooltip`.
 *
 * Markup: `<ui-chart-reference-line axis="x|y" value="…" label="…">` as a
 * child of `ui-chart`, alongside its axis/series siblings.
 *
 * Attributes:
 * - `axis` (required) — `"y"` draws a HORIZONTAL line at `value` on the
 *   y-axis, spanning the full plot width; `"x"` draws a VERTICAL line at
 *   `value` on the x-axis, spanning the full plot height. Defaults to `"y"`
 *   for an absent/invalid value.
 * - `value` (required) — the data value on that axis. Parsed as a plain
 *   number first; if that fails (e.g. against a `scale="time"` axis), retried
 *   as an ISO date string via `new Date(value).getTime()`.
 * - `label` (optional) — text rendered beside the line.
 *
 * Generated marks, inside this annotation's own `[data-part="series"]` group
 * (reconciled by `chart-plot.ts`, like every series' marks) — `data-type="reference-line"`;
 * `data-series` carries this instance's own id, since a reference line has no
 * dataset column to report:
 * `[data-part="line"]` (a `<path>`, `fill="none"` — a stroke is not a filled
 * region, so this is structure not paint — with no `data-index`, since a
 * reference line represents no single data row and so is never
 * highlighted/faded), and, only when `label` is set, `[data-part="label"]`
 * (a `<text>`, offset a few pixels off the line for legibility). This module
 * dispatches no events of its own.
 */
import { type MarkDescriptor, registerSeriesType } from "./chart-core.ts";
import { type Scale, isDiscreteScale } from "./chart-scale.ts";
import { SERIES_ATTRIBUTES, UIChartSeries } from "./chart-series.ts";
import { round } from "./chart-shape.ts";
import { nextId } from "./id.ts";

/** Parse an axis value: a plain number, or (for a time-scaled axis) an ISO date string. `NaN` if neither parses. */
function parseReferenceValue(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "") return Number.NaN;
  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric)) return numeric;
  return new Date(trimmed).getTime();
}

/** Where `value` sits on `scale`: the band's center for a discrete scale (a line through the middle of the category it names), the scaled position for a continuous one. `undefined` if the axis is absent or the value is outside a discrete domain. */
function toPixel(scale: Scale | undefined, value: number): number | undefined {
  if (!scale) return undefined;
  return isDiscreteScale(scale) ? scale.center(value) : scale(value);
}

export class UIChartReferenceLine extends UIChartSeries {
  static observedAttributes = [...SERIES_ATTRIBUTES, "axis", "value"];

  protected readonly seriesType = "reference-line";

  #id = nextId("reference-line");

  /** A reference line plots no dataset column, so it reports an id of its own as its key — that is what shows up as `data-series` on its rendered group. */
  override get key(): string {
    return this.#id;
  }

  get axis(): "x" | "y" {
    return this.getAttribute("axis") === "x" ? "x" : "y";
  }

  get value(): string | null {
    return this.getAttribute("value");
  }
}

registerSeriesType({
  type: "reference-line",
  stacks: false,
  annotation: true,
  // A reference line is a fixed annotation, never a data contribution — it
  // must never widen/shift the axis domain that determines where it draws.
  getExtremum: () => null,
  computeMarks(context): MarkDescriptor[] {
    const element = context.element;
    if (!(element instanceof UIChartReferenceLine)) return [];
    const raw = element.value;
    if (raw === null) return [];
    const value = parseReferenceValue(raw);
    if (Number.isNaN(value)) return [];

    // `axis="y"` names the axis the value is read from, so it draws the
    // *horizontal* line — one flow for both orientations, differing only in
    // which scale resolves the position and which way the line runs.
    const horizontal = element.axis === "y";
    const position = toPixel(horizontal ? context.yScale : context.xScale, value);
    if (position === undefined) return [];

    const { plot } = context;
    const at = round(position);
    const marks: MarkDescriptor[] = [
      {
        key: "line",
        tag: "path",
        part: "line",
        attrs: {
          d: horizontal
            ? `M${plot.x},${at}L${plot.x + plot.width},${at}`
            : `M${at},${plot.y}L${at},${plot.y + plot.height}`,
          fill: "none",
        },
      },
    ];
    if (element.label) {
      marks.push({
        key: "label",
        tag: "text",
        part: "label",
        text: element.label,
        // Nudged off the line itself so the text stays legible against it.
        attrs: horizontal
          ? { x: String(plot.x + 4), y: String(at - 4) }
          : { x: String(at + 4), y: String(plot.y + 12) },
      });
    }
    return marks;
  },
});

if (!customElements.get("ui-chart-reference-line"))
  customElements.define("ui-chart-reference-line", UIChartReferenceLine);

declare global {
  interface HTMLElementTagNameMap {
    "ui-chart-reference-line": UIChartReferenceLine;
  }
}
