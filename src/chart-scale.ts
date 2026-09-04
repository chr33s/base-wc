/**
 * Scale + tick kernel for the `ui-chart` family. `@chr33s/base-wc` ships zero
 * runtime dependencies, so this is a **from-scratch reimplementation** of the
 * d3-scale/d3-array subset `@mui/x-charts` needs — not a vendored copy — the
 * same call MUI itself made for its `scaleBand`/`scalePoint`. Continuous scales
 * (`linear`/`log`/`sqrt`/`time`) and discrete scales (`band`/`point`) share the
 * {@link Scale} call/`invert`/`ticks`/`domain`/`range`/`bandwidth` surface so
 * `chart-core.ts` can treat either kind uniformly. Every function here is pure
 * and side-effect-free; behaviour is pinned against fixtures captured from real
 * d3-scale/d3-array (ISC © Mike Bostock) — see `chart-scale.dom.test.ts`.
 */
import { clamp } from "./math.ts";

export type ScaleType = "band" | "point" | "linear" | "log" | "sqrt" | "time";

/** A value a discrete (band/point) domain can hold: one non-null dataset cell. `chart-core.ts`'s `ChartValue` is this plus `null` (a null cell never enters a domain — looking one up simply misses). */
export type CategoryValue = string | number | Date;

/** A continuous numeric scale (linear/log/sqrt/time — time uses ms timestamps as its domain). */
export interface ContinuousScale {
  (value: number): number;
  invert(position: number): number;
  ticks(count?: number): number[];
  domain(): readonly [number, number];
  range(): readonly [number, number];
  /** Always 0 — continuous scales have no per-value width. */
  bandwidth(): number;
}

/** A discrete scale over an ordered list of category values (band/point). */
export interface DiscreteScale {
  /** The start (band) or center (point) position for `value`, or `undefined` if it is not in the domain (`null` — a missing cell — always misses). */
  (value: CategoryValue | null): number | undefined;
  /** The center position for `value` — the start plus half the bandwidth for `band`, same as calling the scale itself for `point`. */
  center(value: CategoryValue | null): number | undefined;
  /** The domain value whose band/step contains `position` — `undefined` outside the range. */
  invert(position: number): CategoryValue | undefined;
  /** Equal to `domain()` — ticks are just the categories. */
  ticks(): readonly CategoryValue[];
  domain(): readonly CategoryValue[];
  range(): readonly [number, number];
  bandwidth(): number;
  /** Distance between the start of consecutive bands/points. */
  step(): number;
}

export type Scale = ContinuousScale | DiscreteScale;

/** Whether `scale` is a discrete (band/point) scale rather than a continuous one. */
export function isDiscreteScale(scale: Scale): scale is DiscreteScale {
  return "step" in scale;
}

// ---------------------------------------------------------------------------
// ticks() — the "nice numbers" algorithm shared by d3-array's ticks/tickIncrement.
// ---------------------------------------------------------------------------

const E10 = Math.sqrt(50);
const E5 = Math.sqrt(10);
const E2 = Math.sqrt(2);

/** The step between ticks that best divides `[start, stop]` into ~`count` nice steps. */
function tickIncrement(start: number, stop: number, count: number) {
  const step = (stop - start) / Math.max(0, count);
  const power = Math.floor(Math.log10(step));
  const error = step / 10 ** power;
  const factor = error >= E10 ? 10 : error >= E5 ? 5 : error >= E2 ? 2 : 1;
  return power >= 0 ? factor * 10 ** power : -(10 ** -power) / factor;
}

