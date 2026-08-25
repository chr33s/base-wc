/**
 * The shared engine behind the `ui-chart` family: dataset ingestion (from an
 * authored `<table>` or a `data` property), stacking, extremum aggregation,
 * highlight-state resolution, and the per-series-type renderer registry.
 *
 * This is the framework-free replacement for `@mui/x-charts`'s `Store` +
 * plugin system (`@mui/x-internals/store` + `internals/plugins/*`): a plain
 * object store with a `subscribe`/`setState` surface (no React, no reselect —
 * charts are small enough that a full recompute per `setState` is cheap), and
 * a `registerSeriesType` registry that each series element module
 * (`chart-bar.ts`, `chart-line.ts`, …) populates on evaluation, so unused
 * chart types tree-shake away. `ui-chart` (`chart.ts`) is the only consumer
 * that touches the DOM directly; everything here is pure and side-effect-free
 * except {@link ChartStore} itself (an explicit, minimal exception — a store
 * inherently holds state).
 *
 * The store holds the *only* copy of the registered axes and series: `ui-chart`
 * renders from `state.series`, and `ui-chart-legend`/`ui-chart-tooltip` read
 * the same list back through `chart.getSeries()`. Nothing re-derives the series
 * list by querying the DOM, and nothing tracks visibility on the side — a
 * series' identity (its {@link SeriesRegistration} object), its order, and its
 * {@link SeriesRegistration.hidden} state each live in exactly one place.
 */
import type { CategoryValue, Scale, ScaleType } from "./chart-scale.ts";

// ---------------------------------------------------------------------------
// dataset model
// ---------------------------------------------------------------------------

export type ChartValue = CategoryValue | null;
export type ChartRow = Record<string, ChartValue>;

/**
 * Read a `<table>`'s rows into columnar {@link ChartRow} objects, keyed by
 * header text. A cell's value is a `Date` when it contains a `<time
 * datetime>`, a `number` when its text parses as one, otherwise its trimmed
 * text (or `null` when empty). A `data-value` attribute on the cell overrides
 * what its text/`<time>` would otherwise produce — for a display string that
 * differs from the value used for scaling (e.g. `data-value="1400"` inside a
 * cell reading "$1,400").
 */
export function parseTable(table: HTMLTableElement): ChartRow[] {
  // `querySelectorAll`, not `.rows` (an `HTMLTableSectionElement` property some
  // DOM implementations — including the happy-dom test environment — don't
  // implement), so this works identically under real browsers and unit tests.
  const headerRow =
    table.tHead?.querySelector<HTMLTableRowElement>("tr") ??
    table.querySelector<HTMLTableRowElement>("tr");
  if (!headerRow) return [];
  const keys = Array.from(headerRow.cells).map((cell) => cell.textContent?.trim() ?? "");

  const body = table.tBodies[0];
  const bodyRows = (
    body
      ? Array.from(body.querySelectorAll<HTMLTableRowElement>("tr"))
      : Array.from(table.querySelectorAll<HTMLTableRowElement>("tr"))
  ).filter((row) => row !== headerRow);

  return bodyRows.map((row) => {
    const out: ChartRow = {};
    Array.from(row.cells).forEach((cell, i) => {
      const key = keys[i];
      if (key === undefined || key === "") return;
      out[key] = parseCell(cell);
    });
    return out;
  });
}

function parseCell(cell: HTMLTableCellElement): ChartValue {
  const override = cell.getAttribute("data-value");
  const time = cell.querySelector("time[datetime]");
  if (time) {
    const source = override ?? time.getAttribute("datetime") ?? "";
    const date = new Date(source);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const text = (override ?? cell.textContent ?? "").trim();
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : text;
}

/** Whether `value` is `ChartValue`'s numeric member. `NaN`/`±Infinity` count — this classifies a cell's type, not its plottability (`Number.isFinite` guards the latter at each use site). */
export function isNumberValue(value: ChartValue | undefined): value is number {
  if (value == null || value instanceof Date) return false;
  return Number.isNaN(value) || value === Number(value);
}

/** Read an optional numeric attribute: the parsed number, or `undefined` when the attribute is absent — an unauthored bound or tick count means "derive it", which is not the same as `0`. */
export function numberAttribute(element: HTMLElement, name: string): number | undefined {
  return element.hasAttribute(name) ? Number(element.getAttribute(name)) : undefined;
}

/** Coerce a cell value to the number a continuous scale needs (`Date` → epoch ms). `null`/unparsable → `NaN`. */
export function toNumeric(value: ChartValue): number {
  if (value instanceof Date) return value.getTime();
  if (value == null) return Number.NaN;
  return Number(value);
}

// ---------------------------------------------------------------------------
// extrema
// ---------------------------------------------------------------------------

/** `[min, max]` of `data[*][key]`, coerced numerically; `null` if no row has a finite value. */
export function numericExtent(data: readonly ChartRow[], key: string): [number, number] | null {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const row of data) {
    const n = toNumeric(row[key]);
    if (!Number.isFinite(n)) continue;
    if (n < lo) lo = n;
    if (n > hi) hi = n;
  }
  return lo <= hi ? [lo, hi] : null;
}

