/**
 * Path-geometry kernel for the `ui-chart` family: line/area curve generators,
 * annular-arc paths (pie/donut/gauge), and pie angle allocation. A from-scratch
 * reimplementation of the d3-shape (ISC © Mike Bostock) subset `@mui/x-charts`
 * needs — `@chr33s/base-wc` ships zero runtime dependencies, so nothing here is
 * vendored. Every generator emits an SVG path-data string, rounded to 3
 * fractional digits (matching d3-shape's own default `digits`), so output is
 * usable both as `<path d>` and as `new Path2D(d)`. Curves are cut down to the
 * subset MUI's cartesian charts actually use: `linear`, the three `step`
 * variants, and `monotone` (`monotoneX` — never overshoots, so it's the only
 * smooth curve offered); `arcPath` omits `cornerRadius` (deferred) and
 * approximates `padAngle` as a simple angular inset shared evenly between the
 * inner and outer edge rather than d3-arc's radius-aware arc-length version —
 * visually equivalent, exact string parity was not a goal there. Every other
 * case here (line curves, plain arcs, full circles, pie
 * angle allocation) is pinned against fixtures captured from real d3-shape —
 * see `chart-shape.dom.test.ts`.
 */

/** Line interpolation: straight, one of three step variants, or monotone cubic. */
export type CurveType = "linear" | "step" | "step-before" | "step-after" | "monotone";

/** A data point in local plot-pixel space. `y: null` marks a gap (missing data). */
export interface Point {
  x: number;
  y: number | null;
}

interface XY {
  x: number;
  y: number;
}

/**
 * Round a coordinate to `digits` fractional digits (3 by default, matching
 * d3-shape), mapping a non-finite input and `-0` to `0`. The canonical rounding
 * for everything the chart family emits into the DOM — path data here, and mark
 * coordinates in each `chart-*.ts` series module — so no series has to keep its
 * own copy in step with this one.
 */
export function round(n: number, digits = 3): number {
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** digits;
  const r = Math.round(n * factor) / factor;
  return r === 0 ? 0 : r; // never emit "-0"
}

function fmt(n: number): string {
  return String(round(n));
}

/** A plotted (non-null) point, carrying its position in the original point list — which is what an area's per-point baseline is indexed by, so a gap never shifts the baseline out from under the points that follow it. */
interface Vertex extends XY {
  index: number;
}

/** How a `y: null` gap is treated: `break` starts a new subpath, `connect` skips the gap and joins its neighbours. */
export type GapPolicy = "break" | "connect";

/** Split `points` into contiguous runs of non-null values. With `connect`, gaps are skipped instead of breaking the line into separate segments. Empty runs are never emitted. */
function segments(points: readonly Point[], gaps: GapPolicy): Vertex[][] {
  const result: Vertex[][] = [];
  let current: Vertex[] = [];
  for (const [index, p] of points.entries()) {
    if (p.y === null) {
      if (gaps === "break" && current.length > 0) {
        result.push(current);
        current = [];
      }
      continue;
    }
    current.push({ x: p.x, y: p.y, index });
  }
  if (current.length > 0) result.push(current);
  return result;
}

/** `x,y` path coordinates, rounded. */
function coords(x: number, y: number): string {
  return `${fmt(x)},${fmt(y)}`;
}

/** Path fragment for the segment from `prev` to `cur` (after the shared move-to). */
type PairEmitter = (prev: XY, cur: XY) => string;

const emitLinear: PairEmitter = (_prev, cur) => `L${coords(cur.x, cur.y)}`;
const emitStep: PairEmitter = (prev, cur) => {
  const mid = (prev.x + cur.x) / 2;
  return `L${coords(mid, prev.y)}L${coords(mid, cur.y)}`;
};
const emitStepBefore: PairEmitter = (prev, cur) =>
  `L${coords(prev.x, cur.y)}L${coords(cur.x, cur.y)}`;
const emitStepAfter: PairEmitter = (prev, cur) =>
  `L${coords(cur.x, prev.y)}L${coords(cur.x, cur.y)}`;

/** A path fragment starting at `M` at the first point, then `emit` for each consecutive pair; empty for no points. */
function polyline(points: readonly XY[], emit: PairEmitter): string {
  const [first, ...rest] = points;
  if (!first) return "";
  let d = `M${coords(first.x, first.y)}`;
  let prev = first;
  for (const cur of rest) {
    d += emit(prev, cur);
    prev = cur;
  }
  return d;
}

/** `sign(x)`, with `sign(0) === 0` (matches d3-shape's monotone helper). */
function sign(x: number): number {
  return x < 0 ? -1 : x > 0 ? 1 : 0;
}

