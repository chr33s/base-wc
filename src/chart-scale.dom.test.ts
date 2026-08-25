// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import {
  bandScale,
  createScale,
  isDiscreteScale,
  linearScale,
  linearTicks,
  logScale,
  niceLinearDomain,
  pointScale,
  sqrtScale,
  timeScale,
} from "./chart-scale.ts";

// Expected values below were captured from real d3-scale / d3-array
// (ISC © Mike Bostock) — see chart-scale.ts's own module doc for the port note.
// This pins the from-scratch reimplementation's behavior, not its source.

describe("linearTicks", () => {
  it("matches d3-array ticks(0, 100, 10)", () => {
    expect(linearTicks(0, 100, 10)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });
  it("matches d3-array ticks(0, 1, 5)", () => {
    expect(linearTicks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });
  it("matches d3-array ticks(-10, 10, 5)", () => {
    expect(linearTicks(-10, 10, 5)).toEqual([-10, -5, 0, 5, 10]);
  });
  it("matches d3-array ticks(0, 132, 6)", () => {
    expect(linearTicks(0, 132, 6)).toEqual([0, 20, 40, 60, 80, 100, 120]);
  });
  it("returns a single tick for a degenerate domain", () => {
    expect(linearTicks(1, 1, 5)).toEqual([1]);
  });
  it("matches d3-array ticks(0, 7, 5)", () => {
    expect(linearTicks(0, 7, 5)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("niceLinearDomain", () => {
  it("matches d3 scaleLinear().nice(6)", () => {
    expect(niceLinearDomain(0.13, 132.4, 6)).toEqual([0, 140]);
  });
  it("matches d3 scaleLinear().nice(10) for a domain crossing zero", () => {
    expect(niceLinearDomain(-3, 97, 10)).toEqual([-10, 100]);
  });
});

describe("linearScale", () => {
  it("maps and inverts like d3 scaleLinear", () => {
    const s = linearScale([0, 100], [0, 300]);
    expect(s(0)).toBe(0);
    expect(s(25)).toBe(75);
    expect(s(50)).toBe(150);
    expect(s(100)).toBe(300);
    expect(s.invert(150)).toBe(50);
    expect(s.bandwidth()).toBe(0);
    expect(s.domain()).toEqual([0, 100]);
    expect(s.range()).toEqual([0, 300]);
  });
});

describe("bandScale", () => {
  it("matches d3 scaleBand with padding", () => {
    const s = bandScale(["a", "b", "c", "d"], [0, 400], { paddingInner: 0.1, paddingOuter: 0.1 });
    expect(s.step()).toBeCloseTo(97.5609756097561);
    expect(s.bandwidth()).toBeCloseTo(87.8048780487805);
    expect(s("a")).toBeCloseTo(9.756097560975604);
    expect(s("b")).toBeCloseTo(107.3170731707317);
    expect(s("c")).toBeCloseTo(204.8780487804878);
    expect(s("d")).toBeCloseTo(302.4390243902439);
  });

  it("matches d3 scaleBand with no padding", () => {
    const s = bandScale(["Jan", "Feb", "Mar"], [0, 300]);
    expect(s.bandwidth()).toBe(100);
    expect(s.step()).toBe(100);
    expect(s("Jan")).toBe(0);
    expect(s("Feb")).toBe(100);
    expect(s("Mar")).toBe(200);
  });

  it("returns undefined for a value outside the domain", () => {
    const s = bandScale(["a", "b"], [0, 100]);
    expect(s("z")).toBeUndefined();
  });

  it("inverts a position back to its category", () => {
    const s = bandScale(["a", "b", "c"], [0, 300]);
    expect(s.invert(10)).toBe("a");
    expect(s.invert(150)).toBe("b");
    expect(s.invert(299)).toBe("c");
    expect(s.invert(-5)).toBeUndefined();
    expect(s.invert(305)).toBeUndefined();
  });

  it("centers a value at start + bandwidth / 2", () => {
    const s = bandScale(["a", "b"], [0, 200]);
    expect(s.center("a")).toBe(50);
    expect(s.center("b")).toBe(150);
  });
});

describe("bandScale: Date domains", () => {
  it("looks a Date up by its instant, not by object identity (d3's InternMap behaviour)", () => {
    const jan1 = new Date(2026, 0, 1);
    const jan2 = new Date(2026, 0, 2);
    const scale = bandScale([jan1, jan2], [0, 200]);
    // A second Date object for the same moment — what parsing two <time>
    // cells produces — must resolve to the same band, not to nothing.
    expect(scale(new Date(2026, 0, 1))).toBe(scale(jan1));
    expect(scale(new Date(2026, 0, 2))).toBe(scale(jan2));
    expect(scale(new Date(2026, 0, 3))).toBeUndefined();
  });
});

describe("pointScale", () => {
  it("matches d3 scalePoint with padding", () => {
    const s = pointScale(["a", "b", "c", "d"], [0, 300], { padding: 0.5 });
    expect(s.step()).toBe(75);
    expect(s.bandwidth()).toBe(0);
    expect(s("a")).toBe(37.5);
    expect(s("b")).toBe(112.5);
    expect(s("c")).toBe(187.5);
    expect(s("d")).toBe(262.5);
  });

  it("defaults to zero padding when unauthored, unlike createScale's own default", () => {
    const s = pointScale(["a", "b"], [0, 200]);
    expect(s("a")).toBe(0);
    expect(s("b")).toBe(200);
  });
});

describe("createScale: point axis padding", () => {
  it("regression: a point axis honours the same paddingOuter a band axis gets, not zero", () => {
    // `axisScale` (chart-domain.ts) only ever passes `{paddingInner,
    // paddingOuter}` — the shape band axes use — regardless of scale type.
    // `pointScale` reads `options.padding` specifically, so a point axis used
    // to silently get zero outer padding: its end categories sat exactly on
    // the plot's own pixel edges (and, combined with the band-rect centering
    // bug, spilled a hit rect half a step past them).
    const bandLike = { paddingInner: 0.3, paddingOuter: 0.15 };
    const viaCreateScale = createScale("point", ["a", "b", "c"], [0, 300], bandLike);
    if (!isDiscreteScale(viaCreateScale)) throw new Error("expected a point scale");
    const viaExplicitPadding = pointScale(["a", "b", "c"], [0, 300], { padding: 0.15 });
    expect(viaCreateScale("a")).toBe(viaExplicitPadding("a"));
    expect(viaCreateScale("a")).toBeGreaterThan(0); // inset from the edge, not on it
  });
});

describe("logScale", () => {
  it("matches d3 scaleLog for a base-10 domain", () => {
    const s = logScale([1, 1000], [0, 300]);
    expect(s(1)).toBeCloseTo(0);
    expect(s(10)).toBeCloseTo(100);
    expect(s(100)).toBeCloseTo(200);
    expect(s(1000)).toBeCloseTo(300);
  });

  it("matches d3 scaleLog ticks for a 3-decade domain", () => {
    const s = logScale([1, 1000], [0, 300]);
    expect(s.ticks()).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 600,
      700, 800, 900, 1000,
    ]);
  });
});

describe("sqrtScale", () => {
  it("matches d3 scaleSqrt", () => {
    const s = sqrtScale([0, 100], [0, 200]);
    expect(s(0)).toBeCloseTo(0);
    expect(s(25)).toBeCloseTo(100);
    expect(s(100)).toBeCloseTo(200);
  });
});

describe("timeScale", () => {
  it("maps endpoints like d3 scaleTime", () => {
    const d0 = new Date(2026, 0, 1).getTime();
    const d1 = new Date(2026, 11, 31).getTime();
    const s = timeScale([d0, d1], [0, 1200]);
    expect(s(d0)).toBe(0);
    expect(s(d1)).toBe(1200);
  });

  it("produces calendar-aligned monthly ticks over a year, matching d3 scaleTime.ticks(6)", () => {
    const d0 = new Date(2026, 0, 1).getTime();
    const d1 = new Date(2026, 11, 31).getTime();
    const s = timeScale([d0, d1], [0, 1200]);
    expect(s.ticks(6)).toEqual([
      new Date(2026, 0, 1).getTime(),
      new Date(2026, 3, 1).getTime(),
      new Date(2026, 6, 1).getTime(),
      new Date(2026, 9, 1).getTime(),
    ]);
  });

  it("produces hourly-scale ticks over a single day, matching d3 scaleTime.ticks(6)", () => {
    const d0 = new Date(2026, 0, 1, 0, 0, 0).getTime();
    const d1 = new Date(2026, 0, 2, 0, 0, 0).getTime();
    const s = timeScale([d0, d1], [0, 480]);
    expect(s.ticks(6)).toEqual([
      new Date(2026, 0, 1, 0).getTime(),
      new Date(2026, 0, 1, 3).getTime(),
      new Date(2026, 0, 1, 6).getTime(),
      new Date(2026, 0, 1, 9).getTime(),
      new Date(2026, 0, 1, 12).getTime(),
      new Date(2026, 0, 1, 15).getTime(),
      new Date(2026, 0, 1, 18).getTime(),
      new Date(2026, 0, 1, 21).getTime(),
      new Date(2026, 0, 2, 0).getTime(),
    ]);
  });
});
