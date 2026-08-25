/**
 * The SVG layer of `ui-chart`: everything that writes into the plot's own
 * `<svg>`, and nothing that decides *what* to draw. `chart.ts` resolves scales,
 * series and highlight state and then tells this layer what the picture should
 * be; {@link ChartPlot} owns the elements that show it and reconciles them in
 * place.
 *
 * That split is also where the generated DOM contract lives, in one file:
 * the `<svg aria-hidden="true">` holding `<g data-part="grid">`, `<g
 * data-part="bands">` and `<g data-part="series-root">`, one `<g
 * data-part="series">` per rendered series inside it, and the
 * `data-highlighted`/`data-faded` state on bands and on marks — never on a
 * series' own group. That last part is deliberate: SVG's `filter` applies to
 * an element's whole rendered subtree, so if a group and one of its marks
 * both carried the same `data-highlighted`, a consumer's `filter:
 * brightness()` on that attribute would apply twice to the mark and once
 * (uniformly, unwantedly) to every sibling mark beside it. A mark
 * representing no single row (a line's stroke, an area fill) gets the
 * *series'* highlight/fade state directly on itself instead of inheriting it
 * from an ancestor — see {@link ChartPlot.applyHighlight}. Marks carry
 * structural attributes only — geometry, never paint.
 *
 * Each series' marks are keyed **within its own group**, so a mark key only
 * has to be unique for that series: two series plotting the same dataset
 * column keep entirely separate elements.
 */
import {
  type HighlightState,
  type MarkDescriptor,
  type SeriesRegistration,
  type SeriesRenderContext,
  isMarkFaded,
  isMarkHighlighted,
  isSeriesFaded,
  isSeriesHighlighted,
} from "./chart-core.ts";
import { type ContinuousScale, type Scale, categoryKey, isDiscreteScale } from "./chart-scale.ts";
import { round } from "./chart-shape.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

/** One dimension's grid lines: the continuous scale to tick, and how many ticks to aim for. */
export interface GridSpec {
  dim: "x" | "y";
  scale: ContinuousScale;
  tickCount: number;
}

/** One series' rendered DOM, plus the context it was last drawn with (which `hitTest` reuses instead of rebuilding it per pointer event). */
interface SeriesView {
  group: SVGGElement;
  marks: Map<string, SVGElement>;
  context: SeriesRenderContext;
  /** An annotation (a reference line) rather than a data series — never highlighted or faded, matching its own module's contract. Recomputed each render from the palette slot it was (or wasn't) given. */
  isAnnotation: boolean;
}

function svgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  part: string,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  element.setAttribute("data-part", part);
  return element;
}

export class ChartPlot {
  /** The generated surface — `aria-hidden`, because the authored `<table>` stays the accessible representation of the data. */
  readonly svg: SVGSVGElement;

  #grid: SVGGElement;
  #bands: SVGGElement;
  #seriesRoot: SVGGElement;
  /** Keyed by `categoryKey()`, not the raw category value — a `Date` cell parsed fresh on every table re-ingest is a new object each time, and object-identity keys would tear down and rebuild every band rect on every update even though the categories themselves haven't changed. */
  #bandRects = new Map<string | number, SVGRectElement>();
  #views = new Map<SeriesRegistration, SeriesView>();

