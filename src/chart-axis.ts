/**
 * `ui-chart-axis` + `ui-chart-grid` — the chrome around a `ui-chart` plot,
 * ported from `@mui/x-charts`'s `ChartsXAxis`/`ChartsYAxis` and `ChartsGrid`.
 *
 * An axis is declared as a child of `ui-chart` and registers **itself** with
 * it — `UIChartAxis` implements `AxisRegistration` directly, its attribute
 * getters being the registration's fields, so an attribute edit needs no
 * syncing, only a re-render request. `ui-chart` resolves the domain and hands
 * the finished {@link Scale} back through the registration's `render`, at
 * which point the axis draws its own markup: one `<span data-part="tick" style="--tick: 0…1">` per tick,
 * carrying the fraction of the axis's length the tick sits at (the
 * `ui-progress`/`ui-slider` custom-property idiom) for consumer CSS to
 * position. Tick text is real HTML, sized by the browser — which is what lets
 * this package skip MUI's SVG text-measurement and axis auto-sizing entirely:
 * layout *around* the plot is ordinary consumer CSS.
 *
 * ```html
 * <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
 * <ui-chart-axis position="left" min="0" max="150" ticks="4"></ui-chart-axis>
 * <ui-chart-grid axis="y"></ui-chart-grid>
 * ```
 *
 * Attributes: `position` (`"bottom" | "top" | "left" | "right"`, default
 * `"bottom"`), `key` (the dataset column a band/point/time axis reads its
 * domain from — omit for a purely series-driven value axis), `scale`
 * (`"band" | "point" | "linear" | "log" | "sqrt" | "time"`, default
 * `"linear"`), `min`/`max` (pin either end of the domain; a pinned end is
 * never rounded outward), and `ticks` (target tick count for a continuous
 * scale). A `formatter` property overrides the default tick text.
 *
 * One axis per orientation is used: the first horizontal (`bottom`/`top`) axis
 * is the chart's index axis and the first vertical one its value axis — MUI's
 * multi-axis `axisId` model is not ported, so a second axis on the same side
 * registers but draws nothing.
 *
 * `ui-chart-grid` opts one dimension into rendered grid lines — no
 * `ui-chart-grid`, no lines. The lines themselves are drawn inside the
 * chart's `<svg>` (they belong to the plot, not the axis). Several grid
 * elements may name the same dimension; the lines stay until the last of them
 * is removed.
 */
import { type AxisRegistration, type ChartValue, numberAttribute } from "./chart-core.ts";
import { DEFAULT_TICK_COUNT } from "./chart-domain.ts";
import { type Scale, isDiscreteScale } from "./chart-scale.ts";
import type { UIChart } from "./chart.ts";
import { define } from "./define.ts";
import { connectLightDom } from "./lifecycle.ts";

function formatTick(value: ChartValue) {
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
}

export class UIChartAxis extends HTMLElement implements AxisRegistration {
  static observedAttributes = ["position", "key", "scale", "min", "max", "ticks"];

  #chart: UIChart | null = null;
  #unregister: (() => void) | null = null;

  /** Override the default tick text (`toLocaleDateString` for dates, `String` otherwise). */
  formatter: ((value: ChartValue, index: number) => string) | null = null;

  get position() {
    const value = this.getAttribute("position");
    return value === "top" || value === "left" || value === "right" ? value : "bottom";
  }

  get key() {
    return this.getAttribute("key") ?? undefined;
  }

  get scaleType() {
    const value = this.getAttribute("scale");
    return value === "band" ||
      value === "point" ||
      value === "log" ||
      value === "sqrt" ||
      value === "time"
      ? value
      : "linear";
  }

  /** Pin the lower end of the domain — a pinned end is never rounded outward. `undefined` (unauthored) means "derive it". */
  get min() {
    return numberAttribute(this, "min");
  }

  /** Pin the upper end of the domain — a pinned end is never rounded outward. `undefined` (unauthored) means "derive it". */
  get max() {
    return numberAttribute(this, "max");
  }

  /** Target tick count for a continuous scale (`ticks` attribute); `undefined` falls back to the family default. */
  get tickCount() {
    return numberAttribute(this, "ticks");
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#unregister !== null,
      () => this.#wire(),
    );
  }

  disconnectedCallback() {
    this.#unregister?.();
    this.#unregister = null;
    this.#chart = null;
  }

  attributeChangedCallback() {
    // This element *is* its registration — the chart reads the getters above
    // directly, so the new value is already in place. Re-registering would
    // only churn list order; a re-render request is the whole update.
    this.#chart?.requestRender();
  }

  /**
   * @internal Draw this axis's ticks for `scale`, or clear them when it is
   * `undefined` (this axis is registered but unused — see the module note on
   * one axis per orientation). Called by `ui-chart` on every render, through
   * the registration; tick elements are reused in place, so a re-render
   * updates text/position rather than replacing the DOM.
   */
  render(scale: Scale | undefined) {
    if (!scale) {
      for (const tick of this.querySelectorAll(':scope > [data-part="tick"]')) tick.remove();
      return;
    }
    const [start, end] = scale.range();
    const span = end - start;
    // Branching once here (rather than per tick) keeps each side's value type
    // intact: a discrete scale ticks its categories and positions them at band
    // centers, a continuous one ticks numbers and positions them directly.
    const ticks: Array<{ value: ChartValue; position: number }> = isDiscreteScale(scale)
      ? scale.ticks().map((value) => ({ value, position: scale.center(value) ?? 0 }))
      : scale
          .ticks(this.tickCount ?? DEFAULT_TICK_COUNT)
          .map((value) => ({ value, position: scale(value) }));

    const existing = Array.from(this.querySelectorAll<HTMLElement>(':scope > [data-part="tick"]'));
    ticks.forEach(({ value, position }, i) => {
      let tick = existing[i];
      if (!tick) {
        tick = document.createElement("span");
        tick.setAttribute("data-part", "tick");
        this.append(tick);
      }
      tick.style.setProperty("--tick", String(span !== 0 ? (position - start) / span : 0));
      tick.dataset.index = String(i);
      tick.textContent = this.formatter ? this.formatter(value, i) : formatTick(value);
    });
    for (let i = ticks.length; i < existing.length; i++) existing[i]?.remove();
  }

  #wire() {
    const chart = this.closest("ui-chart");
    if (!chart) return;
    this.#chart = chart;
    this.#unregister = chart.registerAxis(this);
  }
}

export class UIChartGrid extends HTMLElement {
  static observedAttributes = ["axis"];

  #unregister: (() => void) | null = null;

  get axis() {
    return this.getAttribute("axis") === "x" ? "x" : "y";
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#unregister !== null,
      () => this.#wire(),
    );
  }

  disconnectedCallback() {
    this.#unregister?.();
    this.#unregister = null;
  }

  attributeChangedCallback() {
    this.#unregister?.();
    this.#unregister = null;
    this.#wire();
  }

  #wire() {
    const chart = this.closest("ui-chart");
    if (!chart) return;
    this.#unregister = chart.registerGrid(this.axis);
  }
}

define("ui-chart-axis", UIChartAxis);
define("ui-chart-grid", UIChartGrid);

declare global {
  interface HTMLElementTagNameMap {
    "ui-chart-axis": UIChartAxis;
    "ui-chart-grid": UIChartGrid;
  }
}
