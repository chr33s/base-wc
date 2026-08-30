/**
 * The shared engine behind the `ui-chart` family: dataset ingestion (from an
 * authored `<table>` or a `data` property), stacking, extremum aggregation,
 * highlight-state resolution, and the per-series-type renderer registry.
 *
 * This is the framework-free replacement for `@mui/x-charts`'s `Store` +
 * plugin system (`@mui/x-internals/store` + `internals/plugins/*`): a plain
 * mutable state bag plus an explicit invalidation channel ({@link ChartStore}
 * — mutate the state, then `notify` the {@link ChartInvalidation} kind that
 * describes what moved; no immutable-patch protocol, no reselect — charts are
 * small enough that a full recompute per invalidation is cheap), and a
 * `registerSeriesType` registry that each series element module
 * (`chart-bar.ts`, `chart-line.ts`, …) populates on evaluation, so unused
 * chart types tree-shake away. `ui-chart` (`chart.ts`) is the only consumer
 * that touches the DOM directly; everything here is pure and side-effect-free
 * except {@link ChartStore} itself (an explicit, minimal exception — a store
 * inherently holds state).
 *
 * The store holds the *only* copy of the registered axes and series: `ui-chart`
 * renders from `state.series`, and `ui-chart-legend`/`ui-chart-tooltip` read
 * the same list back through `chart.getSeries()`. The registered objects are
 * (usually) the series/axis **elements themselves** — `chart-series.ts`/
 * `chart-axis.ts` implement the registration interfaces directly, so there is
 * no mirror object to keep in sync. Nothing re-derives the series list by
 * querying the DOM, and nothing tracks visibility on the side — a series'
 * identity (its {@link SeriesRegistration} object), its order, and its
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
 * datetime>` (a bare `YYYY-MM-DD` being read as local midnight — see
 * {@link parseDate}), a `number` when its text parses as one, otherwise its
 * trimmed text (or `null` when empty). A `data-value` attribute on the cell
 * overrides what its text/`<time>` would otherwise produce — for a display
 * string that differs from the value used for scaling (e.g.
 * `data-value="1400"` inside a cell reading "$1,400").
 */
