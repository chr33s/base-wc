// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { arcPath, areaPath, linePath, pieAngles } from "./chart-shape.ts";

// Expected path strings/angles below were captured from real d3-shape
// (ISC © Mike Bostock) — see chart-shape.ts's own module doc for the port note.
// This pins the from-scratch reimplementation's behavior, not its source.

const PTS = [
  { x: 0, y: 100 },
  { x: 50, y: 20 },
  { x: 100, y: 80 },
  { x: 150, y: 40 },
];

describe("linePath", () => {
  it("matches d3-shape line() (curveLinear)", () => {
    expect(linePath(PTS, "linear")).toBe("M0,100L50,20L100,80L150,40");
  });

  it("matches d3-shape line().curve(curveMonotoneX)", () => {
    expect(linePath(PTS, "monotone")).toBe(
      "M0,100C16.667,60,33.333,20,50,20C66.667,20,83.333,80,100,80C116.667,80,133.333,60,150,40",
    );
  });

  it("matches d3-shape line().curve(curveStep)", () => {
    expect(linePath(PTS, "step")).toBe("M0,100L25,100L25,20L75,20L75,80L125,80L125,40L150,40");
  });

  it("matches d3-shape line().curve(curveStepBefore)", () => {
    expect(linePath(PTS, "step-before")).toBe("M0,100L0,20L50,20L50,80L100,80L100,40L150,40");
  });

  it("matches d3-shape line().curve(curveStepAfter)", () => {
    expect(linePath(PTS, "step-after")).toBe("M0,100L50,100L50,20L100,20L100,80L150,80L150,40");
  });

  it("breaks into separate subpaths at a null gap by default", () => {
    const withGap = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: null },
      { x: 30, y: 30 },
    ];
    expect(linePath(withGap, "linear")).toBe("M0,0L10,10M30,30");
  });

  it("skips the gap and connects across it when connectNulls is set", () => {
    const withGap = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: null },
      { x: 30, y: 30 },
    ];
    expect(linePath(withGap, "linear", true)).toBe("M0,0L10,10L30,30");
  });

  it("falls back to a straight line for monotone under 3 points", () => {
    expect(linePath([PTS[0]!, PTS[1]!], "monotone")).toBe("M0,100L50,20");
  });
});

describe("areaPath", () => {
  it("matches d3-shape area() with a constant baseline", () => {
    const pts = [
      { x: 0, y: 20 },
      { x: 50, y: 40 },
      { x: 100, y: 10 },
    ];
    expect(areaPath(pts, 100, "linear")).toBe("M0,20L50,40L100,10L100,100L0,100Z");
  });
});

describe("arcPath", () => {
  it("matches d3-shape arc() for a half-circle pie slice (no inner radius)", () => {
    expect(arcPath({ innerRadius: 0, outerRadius: 100, startAngle: 0, endAngle: Math.PI })).toBe(
      "M0,-100A100,100,0,1,1,0,100L0,0Z",
    );
  });

  it("matches d3-shape arc() for a donut slice spanning more than a half-circle", () => {
    expect(
      arcPath({ innerRadius: 50, outerRadius: 100, startAngle: 0, endAngle: Math.PI * 1.5 }),
    ).toBe("M0,-100A100,100,0,1,1,-100,0L-50,0A50,50,0,1,0,0,-50Z");
  });

  it("matches d3-shape arc() for a full-circle ring, split into two half-arcs", () => {
    expect(
      arcPath({ innerRadius: 30, outerRadius: 80, startAngle: 0, endAngle: Math.PI * 2 }),
    ).toBe("M0,-80A80,80,0,1,1,0,80A80,80,0,1,1,0,-80M0,-30A30,30,0,1,0,0,30A30,30,0,1,0,0,-30Z");
  });

  it("insets both edges by padAngle / 2 (a simplification of d3-arc's radius-aware version)", () => {
    const d = arcPath({
      innerRadius: 40,
      outerRadius: 90,
      startAngle: 0.2,
      endAngle: 1.1,
      padAngle: 0.02,
    });
    // Not pixel-identical to d3-arc's arc-length-based padding (see module
    // note); assert the padded start point sits close to d3's own result
    // rather than requiring exact string parity.
    expect(d.startsWith("M18.")).toBe(true);
    expect(d).toContain("A90,90,0,0,1,");
  });
});

describe("pieAngles", () => {
  it("matches d3.pie()(values) in data order by default", () => {
    const slices = pieAngles([10, 20, 30, 40]);
    expect(slices.map((s) => [s.index, s.startAngle, s.endAngle])).toEqual([
      [0, 0, 0.6283185307179586],
      [1, 0.6283185307179586, 1.8849555921538759],
      [2, 1.8849555921538759, 3.7699111843077517],
      [3, 3.7699111843077517, 6.283185307179586],
    ]);
  });

  it("matches d3.pie() sorted descending by value when sort is requested", () => {
    const slices = pieAngles([10, 20, 30, 40], { sort: true });
    expect(slices.map((s) => [s.index, s.value, s.startAngle, s.endAngle])).toEqual([
      [3, 40, 0, 2.5132741228718345],
      [2, 30, 2.5132741228718345, 4.39822971502571],
      [1, 20, 4.39822971502571, 5.654866776461628],
      [0, 10, 5.654866776461628, 6.283185307179586],
    ]);
  });

  it("carries padAngle through per slice without shrinking the allocated span", () => {
    const slices = pieAngles([1, 1, 1], { padAngle: 0.05 });
    expect(slices.every((s) => s.padAngle === 0.05)).toBe(true);
    expect(slices[0]!.startAngle).toBe(0);
    expect(slices[0]!.endAngle).toBeCloseTo(2.0943951023931953, 12);
    expect(slices[1]!.startAngle).toBeCloseTo(2.0943951023931953, 12);
    expect(slices[1]!.endAngle).toBeCloseTo(4.1887902047863905, 12);
    expect(slices[2]!.startAngle).toBeCloseTo(4.1887902047863905, 12);
    // The cumulative final boundary can land a ULP off a fresh `2π` due to
    // summation order — not a real discrepancy from d3's own output.
    expect(slices[2]!.endAngle).toBeCloseTo(Math.PI * 2, 12);
  });

  it("gives a zero-value slice zero angular width", () => {
    const slices = pieAngles([10, 0, 10]);
    expect(slices[1]!.startAngle).toBe(slices[1]!.endAngle);
  });
});
