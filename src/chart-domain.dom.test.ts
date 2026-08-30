// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import type { AxisRegistration, ChartRow, SeriesRegistration, StackedValue } from "./chart-core.ts";
import { numericExtent, registerSeriesType } from "./chart-core.ts";
import { axisScale, categoricalDomain, categoryRows, seriesExtremum } from "./chart-domain.ts";
import { isDiscreteScale } from "./chart-scale.ts";

// A minimal registered type so `seriesExtremum`/`axisScale` can resolve one
// without depending on a real chart-*.ts module — mirrors chart.dom.test.ts's
// own `fake-bar` fixture.
registerSeriesType({
  type: "fake-domain-series",
  stacks: true,
  getExtremum: (data, series, dim) => (dim === "x" ? null : numericExtent(data, series.key)),
  computeMarks: () => [],
});

function series(key: string, overrides: Partial<SeriesRegistration> = {}): SeriesRegistration {
  return {
    element: document.createElement("div"),
    type: "fake-domain-series",
    key,
    highlightScope: { highlight: "item", fade: "global" },
    hidden: false,
    ...overrides,
  };
}

function axis(overrides: Partial<AxisRegistration> = {}): AxisRegistration {
  return {
    position: "bottom",
    scaleType: "linear",
    render: () => {},
    ...overrides,
  };
}

describe("categoricalDomain", () => {
  it("returns the distinct non-null values in first-seen order", () => {
    const data: ChartRow[] = [{ m: "Jan" }, { m: "Feb" }, { m: "Jan" }, { m: "Mar" }];
    expect(categoricalDomain(data, "m")).toEqual(["Jan", "Feb", "Mar"]);
  });

  it("skips null and undefined cells", () => {
    const data: ChartRow[] = [{ m: "Jan" }, { m: null }, {}];
    expect(categoricalDomain(data, "m")).toEqual(["Jan"]);
  });

  it("treats two Date objects for the same instant as one category, keeping the first object", () => {
    const first = new Date(2026, 0, 1);
    const second = new Date(2026, 0, 1); // equal instant, different object
    const data: ChartRow[] = [{ d: first }, { d: second }];
    const domain = categoricalDomain(data, "d");
    expect(domain.length).toBe(1);
    expect(domain[0]).toBe(first);
  });
});

describe("categoryRows", () => {
  const key = "m";

  it("maps each domain entry to the first data row carrying it", () => {
    const data: ChartRow[] = [{ m: "Jan" }, { m: "Feb" }, { m: "Jan" }];
    expect(categoryRows(data, key, ["Jan", "Feb"])).toEqual([0, 1]);
  });

  it("follows a category to wherever its first row actually is, not the domain's own slot", () => {
    // "Feb" is domain slot 1 but its first row is index 0 — the whole point of
    // this function is to report the row, not the slot.
    const data: ChartRow[] = [{ m: "Feb" }, { m: "Jan" }];
    expect(categoryRows(data, key, ["Jan", "Feb"])).toEqual([1, 0]);
  });

  it("matches Date categories by instant, across distinct objects", () => {
    const data: ChartRow[] = [{ d: new Date(2026, 0, 2) }, { d: new Date(2026, 0, 1) }];
    const domain = [new Date(2026, 0, 1), new Date(2026, 0, 2)]; // different objects, same instants
    expect(categoryRows(data, "d", domain)).toEqual([1, 0]);
  });

  it("skips null/undefined cells when looking for a category's first row", () => {
    const data: ChartRow[] = [{ m: null }, { m: "Jan" }];
    expect(categoryRows(data, key, ["Jan"])).toEqual([1]);
  });

  it("falls back to its own domain slot for a category with no matching row", () => {
    const data: ChartRow[] = [{ m: "Jan" }];
    expect(categoryRows(data, key, ["Jan", "Ghost"])).toEqual([0, 1]);
  });

  it("returns an empty array for an empty domain", () => {
    expect(categoryRows([{ m: "Jan" }], key, [])).toEqual([]);
  });
});

describe("seriesExtremum", () => {
  const data: ChartRow[] = [{ v: 10 }, { v: 30 }, { v: 20 }];

  it("delegates to the series type's own getExtremum when unstacked", () => {
    expect(seriesExtremum(series("v"), data, "y", undefined)).toEqual([10, 30]);
  });

  it("returns null for a dimension the type never contributes to (fake-domain-series' x)", () => {
    expect(seriesExtremum(series("v"), data, "x", undefined)).toBeNull();
  });

  it("returns null for an unregistered series type", () => {
    expect(
      seriesExtremum(series("v", { type: "does-not-exist" }), data, "y", undefined),
    ).toBeNull();
  });

  it("reports the stacked span (y0..y1), not the raw column, when stacked values are given", () => {
    const stacked: StackedValue[] = [
      { y0: 0, y1: 10 },
      { y0: 10, y1: 40 }, // 40 exceeds any raw value in `data`
      { y0: -5, y1: 10 }, // -5 exceeds any raw value in `data`
    ];
    expect(seriesExtremum(series("v"), data, "y", stacked)).toEqual([-5, 40]);
  });

  it("ignores `stacked` for the x dimension — a series never stacks along x", () => {
    const stacked: StackedValue[] = [{ y0: 0, y1: 999 }];
    // Falls through to the type's own getExtremum for "x", which is null here
    // regardless of what `stacked` says.
    expect(seriesExtremum(series("v"), data, "x", stacked)).toBeNull();
  });
});