  constructor() {
    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.setAttribute("aria-hidden", "true");
    this.svg.style.display = "block";
    this.svg.style.width = "100%";
    this.svg.style.height = "100%";
    this.#grid = svgElement("g", "grid");
    this.#bands = svgElement("g", "bands");
    this.#seriesRoot = svgElement("g", "series-root");
    this.svg.append(this.#grid, this.#bands, this.#seriesRoot);
  }

  resize(width: number, height: number): void {
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  /** Replace the grid lines. Only dimensions with a `ui-chart-grid` and a continuous scale draw any — the rest of the group is emptied. */
  renderGrid(lines: readonly GridSpec[], width: number, height: number): void {
    this.#grid.replaceChildren();
    for (const { dim, scale, tickCount } of lines) {
      for (const value of scale.ticks(tickCount)) {
        const at = round(scale(value));
        const line = svgElement("line", "grid-line");
        line.setAttribute("data-axis", dim);
        line.setAttribute("x1", String(dim === "x" ? at : 0));
        line.setAttribute("x2", String(dim === "x" ? at : width));
        line.setAttribute("y1", String(dim === "x" ? 0 : at));
        line.setAttribute("y2", String(dim === "x" ? height : at));
        this.#grid.append(line);
      }
    }
  }

  /**
   * Reconcile the band hit rects — one full-height rect per category of a
   * discrete x-axis, which is what makes whole-column axis-trigger hover work.
   * A chart without a discrete x-axis has no bands.
   *
   * `rows[i]` is the data-row index band `i` stands for (see
   * `chart-domain.ts`'s `categoryRows`): a band reports the row a highlight
   * should land on, never its own position in the domain.
   */
  renderBands(scale: Scale | undefined, height: number, rows: readonly number[]): void {
    if (!scale || !isDiscreteScale(scale)) {
      this.#bands.replaceChildren();
      this.#bandRects.clear();
      return;
    }
    const domain = scale.domain();
    const live = new Set(domain.map(categoryKey));
    for (const [key, rect] of this.#bandRects) {
      if (!live.has(key)) {
        rect.remove();
        this.#bandRects.delete(key);
      }
    }
    const [r0, r1] = scale.range();
    const bandwidth = scale.bandwidth();
    const step = bandwidth || scale.step();
    domain.forEach((value, index) => {
      const key = categoryKey(value);
      let rect = this.#bandRects.get(key);
      if (!rect) {
        rect = svgElement("rect", "band");
        // Structural, not stylistic: a hit-testable rect needs a real (even
        // if invisible) fill — `fill="none"` is not hit-tested by pointer
        // events, matching the `fill="none"` precedent on stroked marks.
        rect.setAttribute("fill", "transparent");
        this.#bands.append(rect);
        this.#bandRects.set(key, rect);
      }
      const start = scale(value) ?? 0;
      // A band scale's own position is a slot's left edge, so it needs no
      // adjustment; a point scale's is the point's *centre* — recentre it into
      // a slot of its own step width, and clamp so a point near either end
      // (where even the intended outer padding is smaller than half a step)
      // never spills its hit rect past the plot's own edge.
      const x = bandwidth ? start : Math.max(r0, Math.min(start - step / 2, r1 - step));
      rect.setAttribute("x", String(round(x)));
      rect.setAttribute("width", String(Math.max(0, round(step))));
      rect.setAttribute("y", "0");
      rect.setAttribute("height", String(height));
      rect.dataset.index = String(rows[index] ?? index);
      rect.dataset.value = String(key);
    });
  }

  /**
   * Draw one series: its group (appended last, so paint order follows the
   * order this is called in) and its marks, updated in place. `paletteIndex`
   * is the series' palette slot, or `-1` for an annotation, which has none.
   */
  renderSeries(
    registration: SeriesRegistration,
    context: SeriesRenderContext,
    marks: readonly MarkDescriptor[],
    paletteIndex: number,
  ): void {
    let view = this.#views.get(registration);
    if (!view) {
      view = { group: svgElement("g", "series"), marks: new Map(), context, isAnnotation: false };
      this.#views.set(registration, view);
    }
    view.context = context;
    view.isAnnotation = paletteIndex < 0;
    view.group.setAttribute("data-type", registration.type);
    view.group.setAttribute("data-series", registration.key);
    if (paletteIndex >= 0) {
      view.group.dataset.seriesIndex = String(paletteIndex);
      view.group.style.setProperty("--series-index", String(paletteIndex));
    }
    // Reinserted every render so paint order stays equal to document order
    // even after a series is hidden and shown again.
    this.#seriesRoot.append(view.group);

    const live = new Set<string>();
    for (const mark of marks) {
      live.add(mark.key);
      let element = view.marks.get(mark.key);
      // The tag check covers a series type that swaps shapes for the same key;
      // reusing the element regardless would leave, say, circle attributes on
      // a <rect>.
      if (!element || element.tagName !== mark.tag) {
        element?.remove();
        element = document.createElementNS(SVG_NS, mark.tag);
        view.marks.set(mark.key, element);
      }
      element.setAttribute("data-part", mark.part);
      for (const [name, value] of Object.entries(mark.attrs)) element.setAttribute(name, value);
      if (mark.index !== undefined) element.dataset.index = String(mark.index);
      if (mark.text !== undefined) element.textContent = mark.text;
      view.group.append(element);
    }
    for (const [key, element] of view.marks) {
      if (!live.has(key)) {
        element.remove();
        view.marks.delete(key);
      }
    }
  }

  /** Remove the rendered DOM of every series not in `keep` — hidden ones, and those that have unregistered. */
  retainSeries(keep: readonly SeriesRegistration[]): void {
    for (const [registration, view] of this.#views) {
      if (!keep.includes(registration)) {
        view.group.remove();
        this.#views.delete(registration);
      }
    }
  }

  /** Drop one series' rendered DOM (it unregistered). */
  removeSeries(registration: SeriesRegistration): void {
    this.#views.get(registration)?.group.remove();
    this.#views.delete(registration);
  }

  /**
   * Re-apply `data-highlighted`/`data-faded` across every mark and band. This
   * is the whole cost of a highlight change — no scales, no geometry, no new
   * elements — which is what makes it safe to run on every pointer move.
   *
   * An annotation (a reference line) is skipped entirely: it has no data row
   * and no palette slot, so neither state applies to it. Every other mark
   * resolves its own state directly — a mark with a `data-index` (a bar, a
   * scatter point, a line's own point marks) through {@link isMarkHighlighted}
   * / {@link isMarkFaded}; a mark with none (a line's stroke, an area fill,
   * which represent no single row) through the *series'* state,
   * {@link isSeriesHighlighted} / {@link isSeriesFaded}, applied straight to
   * that element rather than to an ancestor. Nothing here ever sets either
   * attribute on the series' own group — see this module's top doc for why.
   */
  applyHighlight(highlight: HighlightState): void {
    for (const [registration, view] of this.#views) {
      if (view.isAnnotation) continue;
      const scope = registration.highlightScope;
      const seriesHighlighted = isSeriesHighlighted(highlight, scope, registration.element);
      const seriesFaded = isSeriesFaded(highlight, scope, registration.element);

      for (const element of view.marks.values()) {
        const index = element.dataset.index;
        if (index === undefined) {
          element.toggleAttribute("data-highlighted", seriesHighlighted);
          element.toggleAttribute("data-faded", seriesFaded);
          continue;
        }
        const at = Number(index);
        element.toggleAttribute(
          "data-highlighted",
          isMarkHighlighted(highlight, scope, registration.element, at),
        );
        element.toggleAttribute(
          "data-faded",
          isMarkFaded(highlight, scope, registration.element, at),
        );
      }
    }
    for (const rect of this.#bandRects.values()) {
      rect.toggleAttribute("data-highlighted", Number(rect.dataset.index) === highlight.index);
    }
  }

  /** Every rendered series with the context it was drawn from — what `hitTest` runs against. */
  rendered(): Iterable<[SeriesRegistration, SeriesRenderContext]> {
    return [...this.#views].map(([registration, view]) => [registration, view.context]);
  }

  /** The series whose rendered group contains `node`, if any. */
  seriesAt(node: Element): SeriesRegistration | undefined {
    const group = node.closest<SVGGElement>('[data-part="series"]');
    if (!group) return undefined;
    for (const [registration, view] of this.#views) {
      if (view.group === group) return registration;
    }
    return undefined;
  }
}
