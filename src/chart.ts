/**
 * `ui-chart` — the chart container, ported from `@mui/x-charts`'s
 * `ChartsDataProvider` + `ChartsSurface`. Renders in **light DOM**; the
 * dataset is a real `<table>` (a no-JS accessible fallback that stays as the
 * a11y representation once upgraded — the generated `<svg>` is
 * `aria-hidden`), or a `.data` property for programmatic sources. Series and
 * axes are declared as **child elements** (`chart-axis.ts`, `chart-bar.ts`, …)
 * and register themselves here; each series module registers its type's pure
 * renderer into `chart-core.ts`'s registry on evaluation, so `ui-chart` never
 * needs to know about a chart type directly.
 *
 * ```html
 * <ui-chart>
 *   <table>…</table>                                  <!-- dataset -->
 *   <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
 *   <ui-chart-axis position="left"></ui-chart-axis>
 *   <ui-chart-grid axis="y"></ui-chart-grid>
 *   <ui-chart-bar key="Revenue"></ui-chart-bar>
 *   …
 * </ui-chart>
 * ```
 *
 * **One registry.** Registered axes and series live in the store
 * ({@link ChartStore}) and nowhere else — and the registered objects are the
 * child **elements themselves** (`ui-chart-axis`/`ui-chart-bar`/… implement
 * the registration interfaces; their attribute getters are the fields): this
 * element renders from `state.series`, `ui-chart-legend`/`ui-chart-tooltip`
 * read the same list back through {@link UIChart.getSeries}, and a series'
 * visibility is its element's own native `hidden`. The list is kept in
 * document order, so paint order matches authored order and a series'
 * position in it *is* its palette slot — the `--series-index` on its marks,
 * its legend swatch and its tooltip row, which therefore stays put while
 * other series are toggled.
 *
 * **Renders are batched.** Every invalidation except a highlight (see
 * {@link ChartInvalidation}) queues one render on a microtask, so mounting K
 * children — each of which registers, and each registration invalidates —
 * paints once, not K times. A highlight change stays synchronous: it can't
 * alter geometry, arrives on every pointer move, and only re-applies the
 * highlight attributes.
 *
 * This module decides *what* the picture is; `chart-plot.ts` owns the `<svg>`
 * that shows it, and `chart-domain.ts` turns an axis plus the data into a
 * scale. `ui-chart` measures only its own box (`ResizeObserver`, rAF-deferred,
 * or the explicit `width`/`height` attributes) and derives scale ranges from
 * it — axis/legend layout *around* the plot is ordinary consumer CSS, not
 * component-computed margins (this deletes MUI's axis auto-sizing/text-
 * measurement machinery: axis ticks are real HTML, sized by the browser).
 *
 * State: host `data-state="empty|rendered"`, plus the `data-highlighted`/
 * `data-faded` marks documented in `chart-plot.ts`.
 *
 * Interaction: band axes get hover-activated hit rects (whole-column
 * axis-trigger, matching MUI); on a continuous axis, a series type that plots
 * its own coordinates (scatter) resolves the nearest datum through its
 * `hitTest`, and otherwise the pointer's x is inverted through the scale.
 * `ArrowLeft`/`ArrowRight` walk the data index once the host is focused;
 * `Escape` clears. Events: `select` (click a mark), `highlight` (active
 * item/axis changed).
 */
import "./chart-axis.ts";
import {
  type AxisRegistration,
  type ChartInvalidation,
  type ChartListener,
  type ChartRow,
  type ChartState,
  ChartStore,
  type HighlightState,
  type SeriesRegistration,
  type SeriesRenderContext,
  type StackedValue,
  getSeriesType,
  isNumberValue,
  numberAttribute,
  parseTable,
  stackSeries,
  toNumeric,
} from "./chart-core.ts";
import { DEFAULT_TICK_COUNT, axisScale, categoryRows } from "./chart-domain.ts";
import { ChartPlot, type GridSpec } from "./chart-plot.ts";
import { isDiscreteScale, type Scale } from "./chart-scale.ts";
import { round } from "./chart-shape.ts";
import { define } from "./define.ts";
import { connectLightDom } from "./lifecycle.ts";