/**
 * The Fritsch–Carlson tangent for the interior point `b` between `a` and `c`:
 * zero at local extrema, otherwise a slope clamped to never overshoot either
 * secant — the property that makes `monotoneX` never produce a curve that dips
 * below/above its data points.
 */
function slope3(a: XY, b: XY, c: XY): number {
  const h0 = b.x - a.x;
  const h1 = c.x - b.x;
  const s0 = h0 !== 0 ? (b.y - a.y) / h0 : 0;
  const s1 = h1 !== 0 ? (c.y - b.y) / h1 : 0;
  const p = h0 + h1 !== 0 ? (s0 * h1 + s1 * h0) / (h0 + h1) : 0;
  return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
}

/** The one-sided tangent at end point `a`, given its neighbor `b` and the already-fixed tangent `t` at `b`. */
function slope2(a: XY, b: XY, t: number): number {
  const h = b.x - a.x;
  return h !== 0 ? (3 * (b.y - a.y)) / h / 2 - t / 2 : t;
}

/** Cubic Bézier from `p0` (tangent `t0`) to `p1` (tangent `t1`). */
function bezierSegment(p0: XY, t0: number, p1: XY, t1: number): string {
  const dx = (p1.x - p0.x) / 3;
  return `C${coords(p0.x + dx, p0.y + dx * t0)},${coords(p1.x - dx, p1.y - dx * t1)},${coords(p1.x, p1.y)}`;
}