/** The union `[min, max]` across several extents, skipping `null`s. `null` if every extent is `null`. */
export function mergeExtent(
  ...extents: ReadonlyArray<[number, number] | null>
): [number, number] | null {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const extent of extents) {
    if (!extent) continue;
    if (extent[0] < lo) lo = extent[0];
    if (extent[1] > hi) hi = extent[1];
  }
  return lo <= hi ? [lo, hi] : null;
}

// ---------------------------------------------------------------------------
// stacking
// ---------------------------------------------------------------------------

export interface StackedValue {
  y0: number;
  y1: number;
}

export type StackOffset = "none" | "diverging";

/**
 * Compute each series' `[y0, y1]` per data row, returned **positionally**:
 * `result[i]` belongs to `series[i]`. Series are grouped by their `stack` id —
 * a series with no `stack` (or a distinct one) is never combined with another,
 * matching MUI: `stack` is the opt-in that turns "grouped" series into
 * "stacked" ones. Within a group, `"none"` accumulates in series order
 * regardless of sign (a negative value still stacks on top of the running
 * total); `"diverging"` (MUI's `offsetDiverging`) keeps a separate running
 * total for positive and negative values so mixed-sign stacks split
 * above/below the zero baseline.
 *
 * Results are positional rather than keyed by column name so that two series
 * plotting the *same* dataset column (a bar and a line over `Revenue`, say)
 * each get their own entry instead of silently sharing one.
 */