/** Evenly-spaced "nice" tick values covering `[start, stop]` (inclusive), targeting `count` ticks. */
export function linearTicks(start: number, stop: number, count = 10) {
  if (start === stop) return [start];
  const reverse = stop < start;
  const [lo, hi] = reverse ? [stop, start] : [start, stop];
  const step = tickIncrement(lo, hi, count);
  if (step === 0 || !Number.isFinite(step)) return [];

  let result: number[];
  if (step > 0) {
    const from = Math.ceil(lo / step);
    const to = Math.floor(hi / step);
    const n = to - from + 1;
    result = Array.from({ length: n }, (_, i) => (from + i) * step);
  } else {
    // Sub-unit step: multiply through to avoid float error, matching d3-array.
    const from = Math.ceil(lo * -step);
    const to = Math.floor(hi * -step);
    const n = to - from + 1;
    result = Array.from({ length: n }, (_, i) => (from + i) / -step);
  }
  return reverse ? result.reverse() : result;
}

/** Round `[d0, d1]` outward to the nearest tick boundaries for `count` ticks. */
export function niceLinearDomain(d0: number, d1: number, count = 10): [number, number] {
  if (d0 === d1) return [d0, d1];
  let lo = d0;
  let hi = d1;
  const reverse = hi < lo;
  if (reverse) [lo, hi] = [hi, lo];

  let step = tickIncrement(lo, hi, count);
  for (let i = 0; i < 2 && Number.isFinite(step) && step > 0; i++) {
    const next = tickIncrement(Math.floor(lo / step) * step, Math.ceil(hi / step) * step, count);
    if (next === step) break;
    step = next;
  }
  if (!Number.isFinite(step) || step === 0) return reverse ? [hi, lo] : [lo, hi];
  const niceLo = Math.floor(lo / step) * step;
  const niceHi = Math.ceil(hi / step) * step;
  return reverse ? [niceHi, niceLo] : [niceLo, niceHi];
}

// ---------------------------------------------------------------------------
// continuous scales
// ---------------------------------------------------------------------------

function makeContinuous(
  domain: readonly [number, number],
  range: readonly [number, number],
  forward: (v: number) => number,
  inverse: (v: number) => number,
  ticksFn: (d0: number, d1: number, count: number) => number[],
) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const t0 = forward(d0);
  const t1 = forward(d1);
  const m = t1 === t0 ? 0 : (r1 - r0) / (t1 - t0);

  const scale = ((value: number) => r0 + (forward(value) - t0) * m) as ContinuousScale;
  scale.invert = (position: number) => inverse(m === 0 ? t0 : t0 + (position - r0) / m);
  scale.domain = () => [d0, d1];
  scale.range = () => [r0, r1];
  scale.bandwidth = () => 0;
  scale.ticks = (count = 10) => ticksFn(d0, d1, count);
  return scale;
}

/** A linear scale: `domain` and `range` are each `[min, max]` in value/pixel space. */
export function linearScale(domain: readonly [number, number], range: readonly [number, number]) {
  return makeContinuous(
    domain,
    range,
    (v) => v,
    (v) => v,
    linearTicks,
  );
}

/** A power scale (used for `sqrt`, `exponent = 0.5`); signed to support domains that cross zero. */
export function powScale(
  domain: readonly [number, number],
  range: readonly [number, number],
  exponent: number,
) {
  const forward = (v: number) => Math.sign(v) * Math.abs(v) ** exponent;
  const inverse = (v: number) => Math.sign(v) * Math.abs(v) ** (1 / exponent);
  return makeContinuous(domain, range, forward, inverse, linearTicks);
}

/** `sqrt` is `pow` with `exponent = 0.5` (d3-scale's default power scale). */
export function sqrtScale(domain: readonly [number, number], range: readonly [number, number]) {
  return powScale(domain, range, 0.5);
}

/** Powers of `base` (default 10) covering `[d0, d1]`, refined with 1/2/5 steps when there are few decades — matches d3-scale's log-ticks behaviour closely enough for axis labeling. */
function logTicks(d0: number, d1: number, base = 10) {
  const sign = d0 < 0 ? -1 : 1;
  const lo = Math.min(sign * d0, sign * d1);
  const hi = Math.max(sign * d0, sign * d1);
  if (lo <= 0) return [];
  const i0 = Math.floor(Math.log(lo) / Math.log(base));
  const i1 = Math.ceil(Math.log(hi) / Math.log(base));
  const decades = i1 - i0;
  const multiples = decades > 4 ? [1] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const result: number[] = [];
  for (let i = i0; i <= i1; i++) {
    for (const k of multiples) {
      const v = sign * k * base ** i;
      if (sign * v >= lo && sign * v <= hi) result.push(v);
    }
  }
  return sign > 0 ? result : result.reverse();
}