describe("axisScale", () => {
  const common = { data: [] as ChartRow[], series: [], stacks: new Map() };

  it("builds a band/point scale from the axis's own key, ignoring series contributions", () => {
    const data: ChartRow[] = [{ m: "Jan" }, { m: "Feb" }];
    const scale = axisScale({
      ...common,
      axis: axis({ scaleType: "band", key: "m" }),
      data,
      range: [0, 100],
      dim: "x",
    });
    expect(isDiscreteScale(scale)).toBe(true);
    expect(isDiscreteScale(scale) && scale.domain()).toEqual(["Jan", "Feb"]);
  });

  it("aggregates a continuous domain from every contributing series when the axis has no key of its own", () => {
    const data: ChartRow[] = [{ a: 5, b: 50 }, { a: 15 }];
    const scale = axisScale({
      data,
      series: [series("a"), series("b")],
      stacks: new Map(),
      axis: axis({ scaleType: "linear" }),
      range: [0, 100],
      dim: "y",
    });
    // Raw union [5, 50] nice-domains outward (tickCount 6) — not the exact
    // extent — matching `chart.ts`'s own auto-aggregated axis behaviour.
    const [lo, hi] = scale.domain() as [number, number];
    expect(lo).toBeLessThanOrEqual(5);
    expect(hi).toBeGreaterThanOrEqual(50);
  });

  it("reads the domain straight from the axis's own key when one is given, skipping aggregation", () => {
    const data: ChartRow[] = [{ v: 100 }, { v: 200 }];
    const scale = axisScale({
      ...common,
      axis: axis({ scaleType: "linear", key: "v" }),
      data,
      range: [0, 100],
      dim: "y",
    });
    const [lo, hi] = scale.domain() as [number, number];
    expect(lo).toBeLessThanOrEqual(100);
    expect(hi).toBeGreaterThanOrEqual(200);
  });

  it("never rounds an explicit min/max outward — the consumer asked for exactly that range", () => {
    const scale = axisScale({
      ...common,
      axis: axis({ scaleType: "linear", min: 3, max: 97 }),
      data: [{ v: 1 }],
      range: [0, 100],
      dim: "y",
    });
    expect(scale.domain()).toEqual([3, 97]);
  });

  it("pins only the authored side of a min-only or max-only axis, deriving the other from the data", () => {
    const data: ChartRow[] = [{ v: 10 }, { v: 50 }];
    const minOnly = axisScale({
      ...common,
      axis: axis({ scaleType: "linear", key: "v", min: 0 }),
      data,
      range: [0, 100],
      dim: "y",
    });
    expect(minOnly.domain()[0]).toBe(0);

    const maxOnly = axisScale({
      ...common,
      axis: axis({ scaleType: "linear", key: "v", max: 200 }),
      data,
      range: [0, 100],
      dim: "y",
    });
    expect(maxOnly.domain()[1]).toBe(200);
  });

  it("widens a degenerate (single-value) domain so the value doesn't collapse to zero span", () => {
    const scale = axisScale({
      ...common,
      axis: axis({ scaleType: "linear", min: 5, max: 5 }),
      data: [],
      range: [0, 100],
      dim: "y",
    });
    const [lo, hi] = scale.domain() as [number, number];
    expect(lo).toBeLessThan(5);
    expect(hi).toBeGreaterThan(5);
  });

  it("widens a degenerate domain only on the side the consumer left open", () => {
    // A pinned bound wins over the data — widening past it would put the axis
    // somewhere the consumer explicitly ruled out.
    const minOnly = axisScale({
      ...common,
      axis: axis({ scaleType: "linear", min: 0 }),
      data: [{ Revenue: 0 }],
      range: [100, 0],
      dim: "y",
    });
    expect(minOnly.domain()).toEqual([0, 1]);

    const maxOnly = axisScale({
      ...common,
      axis: axis({ scaleType: "linear", max: 0 }),
      data: [{ Revenue: 0 }],
      range: [100, 0],
      dim: "y",
    });
    expect(maxOnly.domain()).toEqual([-1, 0]);
  });

  it("falls back to [0, 1] when nothing contributes any extent at all", () => {
    const scale = axisScale({
      ...common,
      axis: axis({ scaleType: "linear" }),
      data: [],
      range: [0, 100],
      dim: "y",
    });
    expect(scale.domain()).toEqual([0, 1]);
  });
});