export function stackSeries(
  data: readonly ChartRow[],
  series: ReadonlyArray<{ key: string; stack?: string }>,
  offset: StackOffset = "none",
): StackedValue[][] {
  // Keyed by stack id (a string) or, for an unstacked series, by its own
  // position (a number) — so an unstacked series groups only with itself, and
  // no authored `stack` id can ever collide with that.
  const groups = new Map<string | number, number[]>();
  series.forEach((s, i) => {
    const groupKey = s.stack ?? i;
    const group = groups.get(groupKey);
    if (group) group.push(i);
    else groups.set(groupKey, [i]);
  });

  const result: StackedValue[][] = series.map(() => []);
  for (const group of groups.values()) {
    const positive = data.map(() => 0);
    const negative = data.map(() => 0);
    for (const i of group) {
      const key = series[i]!.key;
      result[i] = data.map((row, r) => {
        const value = toNumeric(row[key] ?? null) || 0;
        if (offset === "diverging" && value < 0) {
          const y1 = negative[r]!;
          const y0 = y1 + value;
          negative[r] = y0;
          return { y0, y1 };
        }
        const y0 = positive[r]!;
        const y1 = y0 + value;
        positive[r] = y1;
        return { y0, y1 };
      });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// axis / series registration models
// ---------------------------------------------------------------------------

export type AxisPosition = "top" | "bottom" | "left" | "right";

export interface AxisRegistration {
  /** Which edge this axis sits on. One axis per orientation is used — the first registered horizontal (`top`/`bottom`) axis is the chart's index axis, the first vertical one its value axis; MUI's multi-axis `axisId` model is not ported. */
  position: AxisPosition;
  /** Dataset column this axis reads its domain from (band/point/time axes; omitted for a scatter value axis). */
  key?: string;
  scaleType: ScaleType;
  min?: number;
  max?: number;
  tickCount?: number;
  /**
   * Draw this axis's own tick markup for the scale `ui-chart` has just built
   * from the registration — or clear it, given `undefined`, which says this
   * axis is registered but not in use (a second axis on a side that is already
   * taken). The container hands over the resolved scale and writes nothing
   * into the axis element itself — an axis owns everything below it, the same
   * way a series owns its marks.
   */
  render(scale: Scale | undefined): void;
}

export interface HighlightScope {
  highlight: "item" | "series" | "none";
  fade: "global" | "series" | "none";
}

/**
 * One registered series. **The object itself is the series' identity** —
 * `ui-chart` keys its rendered DOM by it, `stackSeries` returns results
 * positionally alongside it, and its position in the registry is its palette
 * slot. Nothing resolves a series through {@link SeriesRegistration.key}, so
 * two series plotting the *same* dataset column — a bar and a line over
 * `Revenue`, the canonical combo chart — never collide.
 */
export interface SeriesRegistration {
  element: HTMLElement;
  type: string;
  /** The primary dataset column: the value column for bar/line/pie (plotted against the shared index axis or, for pie, allocated as slices), or the y-value column for an x/y-pair series like scatter. */
  key: string;
  /** The x-value column for a series that plots two independent value columns (scatter) rather than reading its x position from a shared category/index axis. */
  xKey?: string;
  /** Display name for legend/tooltip text. Falls back to `key` (the raw column name) when omitted. */
  label?: string;
  stack?: string;
  highlightScope: HighlightScope;
  /** Live visibility — toggled through `ui-chart`'s `setSeriesHidden` (what `ui-chart-legend` drives) and read back by `isSeriesHidden`. This field is the only record of it; there is no parallel set. */
  hidden: boolean;
}

export interface HighlightState {
  /** The active data-row index (axis-trigger hover/keyboard nav), or `null`. */
  index: number | null;
  /** The specifically-hovered/legend-active series element, or `null` for an axis-wide highlight. */
  series: HTMLElement | null;
}

export interface ChartState {
  data: ChartRow[];
  width: number;
  height: number;
  /** Registered axes, in registration order — the list `ui-chart` renders from, not a mirror of one. */
  axes: AxisRegistration[];
  /** Registered series, in document order (paint order) — the list `ui-chart` renders from, and what `ui-chart-legend`/`ui-chart-tooltip` read through `chart.getSeries()`. */
  series: SeriesRegistration[];
  highlight: HighlightState;
}

/** Notified after every `setState`, with the merged state and the `patch` that produced it — a listener that only cares about, say, a highlight change can check the patch instead of redoing all of its work. */
export type ChartListener = (state: ChartState, patch: Partial<ChartState>) => void;

function initialState(initial: Partial<ChartState>): ChartState {
  return {
    data: [],
    width: 0,
    height: 0,
    axes: [],
    series: [],
    highlight: { index: null, series: null },
    ...initial,
  };
}

/** A minimal observable store: `setState` replaces state wholesale and notifies every subscriber synchronously — charts are small enough that a full recompute per update is cheap, so there is no selector/memoization layer. */
export class ChartStore {
  #state: ChartState;
  #listeners = new Set<ChartListener>();

  constructor(initial: Partial<ChartState> = {}) {
    this.#state = initialState(initial);
  }

  getState(): ChartState {
    return this.#state;
  }

  setState(patch: Partial<ChartState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const listener of this.#listeners) listener(this.#state, patch);
  }

  subscribe(listener: ChartListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}

// ---------------------------------------------------------------------------
// highlight resolution — pure functions shared by every series renderer
// ---------------------------------------------------------------------------

/**
 * Whether the mark at `index` in `seriesElement` is the active one, given
 * that series' {@link HighlightScope}. `scope.highlight` decides what "active"
 * means once this series *is* the one targeted: `"none"` — never; `"series"`
 * — every mark in it, regardless of index (the series-wide unit MUI calls
 * `highlightScope: "series"`); `"item"` (default) — only the matching index,
 * or every mark when no index is specified (a legend hover, which targets the
 * series but names no row). Independent of scope, a mark is also swept in by
 * an axis-wide highlight (no specific series active, just a data index).
 */
export function isMarkHighlighted(
  highlight: HighlightState,
  scope: HighlightScope,
  seriesElement: HTMLElement,
  index: number,
): boolean {
  if (scope.highlight === "none") return false;
  if (highlight.series === seriesElement) {
    if (scope.highlight === "series") return true;
    return highlight.index === null || highlight.index === index;
  }
  if (highlight.series === null) return highlight.index === index;
  return false;
}

/**
 * Whether `seriesElement` as a whole is the active series — a legend hover,
 * or the pointer over one of its marks, unless `scope.highlight` opts it out
 * with `"none"`. Drives the state on marks that represent no single row (a
 * line's stroke, an area fill), which have no per-index state to fall back to.
 */
export function isSeriesHighlighted(
  highlight: HighlightState,
  scope: HighlightScope,
  seriesElement: HTMLElement,
): boolean {
  return scope.highlight !== "none" && highlight.series === seriesElement;
}

/** Whether the whole of `seriesElement` should fade: some *other* series is specifically active, and this one's scope fades for it. An axis-wide highlight (no series) fades no series as a whole — it fades individual marks instead. */
export function isSeriesFaded(
  highlight: HighlightState,
  scope: HighlightScope,
  seriesElement: HTMLElement,
): boolean {
  if (scope.fade === "none" || highlight.series === null) return false;
  return highlight.series !== seriesElement;
}

/**
 * Whether the mark at `index` in `seriesElement` should fade, given that
 * series' {@link HighlightScope}. Never fades the highlighted mark itself, or
 * anything while nothing is active. `"global"` fades every other mark;
 * `"series"` fades only marks in a *different* series than the one
 * specifically hovered (an axis-wide highlight, with no specific series,
 * fades nothing under `"series"` scope).
 */
export function isMarkFaded(
  highlight: HighlightState,
  scope: HighlightScope,
  seriesElement: HTMLElement,
  index: number,
): boolean {
  if (scope.fade === "none") return false;
  if (highlight.series === null && highlight.index === null) return false;
  if (isMarkHighlighted(highlight, scope, seriesElement, index)) return false;
  if (scope.fade === "global") return true;
  return highlight.series !== null;
}

// ---------------------------------------------------------------------------
// series-type registry
// ---------------------------------------------------------------------------

export interface MarkDescriptor {
  /** Stable key for reconciliation across renders (e.g. `"stroke"`, or the row index) — never re-derived from array position. Scoped to its own series, so two series may use the same key without colliding. */
  key: string;
  tag: "rect" | "path" | "circle" | "text";
  /** `data-part` value applied to the element. */
  part: string;
  /** Structural SVG attributes only (`d`, `x`, `width`, `cx`, `r`, `transform`, `fill="none"`, …) — never presentational color/paint. */
  attrs: Record<string, string>;
  /** The data-row index this mark represents, when it represents exactly one (drives `data-index` + highlight/fade + events). */
  index?: number;
  text?: string;
}

export interface SeriesRenderContext {
  element: HTMLElement;
  config: SeriesRegistration;
  data: readonly ChartRow[];
  xScale: Scale | undefined;
  yScale: Scale | undefined;
  /**
   * The shared index/category axis's dataset column (e.g. `"Month"`), when
   * `xScale` is that axis (band/point/time). A bar/line series reads
   * `row[categoryKey]` to get each row's own category value to plot against
   * `xScale` — *not* `xScale.domain()[i]`, which only lines up with `data[i]`
   * when every row has a distinct category (`chart-domain.ts`'s
   * `categoricalDomain` dedupes).
   * `undefined` when there is no shared index axis (e.g. scatter, which reads
   * `config.xKey`/`config.key` directly instead).
   */
  categoryKey: string | undefined;
  /** Present when this series type stacks (bar/area) and participates in a `stack` group. */
  stacked: ReadonlyArray<StackedValue> | undefined;
  /** The plot area in local SVG coordinates. */
  plot: { x: number; y: number; width: number; height: number };
  /**
   * This series' slot among the visible siblings of its own type that share a
   * band — one slot per stack group plus one per unstacked series, in document
   * order. A bar series splits the band into {@link groupCount} columns and
   * draws in column {@link groupIndex}; a type that doesn't sit side-by-side
   * ignores both. Computed by `ui-chart` from its own registry, so hiding a
   * series re-splits the band instead of leaving its column empty.
   */
  groupIndex: number;
  groupCount: number;
}

/** A `hitTest` result: which data row the pointer is nearest, and how far away it is in plot pixels (so `ui-chart` can pick the closest across several series). */
export interface SeriesHit {
  index: number;
  distance: number;
}

export interface SeriesTypeDefinition {
  type: string;
  /** Whether this series type participates in `stackSeries` (bar/area) — if so, `chart.ts` computes `stacked` before calling `computeMarks`. */
  stacks: boolean;
  /** An annotation (a reference line) rather than a data series: excluded from the palette slots, the legend, and the tooltip. Defaults to `false` — a plain data series. */
  annotation?: boolean;
  /** This series' contribution to its axis's domain along `dim`, or `null` if it has none (e.g. an empty dataset). */
  getExtremum(data: readonly ChartRow[], key: string, dim: "x" | "y"): [number, number] | null;
  /** Build this series' marks in local plot-pixel coordinates. */
  computeMarks(context: SeriesRenderContext): MarkDescriptor[];
  /** Nearest-datum hit test for axis-trigger interaction on non-banded axes (e.g. scatter, whose points carry their own x); band axes resolve the index from their own scale/hit-rects instead, and a series type that plots against the shared index axis needs none. */
  hitTest?(context: SeriesRenderContext, pointerX: number, pointerY: number): SeriesHit | null;
}

const seriesTypes = new Map<string, SeriesTypeDefinition>();

/** Register a series type's renderer (called once at module evaluation by each `chart-*.ts` series module). Re-registering the same `type` replaces the previous definition. */
export function registerSeriesType(definition: SeriesTypeDefinition): void {
  seriesTypes.set(definition.type, definition);
}

export function getSeriesType(type: string): SeriesTypeDefinition | undefined {
  return seriesTypes.get(type);
}