/** Monotone cubic interpolation (`curveMonotoneX`) — falls back to a straight line under 3 points, where no curvature is defined. */
function curveMonotone(points: readonly XY[]): string {
  const [first, second] = points;
  const last = points.at(-1);
  const beforeLast = points.at(-2);
  if (points.length < 3 || !first || !second || !last || !beforeLast) {
    return polyline(points, emitLinear);
  }

  const tangents: number[] = Array.from({ length: points.length }, () => 0);
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1];
    const b = points[i];
    const c = points[i + 1];
    if (a && b && c) tangents[i] = slope3(a, b, c);
  }
  const end = points.length - 1;
  tangents[0] = slope2(first, second, tangents[1] ?? 0);
  tangents[end] = slope2(last, beforeLast, tangents[end - 1] ?? 0);

  let d = `M${coords(first.x, first.y)}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    if (p0 && p1) d += bezierSegment(p0, tangents[i - 1] ?? 0, p1, tangents[i] ?? 0);
  }
  return d;
}

function renderCurve(points: readonly XY[], curve: CurveType): string {
  switch (curve) {
    case "step": {
      const last = points.at(-1);
      const body = polyline(points, emitStep);
      return last && points.length > 1 ? `${body}L${coords(last.x, last.y)}` : body;
    }
    case "step-before":
      return polyline(points, emitStepBefore);
    case "step-after":
      return polyline(points, emitStepAfter);
    case "monotone":
      return curveMonotone(points);
    default:
      return polyline(points, emitLinear);
  }
}

/** A line path through `points`, in local plot-pixel space. Breaks into separate subpaths at `y: null` gaps unless `gaps` is `connect`. */
export function linePath(
  points: readonly Point[],
  curve: CurveType = "linear",
  gaps: GapPolicy = "break",
): string {
  return segments(points, gaps)
    .map((seg) => renderCurve(seg, curve))
    .join("");
}

/**
 * A filled area between `points` (the top edge, drawn with `curve`) and a
 * baseline `y0` (a constant, or one value per point — e.g. a stacked series'
 * lower edge).
 *
 * The baseline is traced back through **every** point of the segment, in
 * reverse, exactly as d3-shape's `area` does — not closed off with a single
 * straight line between the two ends. A stacked area's lower edge *is* the
 * upper edge of the series beneath it, so only a per-point baseline follows
 * it; collapsing it to one line makes every stacked band but the first one
 * the wrong shape. Each baseline value is looked up by the point's index in
 * the original (pre-split) list, so a `null` gap earlier in the series does
 * not shift the baseline under the points after it. The baseline itself is
 * drawn with straight segments rather than `curve` — matching d3-shape's
 * curved-baseline option is unnecessary here.
 */
export function areaPath(
  points: readonly Point[],
  y0: number | ReadonlyArray<number>,
  curve: CurveType = "linear",
  gaps: GapPolicy = "break",
): string {
  const baseline = (i: number) => (Array.isArray(y0) ? (y0[i] ?? 0) : y0);
  return segments(points, gaps)
    .map((seg) => {
      let d = renderCurve(seg, curve);
      for (const vertex of [...seg].reverse()) {
        d += `L${coords(vertex.x, baseline(vertex.index))}`;
      }
      return `${d}Z`;
    })
    .join("");
}

// ---------------------------------------------------------------------------
// arcs — annular sectors (pie/donut slices, gauges).
// ---------------------------------------------------------------------------

const TWO_PI = Math.PI * 2;
const EPSILON = 1e-6;

/** Geometry of an annular sector for {@link arcPath}. */
export interface ArcParams {
  innerRadius: number;
  outerRadius: number;
  /** Radians, 0 at 12 o'clock, increasing clockwise (matches d3-shape/SVG's y-down plane). */
  startAngle: number;
  endAngle: number;
  /** Angular gap between adjacent slices, split evenly between both edges (see the module note on the `padAngle` simplification). */
  padAngle?: number;
  cx?: number;
  cy?: number;
}

function arcPoint(angle: number, r: number, cx: number, cy: number): XY {
  return { x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle) };
}

/** `rx,ry` radii pair (always circular here), rounded. */
function radii(r: number): string {
  return coords(r, r);
}

/** An annular-sector path (a pie/donut slice, or a full ring for a 360° span). `cornerRadius` is not yet implemented. */
export function arcPath(params: ArcParams): string {
  const cx = params.cx ?? 0;
  const cy = params.cy ?? 0;
  const r0 = Math.min(params.innerRadius, params.outerRadius);
  const r1 = Math.max(params.innerRadius, params.outerRadius);
  const at = (angle: number, r: number) => {
    const p = arcPoint(angle, r, cx, cy);
    return coords(p.x, p.y);
  };

  let a0 = params.startAngle;
  let a1 = params.endAngle;
  if (a1 < a0) [a0, a1] = [a1, a0];
  const span = a1 - a0;

  const pad = params.padAngle ?? 0;
  if (pad > 0 && span > pad) {
    const half = pad / 2;
    a0 += half;
    a1 -= half;
  }

  if (span >= TWO_PI - EPSILON) {
    const mid = a0 + Math.PI;
    let d =
      `M${at(a0, r1)}` + `A${radii(r1)},0,1,1,${at(mid, r1)}` + `A${radii(r1)},0,1,1,${at(a1, r1)}`;
    if (r0 > 0) {
      d +=
        `M${at(a0, r0)}` +
        `A${radii(r0)},0,1,0,${at(mid, r0)}` +
        `A${radii(r0)},0,1,0,${at(a1, r0)}`;
    }
    return `${d}Z`;
  }

  const largeArc = a1 - a0 >= Math.PI ? 1 : 0;
  let d = `M${at(a0, r1)}A${radii(r1)},0,${largeArc},1,${at(a1, r1)}`;
  if (r0 > 0) {
    d += `L${at(a1, r0)}A${radii(r0)},0,${largeArc},0,${at(a0, r0)}`;
  } else {
    d += `L${coords(cx, cy)}`;
  }
  return `${d}Z`;
}

// ---------------------------------------------------------------------------
// pie angle allocation
// ---------------------------------------------------------------------------

/** One allocated pie slice: its source index, value and angular span. */
export interface PieSlice {
  /** Index into the original (pre-sort) `values` array. */
  index: number;
  value: number;
  startAngle: number;
  endAngle: number;
  padAngle: number;
}

/** Options for {@link pieAngles}. */
export interface PieOptions {
  startAngle?: number;
  endAngle?: number;
  padAngle?: number;
  /** Traverse slices by descending value (like d3's default) instead of data order. Default `false` — chart legends/order should follow authored data order unless asked otherwise. */
  sort?: boolean;
}

/**
 * Allocate each value a proportional angular span across `[startAngle,
 * endAngle]` (default a full circle). Negative values get zero angle (a pie
 * slice can't have negative area). `padAngle` is *not* baked into the spans
 * here — matching d3-shape, it is only recorded per slice for {@link arcPath}
 * to apply as an inset when rendering.
 */
export function pieAngles(values: readonly number[], options: PieOptions = {}): PieSlice[] {
  const start = options.startAngle ?? 0;
  const end = options.endAngle ?? start + TWO_PI;
  const padAngle = options.padAngle ?? 0;
  const span = end - start;

  const order = values.map((_, i) => i);
  if (options.sort) order.sort((a, b) => (values[b] ?? 0) - (values[a] ?? 0));

  const total = order.reduce((sum, i) => sum + Math.max(0, values[i] ?? 0), 0);

  let cursor = start;
  return order.map((i) => {
    const value = values[i] ?? 0;
    const angle = total > 0 ? (Math.max(0, value) / total) * span : 0;
    const slice: PieSlice = {
      index: i,
      value,
      startAngle: cursor,
      endAngle: cursor + angle,
      padAngle,
    };
    cursor += angle;
    return slice;
  });
}