export function parseTable(table: HTMLTableElement) {
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

/** A bare calendar day, with no time and no zone — the `<time datetime>` form that `Date`'s own parser reads as UTC midnight. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse a `<time datetime>` (or `data-value`) source into a `Date`. A bare
 * `YYYY-MM-DD` becomes **local** midnight rather than the UTC midnight
 * `new Date(string)` gives it: the rest of the chart family works in local
 * time — `chart-scale.ts`'s calendar tick intervals floor to local
 * days/months, and an axis tick formats through `toLocaleDateString` — so a
 * UTC instant would sit a whole timezone offset away from the ticks meant to
 * label it, and anywhere west of UTC would render `2026-01-01` as the 31st of
 * December. A source that carries its own time (and so its own zone, explicit
 * or local) is unambiguous and is parsed as written.
 */
function parseDate(source: string) {
  const parts = DATE_ONLY.exec(source.trim());
  if (!parts) return new Date(source);
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
}

function parseCell(cell: HTMLTableCellElement) {
  const override = cell.getAttribute("data-value");
  const time = cell.querySelector("time[datetime]");
  if (time) {
    const source = override ?? time.getAttribute("datetime") ?? "";
    const date = parseDate(source);
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
export function numberAttribute(element: HTMLElement, name: string) {
  return element.hasAttribute(name) ? Number(element.getAttribute(name)) : undefined;
}

/** Coerce a cell value to the number a continuous scale needs (`Date` → epoch ms). `null`/unparsable → `NaN`. */
export function toNumeric(value: ChartValue) {
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
) {
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

/**
 * One registered axis. `ui-chart-axis` implements this interface directly —
 * the element *is* its registration, its attribute getters are these fields —
 * so an attribute edit is already visible here with nothing to re-sync.
 */
export interface AxisRegistration {
  /** Which edge this axis sits on. One axis per orientation is used — the first registered horizontal (`top`/`bottom`) axis is the chart's index axis, the first vertical one its value axis; MUI's multi-axis `axisId` model is not ported. */
  readonly position: AxisPosition;
  /** Dataset column this axis reads its domain from (band/point/time axes; omitted for a scatter value axis). */
  readonly key?: string;
  readonly scaleType: ScaleType;
  readonly min?: number;
  readonly max?: number;
  readonly tickCount?: number;
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
 *
 * `ui-chart-series`'s subclasses implement this interface directly: the
 * element *is* the registration, its attribute getters are these fields, and
 * {@link SeriesRegistration.element} is the element itself. A plain object
 * satisfying the interface registers just as well (tests do), which is why
 * `element` stays an explicit field rather than the interface extending
 * `HTMLElement`.
 */
export interface SeriesRegistration {
  /** The DOM handle for this series — the registered element itself, for an element-backed registration. What `HighlightState.series` points at, and what document ordering compares. */
  readonly element: HTMLElement;
  readonly type: string;
  /** The primary dataset column: the value column for bar/line/pie (plotted against the shared index axis or, for pie, allocated as slices), or the y-value column for an x/y-pair series like scatter. */
  readonly key: string;
  /** The x-value column for a series that plots two independent value columns (scatter) rather than reading its x position from a shared category/index axis. */
  readonly xKey?: string;
  /** Display name for legend/tooltip text. Falls back to `key` (the raw column name) when omitted. */
  readonly label?: string;
  readonly stack?: string;
  readonly highlightScope: HighlightScope;
  /** Live visibility — toggled through `ui-chart`'s `setSeriesHidden` (what `ui-chart-legend` drives) and read back by `isSeriesHidden`. This field is the only record of it. On an element-backed registration it is the element's own native `hidden` — so `<ui-chart-bar hidden>` starts hidden, and the state survives a DOM move with the element. */
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

/**
 * What a {@link ChartStore.notify} call says changed — the invalidation kinds
 * consumers key off explicitly (rather than sniffing the shape of a patch):
 * - `"data"` — the dataset rows were replaced (table re-ingest, `.data` set).
 * - `"size"` — the measured/authored plot box changed.
 * - `"registry"` — the registered axes/series/grids changed: one was added,
 *   removed, edited in place (an attribute change), or had its `hidden`
 *   toggled. This is the kind `ui-chart-legend` rebuilds from.
 * - `"highlight"` — only the active highlight moved. The one kind that cannot
 *   alter geometry, and it arrives on every pointer move — `ui-chart` handles
 *   it synchronously without scheduling a render.
 */
export type ChartInvalidation = "data" | "size" | "registry" | "highlight";

/** Notified synchronously by every {@link ChartStore.notify}, with the kind of change. State is read back from the store — it was already mutated in place before the notification. */
export type ChartListener = (kind: ChartInvalidation) => void;

/**
 * The chart's state bag plus its invalidation channel. State is **plain and
 * mutable** — a caller edits `state` directly (push a registration, assign
 * `data`, flip `hidden`) and then calls {@link ChartStore.notify} with the
 * {@link ChartInvalidation} kind describing what moved. There is no
 * immutable-patch protocol: nothing needed one (a chart re-derives everything
 * per render), and cloning arrays purely to signal "something changed" only
 * disguised the mutation that had already happened.
 */
export class ChartStore {
  readonly state: ChartState = {
    data: [],
    width: 0,
    height: 0,
    axes: [],
    series: [],
    highlight: { index: null, series: null },
  };

  #listeners = new Set<ChartListener>();

  /** Tell every subscriber, synchronously, what kind of change just happened. */
  notify(kind: ChartInvalidation) {
    for (const listener of this.#listeners) listener(kind);
  }

  subscribe(listener: ChartListener) {
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
) {
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
) {
  return scope.highlight !== "none" && highlight.series === seriesElement;
}

/** Whether the whole of `seriesElement` should fade: some *other* series is specifically active, and this one's scope fades for it. An axis-wide highlight (no series) fades no series as a whole — it fades individual marks instead. */
export function isSeriesFaded(
  highlight: HighlightState,
  scope: HighlightScope,
  seriesElement: HTMLElement,
) {
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
) {
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
  /** The registration being rendered — for an element-backed series this *is* the element (`config.element === config`), so a renderer narrows `config.element` with `instanceof` to reach its own attribute surface. */
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
  /**
   * This series' contribution to its axis's domain along `dim`, or `null` if
   * it has none (e.g. an empty dataset). Receives the whole registration —
   * not just a column name — because the contribution can depend on series
   * config: scatter picks `xKey` vs `key` by dimension, and a zero-baseline
   * geometry (a bar, an unstacked `area` line, both of which draw from y=0 to
   * the value) must merge `[0, 0]` in so the baseline is always in-domain.
   */
  getExtremum(
    data: readonly ChartRow[],
    series: SeriesRegistration,
    dim: "x" | "y",
  ): [number, number] | null;
  /** Build this series' marks in local plot-pixel coordinates. */
  computeMarks(context: SeriesRenderContext): MarkDescriptor[];
  /** Nearest-datum hit test for axis-trigger interaction on non-banded axes (e.g. scatter, whose points carry their own x); band axes resolve the index from their own scale/hit-rects instead, and a series type that plots against the shared index axis needs none. */
  hitTest?(context: SeriesRenderContext, pointerX: number, pointerY: number): SeriesHit | null;
}

const seriesTypes = new Map<string, SeriesTypeDefinition>();

/** Register a series type's renderer (called once at module evaluation by each `chart-*.ts` series module). Re-registering the same `type` replaces the previous definition. */
export function registerSeriesType(definition: SeriesTypeDefinition) {
  seriesTypes.set(definition.type, definition);
}

export function getSeriesType(type: string) {
  return seriesTypes.get(type);
}