/** A log scale (base 10 by default). `domain` must not straddle zero — both bounds share a sign. */
export function logScale(
  domain: readonly [number, number],
  range: readonly [number, number],
  base = 10,
) {
  const sign = domain[0] < 0 ? -1 : 1;
  const forward = (v: number) => (sign * Math.log(sign * v)) / Math.log(base);
  const inverse = (v: number) => sign * base ** (sign * v);
  return makeContinuous(domain, range, forward, inverse, (d0, d1) => logTicks(d0, d1, base));
}

// ---------------------------------------------------------------------------
// time scale — calendar-aware tick intervals, local time.
// ---------------------------------------------------------------------------

interface TimeInterval {
  ms: number;
  floor(date: Date): Date;
  step(date: Date, k: number): Date;
}

function atStartOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const second: TimeInterval = {
  ms: SECOND,
  floor: (d) => new Date(Math.floor(d.getTime() / SECOND) * SECOND),
  step: (d, k) => new Date(d.getTime() + k * SECOND),
};
const minute: TimeInterval = {
  ms: MINUTE,
  floor: (d) => new Date(Math.floor(d.getTime() / MINUTE) * MINUTE),
  step: (d, k) => new Date(d.getTime() + k * MINUTE),
};
const hour: TimeInterval = {
  ms: HOUR,
  floor: (d) => new Date(Math.floor(d.getTime() / HOUR) * HOUR),
  step: (d, k) => new Date(d.getTime() + k * HOUR),
};
const day: TimeInterval = {
  ms: DAY,
  floor: atStartOfDay,
  step: (d, k) => {
    const next = atStartOfDay(d);
    next.setDate(next.getDate() + k);
    return next;
  },
};
const week: TimeInterval = {
  ms: DAY * 7,
  floor: (d) => {
    const start = atStartOfDay(d);
    start.setDate(start.getDate() - start.getDay());
    return start;
  },
  step: (d, k) => {
    const next = week.floor(d);
    next.setDate(next.getDate() + k * 7);
    return next;
  },
};
const month: TimeInterval = {
  ms: DAY * 30,
  floor: (d) => new Date(d.getFullYear(), d.getMonth(), 1),
  step: (d, k) => {
    const next = new Date(d.getFullYear(), d.getMonth(), 1);
    next.setMonth(next.getMonth() + k);
    return next;
  },
};
const year: TimeInterval = {
  ms: DAY * 365,
  floor: (d) => new Date(d.getFullYear(), 0, 1),
  step: (d, k) => new Date(d.getFullYear() + k, 0, 1),
};

// Candidate (interval, multiplier, idealized average duration) steps, ascending
// by duration. `chooseInterval` mirrors d3-time's `tickInterval`: it bisects
// this table for `target` and picks whichever *neighboring* candidate is
// proportionally closer (by ratio, not absolute distance) — which is why, e.g.,
// a 4h target step picks 3h (9 ticks/day) over 6h (5 ticks/day): 4/3 < 6/4.
const DURATION_YEAR = DAY * 365.25;
const DURATION_MONTH = DURATION_YEAR / 12;
const TIME_STEPS: ReadonlyArray<readonly [TimeInterval, number, number]> = [
  [second, 1, SECOND],
  [second, 5, 5 * SECOND],
  [second, 15, 15 * SECOND],
  [second, 30, 30 * SECOND],
  [minute, 1, MINUTE],
  [minute, 5, 5 * MINUTE],
  [minute, 15, 15 * MINUTE],
  [minute, 30, 30 * MINUTE],
  [hour, 1, HOUR],
  [hour, 3, 3 * HOUR],
  [hour, 6, 6 * HOUR],
  [hour, 12, 12 * HOUR],
  [day, 1, DAY],
  [day, 2, 2 * DAY],
  [week, 1, DAY * 7],
  [month, 1, DURATION_MONTH],
  [month, 3, 3 * DURATION_MONTH],
  [year, 1, DURATION_YEAR],
];

