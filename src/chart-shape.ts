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

/** Split `points` into contiguous runs of non-null values. With `connectNulls`, gaps are skipped instead of breaking the line into separate segments. */
function segments(points: readonly Point[], connectNulls: boolean): XY[][] {
  if (connectNulls) {
    const run = points.filter((p): p is { x: number; y: number } => p.y !== null);
    return run.length > 0 ? [run] : [];
  }
  const result: XY[][] = [];
  let current: XY[] = [];
  for (const p of points) {
    if (p.y === null) {
      if (current.length > 0) result.push(current);
      current = [];
    } else {
      current.push({ x: p.x, y: p.y });
    }
  }
  if (current.length > 0) result.push(current);
  return result;
}

// ---------------------------------------------------------------------------
// curve renderers — each takes >= 1 point and returns a path fragment
// starting with "M"; `linePath`/`areaPath` handle the null-gap segmentation.
// ---------------------------------------------------------------------------

function curveLinear(points: readonly XY[]): string {
  let d = `M${fmt(points[0]!.x)},${fmt(points[0]!.y)}`;
  for (let i = 1; i < points.length; i++) d += `L${fmt(points[i]!.x)},${fmt(points[i]!.y)}`;
  return d;
}

function curveStep(points: readonly XY[]): string {
  let d = `M${fmt(points[0]!.x)},${fmt(points[0]!.y)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const mid = (prev.x + cur.x) / 2;
    d += `L${fmt(mid)},${fmt(prev.y)}L${fmt(mid)},${fmt(cur.y)}`;
  }
  const last = points[points.length - 1]!;
  return points.length > 1 ? `${d}L${fmt(last.x)},${fmt(last.y)}` : d;
}

function curveStepBefore(points: readonly XY[]): string {
  let d = `M${fmt(points[0]!.x)},${fmt(points[0]!.y)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    d += `L${fmt(prev.x)},${fmt(cur.y)}L${fmt(cur.x)},${fmt(cur.y)}`;
  }
  return d;
}

function curveStepAfter(points: readonly XY[]): string {
  let d = `M${fmt(points[0]!.x)},${fmt(points[0]!.y)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    d += `L${fmt(cur.x)},${fmt(prev.y)}L${fmt(cur.x)},${fmt(cur.y)}`;
  }
  return d;
}

/** `sign(x)`, with `sign(0) === 0` (matches d3-shape's monotone helper). */
function sign(x: number): number {
  return x < 0 ? -1 : x > 0 ? 1 : 0;
}

/**
 * The Fritsch–Carlson tangent for the interior point between `(x0,y0)` and
 * `(x2,y2)` via `(x1,y1)`: zero at local extrema, otherwise a slope clamped to
 * never overshoot either secant — the property that makes `monotoneX` never
 * produce a curve that dips below/above its data points.
 */
function slope3(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): number {
  const h0 = x1 - x0;
  const h1 = x2 - x1;
  const s0 = h0 !== 0 ? (y1 - y0) / h0 : 0;
  const s1 = h1 !== 0 ? (y2 - y1) / h1 : 0;
  const p = h0 + h1 !== 0 ? (s0 * h1 + s1 * h0) / (h0 + h1) : 0;
  return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
}

/** The one-sided tangent at an end point, given the already-fixed tangent `t` at its neighbor. */
function slope2(x0: number, y0: number, x1: number, y1: number, t: number): number {
  const h = x1 - x0;
  return h !== 0 ? (3 * (y1 - y0)) / h / 2 - t / 2 : t;
}

function bezierSegment(
  x0: number,
  y0: number,
  t0: number,
  x1: number,
  y1: number,
  t1: number,
): string {
  const dx = (x1 - x0) / 3;
  const c1x = x0 + dx;
  const c1y = y0 + dx * t0;
  const c2x = x1 - dx;
  const c2y = y1 - dx * t1;
  return `C${fmt(c1x)},${fmt(c1y)},${fmt(c2x)},${fmt(c2y)},${fmt(x1)},${fmt(y1)}`;
}

/** Monotone cubic interpolation (`curveMonotoneX`) — falls back to a straight line under 3 points, where no curvature is defined. */
function curveMonotone(points: readonly XY[]): string {
  if (points.length < 3) return curveLinear(points);

  const tangents: number[] = Array.from({ length: points.length }, () => 0);
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const c = points[i + 1]!;
    tangents[i] = slope3(a.x, a.y, b.x, b.y, c.x, c.y);
  }
  tangents[0] = slope2(points[0]!.x, points[0]!.y, points[1]!.x, points[1]!.y, tangents[1]!);
  const last = points.length - 1;
  tangents[last] = slope2(
    points[last - 1]!.x,
    points[last - 1]!.y,
    points[last]!.x,
    points[last]!.y,
    tangents[last - 1]!,
  );

  let d = `M${fmt(points[0]!.x)},${fmt(points[0]!.y)}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1]!;
    const p1 = points[i]!;
    d += bezierSegment(p0.x, p0.y, tangents[i - 1]!, p1.x, p1.y, tangents[i]!);
  }
  return d;
}

function renderCurve(points: readonly XY[], curve: CurveType): string {
  switch (curve) {
    case "step":
      return curveStep(points);
    case "step-before":
      return curveStepBefore(points);
    case "step-after":
      return curveStepAfter(points);
    case "monotone":
      return curveMonotone(points);
    default:
      return curveLinear(points);
  }
}