export interface UIChartSelectDetail {
  readonly series: string;
  readonly seriesIndex: number;
  readonly index: number;
  readonly value: number | null;
}

export interface UIChartHighlightDetail {
  readonly series: string | null;
  readonly seriesIndex: number | null;
  readonly index: number | null;
}

/** Order two registrations by their elements' document position, so paint order follows authored order however they happened to register. Pairs with no ordering (a detached element) keep insertion order, `Array#sort` being stable. */
function byDocumentOrder(a: SeriesRegistration, b: SeriesRegistration) {
  const relation = a.element.compareDocumentPosition(b.element);
  if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

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

export class UIChart extends HTMLElement {
  static observedAttributes = ["width", "height", "label", "stack-offset"];

  #store = new ChartStore();
  #plot: ChartPlot | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #table: HTMLTableElement | null = null;
  #tableObserver: MutationObserver | null = null;
  #childObserver: MutationObserver | null = null;
  #wired = false;
  /** A full render is queued on a microtask — see {@link #invalidate}. */
  #renderQueued = false;
  /** Set once a consumer assigns `.data`, which (as documented) wins over the authored `<table>` — so neither the initial ingest nor a later table mutation overwrites it. */
  #dataFromProperty = false;

  /** Registrant count per dimension, so two `ui-chart-grid axis="y"` elements don't leave the y grid lines switched off when only one of them is removed. */
  #grids = new Map<"x" | "y", number>();
  #xScale: Scale | undefined;
  #yScale: Scale | undefined;
  #indexAxis: AxisRegistration | undefined;
  #valueAxis: AxisRegistration | undefined;
  /** The rounded box the plot was last drawn at — `undefined` while unmeasured. Interaction reads this rather than the store's raw (sub-pixel) `width`/`height`, so the pointer is mapped into the same coordinate space `#render` actually drew into. */
  #plotSize: { width: number; height: number } | undefined;

  get data() {
    return this.#store.state.data;
  }
  set data(rows: ChartRow[]) {
    this.#dataFromProperty = true;
    this.#store.state.data = rows;
    this.#invalidate("data");
  }

  get label() {
    return this.getAttribute("label");
  }

  /** How stacked series accumulate: `"none"` (default — a running total in series order) or `"diverging"`, which keeps separate positive/negative totals so a mixed-sign stack splits above and below the zero baseline. */
  get stackOffset() {
    return this.getAttribute("stack-offset") === "diverging" ? "diverging" : "none";
  }

  connectedCallback() {
    this.setAttribute("role", "figure");
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  disconnectedCallback() {
    this.#teardown();
  }

  attributeChangedCallback(name: string) {
    if (!this.#wired) return;
    if (name === "label") this.#syncLabel();
    else if (name === "width" || name === "height") this.#measure();
    else this.#scheduleRender();
  }

  // -------------------------------------------------------------------------
  // registration API — used by ui-chart-axis / ui-chart-grid / series elements
  // -------------------------------------------------------------------------

  /** @internal Register an axis; the returned callback removes it again. The registration is live — the axis element *is* it, so an attribute edit is already visible here; the axis just calls {@link requestRender}. */
  registerAxis(registration: AxisRegistration) {
    this.#store.state.axes.push(registration);
    this.#invalidate("registry");
    return () => {
      const { axes } = this.#store.state;
      const at = axes.indexOf(registration);
      if (at >= 0) axes.splice(at, 1);
      this.#invalidate("registry");
    };
  }

  /** @internal Register a series; the returned callback removes it (and its rendered group) again. The list is kept in document order — see {@link byDocumentOrder}. */
  registerSeries(registration: SeriesRegistration) {
    this.#store.state.series.push(registration);
    this.#store.state.series.sort(byDocumentOrder);
    this.#invalidate("registry");
    return () => {
      this.#plot?.removeSeries(registration);
      const { series } = this.#store.state;
      const at = series.indexOf(registration);
      if (at >= 0) series.splice(at, 1);
      this.#invalidate("registry");
    };
  }

  /** @internal `ui-chart-grid` opts a dimension into rendered grid lines — undeclared dimensions draw none. */
  registerGrid(dim: "x" | "y") {
    this.#grids.set(dim, (this.#grids.get(dim) ?? 0) + 1);
    this.#invalidate("registry");
    return () => {
      const remaining = (this.#grids.get(dim) ?? 1) - 1;
      if (remaining > 0) this.#grids.set(dim, remaining);
      else this.#grids.delete(dim);
      this.#invalidate("registry");
    };
  }

  /**
   * @internal A registered axis or series was edited in place (an attribute
   * changed): queue a render, and let subscribers know the registries moved
   * on. Going through {@link #invalidate} rather than rendering directly is
   * what lets `ui-chart-legend` rebuild from a registry signal instead of
   * watching this element's DOM for changes.
   */
  requestRender() {
    this.#invalidate("registry");
  }

  /** @internal Subscribe to this chart's invalidations (what `ui-chart-legend` rebuilds from). Listeners run synchronously; the returned callback unsubscribes. */
  subscribe(listener: ChartListener) {
    return this.#store.subscribe(listener);
  }

  /**
   * The registered **data** series, in document order — annotations (a
   * reference line) excluded. A series' position here is its palette slot, so
   * `ui-chart-legend` and `ui-chart-tooltip` derive `--series-index` from the
   * same list this element renders from rather than re-discovering series by
   * querying the DOM.
   */
  getSeries() {
    return this.#store.state.series.filter((s) => !getSeriesType(s.type)?.annotation);
  }

  /** Toggle a series' visibility (used by `ui-chart-legend`). For an element-backed series this sets the element's own native `hidden`. */
  setSeriesHidden(element: HTMLElement, hidden: boolean) {
    const registration = this.#store.state.series.find((s) => s.element === element);
    if (!registration || registration.hidden === hidden) return;
    registration.hidden = hidden;
    this.#invalidate("registry");
  }

  isSeriesHidden(element: HTMLElement) {
    return this.#store.state.series.some((s) => s.element === element && s.hidden);
  }

  /** @internal Programmatically set the active highlight (pointer/keyboard/legend all funnel through this). */
  setHighlight(next: HighlightState) {
    const { highlight } = this.#store.state;
    if (highlight.index === next.index && highlight.series === next.series) return;
    this.#store.state.highlight = next;
    this.#invalidate("highlight");
    this.#emitHighlight(next);
  }

  // -------------------------------------------------------------------------
  // wiring
  // -------------------------------------------------------------------------

  #wire() {
    this.#wired = true;
    if (!this.#plot || this.#plot.svg.parentNode !== this) {
      this.#plot = new ChartPlot();
      this.append(this.#plot.svg);
    }
    this.#syncLabel();
    this.#syncTable();
    this.#observeChildren();
    this.#measure();
    this.#observeResize();
    this.#attachListeners();
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.#scheduleRender();
  }

  #teardown() {
    // Reset `#wired` so a reconnection re-wires (`table.ts`'s precedent): this
    // element keeps its DOM and its store across a move, but every listener,
    // observer and subscription below is dropped here — and without the reset
    // `connectLightDom` would consider the element already wired and never
    // restore them, leaving a chart that paints once and then ignores resize,
    // pointer and keyboard forever.
    this.#wired = false;
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#tableObserver?.disconnect();
    this.#tableObserver = null;
    this.#childObserver?.disconnect();
    this.#childObserver = null;
    // Forget which table was being watched, so re-wiring re-attaches to it.
    this.#table = null;
    this.#detachListeners();
  }

  #attachListeners() {
    this.addEventListener("pointermove", this.#onPointerMove);
    this.addEventListener("pointerleave", this.#onPointerLeave);
    this.addEventListener("pointerover", this.#onPointerOver);
    this.addEventListener("click", this.#onClick);
    this.addEventListener("keydown", this.#onKeydown);
  }

  #detachListeners() {
    this.removeEventListener("pointermove", this.#onPointerMove);
    this.removeEventListener("pointerleave", this.#onPointerLeave);
    this.removeEventListener("pointerover", this.#onPointerOver);
    this.removeEventListener("click", this.#onClick);
    this.removeEventListener("keydown", this.#onKeydown);
  }

  /**
   * The single funnel every state change goes through, *after* the state has
   * been mutated in place. A highlight is the one kind that cannot alter
   * geometry, and it arrives on every pointer move — so it re-applies the
   * highlight attributes synchronously instead of rebuilding scales, grid
   * lines, bands and marks. Everything else queues one batched render.
   * Subscribers (the legend) are told the kind either way.
   */
  #invalidate(kind: ChartInvalidation) {
    if (kind === "highlight") this.#plot?.applyHighlight(this.#store.state.highlight);
    else this.#scheduleRender();
    this.#store.notify(kind);
  }

  /**
   * Coalesce renders onto one microtask: mounting K children registers K
   * times (axes, series, grids, plus the initial data ingest and measure),
   * and each registration invalidates — deferring the actual `#render` means
   * all of that paints once. The microtask also lands before the browser
   * paints, so nothing is visible in between.
   */
  #scheduleRender() {
    if (this.#renderQueued) return;
    this.#renderQueued = true;
    queueMicrotask(() => {
      this.#renderQueued = false;
      this.#render();
    });
  }

  #syncLabel() {
    const label = this.label;
    if (label) this.setAttribute("aria-label", label);
    else this.removeAttribute("aria-label");
  }

  #ingestTable() {
    if (this.#dataFromProperty) return;
    this.#store.state.data = this.#table ? parseTable(this.#table) : [];
    this.#invalidate("data");
  }

  /**
   * Point at whichever `<table>` is currently authored and read it. Called on
   * wire and whenever this element's own children change, so a dataset table
   * that arrives (or is swapped) after the chart has wired is picked up rather
   * than ignored — no-ops when the table is the same one as last time, which
   * is what every other child mutation (a series element, the generated
   * `<svg>`) amounts to.
   */
  #syncTable() {
    // A direct child only: `ui-chart-tooltip` generates a <table> of its own
    // inside the chart, and a descendant search would happily read that back
    // as the dataset.
    const table = this.querySelector<HTMLTableElement>(":scope > table");
    if (table === this.#table) return;
    this.#table = table;
    this.#tableObserver?.disconnect();
    this.#tableObserver = null;
    // Ingest unconditionally, even when `table` is `null` — a table that was
    // removed or re-parented out of direct-child reach must clear `.data`
    // (and, with it, `data-state`) rather than silently keep rendering
    // whatever the last table said, now that nothing in the DOM can update it.
    if (table && typeof MutationObserver !== "undefined") {
      // Watch the table's own contents too, so a live dataset stays in step.
      // The chart never writes into the table, so this cannot feed back into
      // its own rendering.
      this.#tableObserver = new MutationObserver(() => this.#ingestTable());
      this.#tableObserver.observe(table, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["data-value", "datetime"],
      });
    }
    this.#ingestTable();
  }

  #observeChildren() {
    if (typeof MutationObserver === "undefined") return;
    // Direct children only: the generated `<svg>`'s own subtree churns on every
    // render, and none of it is ever a dataset table.
    this.#childObserver = new MutationObserver(() => {
      this.#ensurePlot();
      this.#syncTable();
    });
    this.#childObserver.observe(this, { childList: true });
  }

  /**
   * Put the plot's `<svg>` back if it has been removed while this element
   * stayed connected — replacing the chart's `innerHTML` does exactly that, and
   * nothing else would ever re-create it (`#wire` runs on connection, and this
   * element never disconnected). Re-appending the existing surface keeps every
   * rendered series with it.
   */
  #ensurePlot() {
    if (this.#plot && this.#plot.svg.parentNode !== this) this.append(this.#plot.svg);
  }

  /** Explicit `width`/`height` attributes size the plot directly; without both, {@link #observeResize} measures instead. */
  #measure() {
    const width = numberAttribute(this, "width");
    const height = numberAttribute(this, "height");
    if (width !== undefined && height !== undefined) this.#setSize(width, height);
  }

  #setSize(width: number, height: number) {
    this.#store.state.width = width;
    this.#store.state.height = height;
    this.#invalidate("size");
  }

  #observeResize() {
    // Keyed on the attributes, not on whether a size has been measured yet: a
    // chart that has already measured once still needs a fresh observer after
    // a DOM move, where this runs again from `#wire`.
    const explicit =
      numberAttribute(this, "width") !== undefined && numberAttribute(this, "height") !== undefined;
    if (explicit || !globalThis.ResizeObserver || !this.#plot) return;
    let frame = 0;
    this.#resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = entry.contentBoxSize?.[0];
        const width = box ? box.inlineSize : entry.contentRect.width;
        const height = box ? box.blockSize : entry.contentRect.height;
        this.#setSize(width, height);
      });
    });
    // Observe the <svg> itself, not the host: consumer CSS is free to lay out
    // axis/legend chrome *around* the plot (a grid, flex row, …), which makes
    // the plot's own rendered box smaller than the host element's box. Tying
    // measurement to the host would make the chart think its drawing area is
    // the full host box, computing a `viewBox`/scale ranges that don't match
    // what's actually visible — this keeps them the same box, always.
    this.#resizeObserver.observe(this.#plot.svg);
  }

  // -------------------------------------------------------------------------
  // render
  // -------------------------------------------------------------------------

  #render() {
    const plot = this.#plot;
    if (!this.#wired || !plot) return;
    const state = this.#store.state;
    const { data } = state;
    // Rounded once, here: a measured box arrives with sub-pixel fractions, and
    // every coordinate derived from it — the viewBox, grid line ends, band
    // heights, a reference line's span — goes into the DOM as a string.
    const width = round(state.width);
    const height = round(state.height);

    this.setAttribute("data-state", data.length === 0 ? "empty" : "rendered");
    if (width <= 0 || height <= 0) {
      this.#plotSize = undefined;
      return;
    }
    this.#plotSize = { width, height };
    plot.resize(width, height);

    const box = { x: 0, y: 0, width, height };
    const visible = state.series.filter((s) => !s.hidden);
    // Stacks for every stacked series at once — one pass per render, shared by
    // the domain aggregation below and by each series' own marks.
    const stacks = this.#stacks(data, visible);
    this.#buildScales(state, box, visible, stacks);

    plot.renderGrid(this.#gridSpecs(), width, height);
    plot.renderBands(this.#xScale, height, this.#bandRows(data));

    const palette = this.getSeries();
    const slots = groupSlots(visible);
    plot.retainSeries(visible);
    for (const registration of visible) {
      const type = getSeriesType(registration.type);
      if (!type) continue;
      const slot = slots.get(registration) ?? { index: 0, count: 1 };
      const context: SeriesRenderContext = {
        config: registration,
        data,
        xScale: this.#xScale,
        yScale: this.#yScale,
        categoryKey: this.#indexAxis?.key,
        stacked: stacks.get(registration),
        plot: box,
        groupIndex: slot.index,
        groupCount: slot.count,
      };
      plot.renderSeries(
        registration,
        context,
        type.computeMarks(context),
        palette.indexOf(registration),
      );
    }

    plot.applyHighlight(state.highlight);
  }

  /** Resolve both axes' scales, and hand each axis the one it draws its own ticks from. */
  #buildScales(
    state: ChartState,
    box: { x: number; y: number; width: number; height: number },
    visible: readonly SeriesRegistration[],
    stacks: ReadonlyMap<SeriesRegistration, StackedValue[]>,
  ) {
    this.#indexAxis = state.axes.find((a) => a.position === "bottom" || a.position === "top");
    this.#valueAxis = state.axes.find((a) => a.position === "left" || a.position === "right");
    const common = { data: state.data, series: visible, stacks };
    this.#xScale = this.#indexAxis
      ? axisScale({
          ...common,
          axis: this.#indexAxis,
          range: [box.x, box.x + box.width],
          dim: "x",
        })
      : undefined;
    this.#yScale = this.#valueAxis
      ? axisScale({
          ...common,
          axis: this.#valueAxis,
          range: [box.y + box.height, box.y],
          dim: "y",
        })
      : undefined;

    // Every registered axis is told what to draw, including the ones that are
    // not in use — an axis that loses its slot clears its ticks rather than
    // leaving a stale set of them on the page.
    for (const axis of state.axes) {
      if (axis === this.#indexAxis) axis.render(this.#xScale);
      else if (axis === this.#valueAxis) axis.render(this.#yScale);
      else axis.render(undefined);
    }
  }

  /** The data row each band stands for, positionally — see `categoryRows`. Empty unless the index axis is discrete and names a column. */
  #bandRows(data: readonly ChartRow[]) {
    const scale = this.#xScale;
    const key = this.#indexAxis?.key;
    if (!scale || !isDiscreteScale(scale) || !key) return [];
    return categoryRows(data, key, scale.domain());
  }

  /** Each dimension that both opted into grid lines and has a continuous scale to tick. */
  #gridSpecs() {
    const specs: GridSpec[] = [];
    for (const dim of ["x", "y"] as const) {
      if (!this.#grids.has(dim)) continue;
      const scale = dim === "x" ? this.#xScale : this.#yScale;
      if (!scale || isDiscreteScale(scale)) continue;
      const axis = dim === "x" ? this.#indexAxis : this.#valueAxis;
      specs.push({ dim, scale, tickCount: axis?.tickCount ?? DEFAULT_TICK_COUNT });
    }
    return specs;
  }

  /** Each stacked series' `[y0, y1]` per row. Only a series that both stacks *and* declares a `stack` group participates — everything else plots its raw values. */
  #stacks(data: readonly ChartRow[], visible: readonly SeriesRegistration[]) {
    const stackable = visible.filter((s) => s.stack !== undefined && getSeriesType(s.type)?.stacks);
    const stacked = stackSeries(data, stackable, this.stackOffset);
    return new Map(stackable.map((registration, i) => [registration, stacked[i]!]));
  }

  // -------------------------------------------------------------------------
  // interaction
  // -------------------------------------------------------------------------

  /**
   * The rendered mark (and its series) under `target`, if any — the
   * mark-resolution dance `pointerover` and `click` share: any series type's
   * own hit shape carries a `data-index` inside a series group, so this
   * generalizes across every series type uniformly without naming a specific
   * `data-part`.
   */
  #markAt(target: EventTarget | null) {
    if (!(target instanceof Element)) return null;
    const mark = target.closest<SVGElement>("[data-index]");
    if (!mark) return null;
    const series = this.#plot?.seriesAt(mark);
    return series ? { mark, series } : null;
  }

  #onPointerOver = (event: PointerEvent) => {
    // A mark (any series type's own hit shape — bar/scatter's <rect>/<circle>,
    // pie's <path>, …) paints on top of a band rect where the two overlap, so
    // it must win the hit test.
    const hit = this.#markAt(event.target);
    if (hit) {
      this.setHighlight({ index: Number(hit.mark.dataset.index), series: hit.series.element });
      return;
    }

    if (!(event.target instanceof Element)) return;
    const band = event.target.closest<SVGRectElement>('[data-part="band"]');
    if (!band?.dataset.index) return;
    this.setHighlight({ index: Number(band.dataset.index), series: null });
  };

  #onPointerMove = (event: PointerEvent) => {
    const xScale = this.#xScale;
    if (!xScale || isDiscreteScale(xScale)) return;
    const point = this.#localPoint(event);
    // Only the plot drives the plot: this listener is on the host, so it also
    // sees the pointer crossing the legend, the axis chrome and the tooltip —
    // none of which should pull the highlight away from what they are showing.
    // `#localPoint` returns non-null only when `#plotSize` is set, so this box
    // is the same one that pointer was just mapped into.
    if (!point || !this.#plotSize) return;
    const { width, height } = this.#plotSize;
    if (point.x < 0 || point.x > width || point.y < 0 || point.y > height) return;

    // A series that plots its own coordinates (scatter) knows its geometry
    // better than the axis does — ask each one, and take the closest.
    const hit = this.#hitTest(point.x, point.y);
    if (hit) {
      this.setHighlight({ index: hit.index, series: hit.element });
      return;
    }
    const index = this.#nearestIndex(xScale.invert(point.x));
    if (index !== null) this.setHighlight({ index, series: null });
  };

  /** The pointer in local (viewBox) coordinates, or `null` when the plot has no laid-out box to map through. Maps into `#plotSize` — the same rounded box `#render` drew the viewBox and every mark at — not the store's raw sub-pixel measurement, so a pointer at the plot's own edge is never (by up to half a rounding unit) reported as outside it. */
  #localPoint(event: PointerEvent) {
    if (!this.#plot || !this.#plotSize) return null;
    const rect = this.#plot.svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const { width, height } = this.#plotSize;
    return {
      x: ((event.clientX - rect.left) / rect.width) * width,
      y: ((event.clientY - rect.top) / rect.height) * height,
    };
  }

  /** The nearest datum across every rendered series that implements `hitTest`, or `null` if none does (the usual case — a series plotted against the shared index axis resolves through {@link #nearestIndex} instead). */
  #hitTest(x: number, y: number) {
    let best: { index: number; element: HTMLElement } | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const [registration, context] of this.#plot?.rendered() ?? []) {
      const hit = getSeriesType(registration.type)?.hitTest?.(context, x, y);
      if (hit && hit.distance < bestDistance) {
        bestDistance = hit.distance;
        best = { index: hit.index, element: registration.element };
      }
    }
    return best;
  }

  /** The data row whose index-axis value is closest to `value` — the axis-trigger fallback for a continuous axis with a `key`. A row with no plottable value in that column (`toNumeric` → `NaN`; `Number(null)` would have been 0, parking a null row at the origin) never competes, and `null` comes back when no row does. */
  #nearestIndex(value: number) {
    const { data } = this.#store.state;
    const key = this.#indexAxis?.key;
    if (!key || data.length === 0) return null;
    let best: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    data.forEach((row, i) => {
      const distance = Math.abs(toNumeric(row[key] ?? null) - value);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
    return best;
  }

  #onPointerLeave = () => {
    this.setHighlight({ index: null, series: null });
  };

  #onClick = (event: MouseEvent) => {
    const hit = this.#markAt(event.target);
    if (!hit) return;
    const index = Number(hit.mark.dataset.index);
    const value = this.#store.state.data[index]?.[hit.series.key];
    this.dispatchEvent(
      new CustomEvent<UIChartSelectDetail>("select", {
        bubbles: true,
        detail: {
          series: hit.series.key,
          seriesIndex: this.getSeries().indexOf(hit.series),
          index,
          value: isNumberValue(value) ? value : null,
        },
      }),
    );
  };

  #onKeydown = (event: KeyboardEvent) => {
    const { data, highlight } = this.#store.state;
    if (data.length === 0) return;
    const current = highlight.index ?? -1;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      this.setHighlight({ index: Math.min(data.length - 1, current + 1), series: null });
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      this.setHighlight({ index: Math.max(0, current - 1), series: null });
    } else if (event.key === "Escape") {
      this.setHighlight({ index: null, series: null });
    }
  };

  #emitHighlight(next: HighlightState) {
    const registration = this.#store.state.series.find((s) => s.element === next.series);
    const seriesIndex = registration ? this.getSeries().indexOf(registration) : -1;
    this.dispatchEvent(
      new CustomEvent<UIChartHighlightDetail>("highlight", {
        bubbles: true,
        detail: {
          series: registration?.key ?? null,
          seriesIndex: seriesIndex >= 0 ? seriesIndex : null,
          index: next.index,
        },
      }),
    );
  }
}

define("ui-chart", UIChart);

declare global {
  interface HTMLElementTagNameMap {
    "ui-chart": UIChart;
  }
}