function chooseInterval(target: number): [TimeInterval, number] {
  let i = 0;
  while (i < TIME_STEPS.length && TIME_STEPS[i]![2] <= target) i++;
  if (i === TIME_STEPS.length) {
    const last = TIME_STEPS[TIME_STEPS.length - 1]!;
    return [last[0], Math.max(1, Math.round(target / DURATION_YEAR))];
  }
  if (i === 0) return [second, 1];
  const below = TIME_STEPS[i - 1]!;
  const above = TIME_STEPS[i]!;
  const chooseBelow = target / below[2] < above[2] / target;
  const chosen = chooseBelow ? below : above;
  return [chosen[0], chosen[1]];
}

function timeTicks(d0: number, d1: number, count = 10) {
  if (d1 < d0) [d0, d1] = [d1, d0];
  const target = (d1 - d0) / Math.max(1, count);
  const [interval, k] = chooseInterval(target);

  const start = interval.floor(new Date(d0));
  const result: number[] = [];
  let cursor = start.getTime() < d0 ? interval.step(start, k) : start;
  let guard = 0;
  while (cursor.getTime() <= d1 && guard++ < 1000) {
    if (cursor.getTime() >= d0) result.push(cursor.getTime());
    cursor = interval.step(cursor, k);
  }
  return result;
}

/** A time scale: `domain` is `[startMs, endMs]` (local time), `ticks()` returns calendar-aware timestamps. */
export function timeScale(domain: readonly [number, number], range: readonly [number, number]) {
  return makeContinuous(
    domain,
    range,
    (v) => v,
    (v) => v,
    timeTicks,
  );
}

// ---------------------------------------------------------------------------
// discrete scales — band / point
// ---------------------------------------------------------------------------

/**
 * The primitive a category is identified by, the way d3's `InternMap` keys one:
 * a `Date` by its instant, everything else by itself. Two `Date` cells for the
 * same moment are therefore the same category even though they are different
 * objects — which is exactly what a dataset parsed out of `<time>` elements
 * produces. Every part of the chart family that groups or looks up categories
 * goes through this, so they all agree on what "the same category" means.
 */
export function categoryKey(value: CategoryValue) {
  return value instanceof Date ? value.getTime() : value;
}

/**
 * The evenly-spaced-slot machinery shared by `band` and `point`: a value's
 * integer slot (by {@link categoryKey}, O(1) and immune to two equal `Date`s
 * being different objects), and the pixel position of slot `i`. Both scales
 * differ only in how `step`/`start`/`bandwidth` are derived from padding —
 * see `bandScale`/`pointScale`.
 */
function discreteLookup(domain: readonly CategoryValue[], start: number, step: number) {
  const index = new Map<string | number, number>();
  domain.forEach((value, i) => {
    const key = categoryKey(value);
    if (!index.has(key)) index.set(key, i);
  });
  return {
    indexOf: (value: CategoryValue | null) =>
      value === null ? -1 : (index.get(categoryKey(value)) ?? -1),
    positionAt: (i: number) => start + step * i,
  };
}