/** A line path through `points`, in local plot-pixel space. Breaks into separate subpaths at `y: null` gaps unless `connectNulls`. */
export function linePath(
  points: readonly Point[],
  curve: CurveType = "linear",
  connectNulls = false,
): string {
  return segments(points, connectNulls)
    .filter((seg) => seg.length > 0)
    .map((seg) => renderCurve(seg, curve))
    .join("");
}

/**
 * A filled area between `points` (the top edge, drawn with `curve`) and a
 * baseline `y0` (a constant, or one value per point — e.g. a stacked series'
 * lower edge). The baseline is always drawn as straight segments: matching
 * d3-shape's curved baseline is unnecessary for the flat/near-flat baselines
 * MIT-scope stacked/area charts use, and this keeps the generator simple.
 */
export function areaPath(
  points: readonly Point[],
  y0: number | ReadonlyArray<number>,
  curve: CurveType = "linear",
  connectNulls = false,
): string {
  const baseline = (i: number) => (Array.isArray(y0) ? (y0[i] ?? 0) : y0);
  return segments(points, connectNulls)
    .filter((seg) => seg.length > 0)
    .map((seg) => {
      const top = renderCurve(seg, curve);
      const last = seg[seg.length - 1]!;
      const first = seg[0]!;
      // Baseline y for each point in this segment, indexed by its position in
      // the original (pre-split) point list would require carrying indices
      // through `segments()`; areas over a gappy dataset are rare enough in
      // MIT-scope charts that per-segment (not global) indexing is an
      // acceptable simplification — the constant-`y0` case (by far the common
      // one) is unaffected either way.
      const lastBase = Array.isArray(y0) ? baseline(seg.length - 1) : y0;
      const firstBase = Array.isArray(y0) ? baseline(0) : y0;
      return `${top}L${fmt(last.x)},${fmt(lastBase)}L${fmt(first.x)},${fmt(firstBase)}Z`;
    })
    .join("");
}

// ---------------------------------------------------------------------------
// arcs — annular sectors (pie/donut slices, gauges).
// ---------------------------------------------------------------------------

const TWO_PI = Math.PI * 2;
const EPSILON = 1e-6;

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

function arcPoint(angle: number, r: number, cx: number, cy: number): [number, number] {
  return [cx + r * Math.sin(angle), cy - r * Math.cos(angle)];
}

/** An annular-sector path (a pie/donut slice, or a full ring for a 360° span). `cornerRadius` is not yet implemented. */
export function arcPath(params: ArcParams): string {
  const cx = params.cx ?? 0;
  const cy = params.cy ?? 0;
  const r0 = Math.min(params.innerRadius, params.outerRadius);
  const r1 = Math.max(params.innerRadius, params.outerRadius);

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
    const [ox0x, ox0y] = arcPoint(a0, r1, cx, cy);
    const [oxMx, oxMy] = arcPoint(mid, r1, cx, cy);
    const [ox1x, ox1y] = arcPoint(a1, r1, cx, cy);
    let d =
      `M${fmt(ox0x)},${fmt(ox0y)}` +
      `A${fmt(r1)},${fmt(r1)},0,1,1,${fmt(oxMx)},${fmt(oxMy)}` +
      `A${fmt(r1)},${fmt(r1)},0,1,1,${fmt(ox1x)},${fmt(ox1y)}`;
    if (r0 > 0) {
      const [ix0x, ix0y] = arcPoint(a0, r0, cx, cy);
      const [ixMx, ixMy] = arcPoint(mid, r0, cx, cy);
      const [ix1x, ix1y] = arcPoint(a1, r0, cx, cy);
      d +=
        `M${fmt(ix0x)},${fmt(ix0y)}` +
        `A${fmt(r0)},${fmt(r0)},0,1,0,${fmt(ixMx)},${fmt(ixMy)}` +
        `A${fmt(r0)},${fmt(r0)},0,1,0,${fmt(ix1x)},${fmt(ix1y)}`;
    }
    return `${d}Z`;
  }

  const largeArc = a1 - a0 >= Math.PI ? 1 : 0;
  const [ox0x, ox0y] = arcPoint(a0, r1, cx, cy);
  const [ox1x, ox1y] = arcPoint(a1, r1, cx, cy);
  let d = `M${fmt(ox0x)},${fmt(ox0y)}A${fmt(r1)},${fmt(r1)},0,${largeArc},1,${fmt(ox1x)},${fmt(ox1y)}`;
  if (r0 > 0) {
    const [ix1x, ix1y] = arcPoint(a1, r0, cx, cy);
    const [ix0x, ix0y] = arcPoint(a0, r0, cx, cy);
    d += `L${fmt(ix1x)},${fmt(ix1y)}A${fmt(r0)},${fmt(r0)},0,${largeArc},0,${fmt(ix0x)},${fmt(ix0y)}`;
  } else {
    d += `L${fmt(cx)},${fmt(cy)}`;
  }
  return `${d}Z`;
}

// ---------------------------------------------------------------------------
// pie angle allocation
// ---------------------------------------------------------------------------

export interface PieSlice {
  /** Index into the original (pre-sort) `values` array. */
  index: number;
  value: number;
  startAngle: number;
  endAngle: number;
  padAngle: number;
}

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
  if (options.sort) order.sort((a, b) => values[b]! - values[a]!);

  const total = order.reduce((sum, i) => sum + Math.max(0, values[i]!), 0);

  let cursor = start;
  return order.map((i) => {
    const value = values[i]!;
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