/** `scaleBand`: an evenly-sized slot per domain value, with inner/outer padding as a fraction of one step. */
export function bandScale(
  domain: readonly CategoryValue[],
  range: readonly [number, number],
  options: { paddingInner?: number; paddingOuter?: number } = {},
) {
  const paddingInner = clampPadding(options.paddingInner ?? 0);
  const paddingOuter = clampPadding(options.paddingOuter ?? 0);
  const [r0, r1] = range;
  const n = domain.length;
  const span = r1 - r0;
  const step = n > 0 ? span / Math.max(1, n - paddingInner + 2 * paddingOuter) : 0;
  const start = r0 + step * paddingOuter;
  const bandwidth = step * (1 - paddingInner);

  const { indexOf, positionAt } = discreteLookup(domain, start, step);

  const scale = ((value: CategoryValue | null) => {
    const i = indexOf(value);
    return i < 0 ? undefined : positionAt(i);
  }) as DiscreteScale;
  scale.center = (value: CategoryValue | null) => {
    const p = scale(value);
    return p === undefined ? undefined : p + bandwidth / 2;
  };
  scale.invert = (position: number) => {
    if (step <= 0 || n === 0) return undefined;
    const i = Math.floor((position - start) / step);
    return i >= 0 && i < n ? domain[i] : undefined;
  };
  scale.ticks = () => domain;
  scale.domain = () => domain;
  scale.range = () => [r0, r1];
  scale.bandwidth = () => Math.max(0, bandwidth);
  scale.step = () => step;
  return scale;
}

/** `scalePoint`: like `band` with `bandwidth() === 0` — each value maps to a single point, `padding` on both outer edges (as a fraction of one step). */
export function pointScale(
  domain: readonly CategoryValue[],
  range: readonly [number, number],
  options: { padding?: number } = {},
) {
  const padding = clampPadding(options.padding ?? 0);
  const [r0, r1] = range;
  const n = domain.length;
  const span = r1 - r0;
  const step = n > 0 ? span / Math.max(1, n - 1 + 2 * padding) : 0;
  const start = r0 + step * padding;

  const { indexOf, positionAt } = discreteLookup(domain, start, step);

  const scale = ((value: CategoryValue | null) => {
    const i = indexOf(value);
    return i < 0 ? undefined : positionAt(i);
  }) as DiscreteScale;
  scale.center = scale;
  scale.invert = (position: number) => {
    if (step <= 0 || n === 0) return undefined;
    const i = Math.round((position - start) / step);
    return i >= 0 && i < n ? domain[i] : undefined;
  };
  scale.ticks = () => domain;
  scale.domain = () => domain;
  scale.range = () => [r0, r1];
  scale.bandwidth = () => 0;
  scale.step = () => step;
  return scale;
}

function clampPadding(p: number) {
  return clamp(p, 0, 1);
}

/** The continuous member of {@link ScaleType} — everything but the discrete `band`/`point`. */
export type ContinuousScaleType = Exclude<ScaleType, "band" | "point">;

/**
 * Build the continuous scale for `type` over a numeric `[min, max]` domain.
 * Properly typed — a caller that has already ruled out `band`/`point` (as
 * `chart-domain.ts`'s `axisScale` does) dispatches here once, with no
 * `domain as [number, number]` casts.
 */
export function continuousScale(
  type: ContinuousScaleType,
  domain: readonly [number, number],
  range: readonly [number, number],
) {
  switch (type) {
    case "log":
      return logScale(domain, range);
    case "sqrt":
      return sqrtScale(domain, range);
    case "time":
      return timeScale(domain, range);
    default:
      return linearScale(domain, range);
  }
}

/**
 * Build the scale for any `scaleType`, given its resolved domain and pixel
 * range — the union-typed convenience wrapper over `bandScale`/`pointScale`/
 * {@link continuousScale} for a caller that carries the discriminator around
 * (the chart family itself branches on it and calls the typed constructors
 * directly instead). `paddingOuter` doubles as `point`'s own `padding` when
 * the caller doesn't distinguish them — a point axis otherwise defaults to
 * zero outer padding and its end categories sit exactly on the plot's pixel
 * edges.
 */
export function createScale(
  type: ScaleType,
  domain: readonly CategoryValue[] | readonly [number, number],
  range: readonly [number, number],
  options: { paddingInner?: number; paddingOuter?: number; padding?: number } = {},
) {
  switch (type) {
    case "band":
      return bandScale(domain, range, options);
    case "point":
      return pointScale(domain, range, { padding: options.padding ?? options.paddingOuter });
    default:
      return continuousScale(type, domain as readonly [number, number], range);
  }
}
