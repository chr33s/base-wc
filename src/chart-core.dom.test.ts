// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test";
import type { ChartInvalidation } from "./chart-core.ts";
import {
  ChartStore,
  getSeriesType,
  isMarkFaded,
  isMarkHighlighted,
  isSeriesFaded,
  isSeriesHighlighted,
  mergeExtent,
  numericExtent,
  parseTable,
  registerSeriesType,
  stackSeries,
  toNumeric,
} from "./chart-core.ts";
import { must } from "./test-utils.ts";

const ITEM_GLOBAL = { highlight: "item", fade: "global" } as const;

function tableFrom(html: string) {
  document.body.innerHTML = html;
  return must(document.querySelector("table"));
}

describe("parseTable", () => {
  it("reads header cells as keys and coerces numeric text", () => {
    const table = tableFrom(`
      <table>
        <thead><tr><th>Month</th><th>Revenue</th></tr></thead>
        <tbody>
          <tr><td>Jan</td><td>120</td></tr>
          <tr><td>Feb</td><td>132</td></tr>
        </tbody>
      </table>
    `);
    expect(parseTable(table)).toEqual([
      { Month: "Jan", Revenue: 120 },
      { Month: "Feb", Revenue: 132 },
    ]);
  });

  it("prefers a data-value override over the cell text/time", () => {
    const table = tableFrom(`
      <table>
        <thead><tr><th>Month</th><th>Revenue</th></tr></thead>
        <tbody>
          <tr><td>Jan</td><td data-value="1400">$1,400</td></tr>
        </tbody>
      </table>
    `);
    expect(parseTable(table)[0]).toEqual({ Month: "Jan", Revenue: 1400 });
  });

  it("reads a <time datetime> cell as a Date", () => {
    const table = tableFrom(`
      <table>
        <thead><tr><th>Day</th><th>Count</th></tr></thead>
        <tbody>
          <tr><td><time datetime="2026-01-01">Jan 1</time></td><td>3</td></tr>
        </tbody>
      </table>
    `);
    const rows = parseTable(table);
    expect(must(rows[0]).Day).toBeInstanceOf(Date);
    // A bare `YYYY-MM-DD` is the calendar day the author wrote, read at *local*
    // midnight — `new Date("2026-01-01")` would be UTC midnight, which reads
    // back as 31 December anywhere west of UTC and sits a timezone offset away
    // from the local-time ticks meant to label it.
    const day = must(rows[0]).Day as Date;
    expect([day.getFullYear(), day.getMonth(), day.getDate()]).toEqual([2026, 0, 1]);
    expect(day.getHours()).toBe(0);
    expect(day.toLocaleDateString()).toBe(new Date(2026, 0, 1).toLocaleDateString());
  });

  it("keeps a datetime that carries its own time as the instant it names", () => {
    const table = tableFrom(`
      <table>
        <thead><tr><th>Day</th><th>Count</th></tr></thead>
        <tbody>
          <tr><td><time datetime="2026-01-01T12:30:00Z">noon</time></td><td>3</td></tr>
        </tbody>
      </table>
    `);
    expect((must(parseTable(table)[0]).Day as Date).getTime()).toBe(
      new Date("2026-01-01T12:30:00Z").getTime(),
    );
  });

  it("reads a null for an empty cell", () => {
    const table = tableFrom(`
      <table>
        <thead><tr><th>Month</th><th>Revenue</th></tr></thead>
        <tbody><tr><td>Jan</td><td></td></tr></tbody>
      </table>
    `);
    expect(must(parseTable(table)[0]).Revenue).toBeNull();
  });

  it("works without an explicit thead (first row is the header)", () => {
    const table = tableFrom(`
      <table>
        <tbody>
          <tr><td>Month</td><td>Revenue</td></tr>
          <tr><td>Jan</td><td>120</td></tr>
        </tbody>
      </table>
    `);
    expect(parseTable(table)).toEqual([{ Month: "Jan", Revenue: 120 }]);
  });

  it("returns an empty array for a table with no rows", () => {
    const table = tableFrom(`<table></table>`);
    expect(parseTable(table)).toEqual([]);
  });
});

describe("toNumeric", () => {
  it("coerces numbers, dates (epoch ms), and numeric strings", () => {
    expect(toNumeric(5)).toBe(5);
    expect(toNumeric(new Date(2026, 0, 1))).toBe(new Date(2026, 0, 1).getTime());
    expect(toNumeric("12")).toBe(12);
    expect(Number.isNaN(toNumeric(null))).toBe(true);
    expect(Number.isNaN(toNumeric("abc"))).toBe(true);
  });
});

describe("numericExtent / mergeExtent", () => {
  it("finds the min/max of a column, ignoring non-numeric rows", () => {
    expect(numericExtent([{ v: 5 }, { v: 20 }, { v: null }, { v: -3 }], "v")).toEqual([-3, 20]);
  });

  it("returns null when no row has a finite value", () => {
    expect(numericExtent([{ v: null }, { v: "x" }], "v")).toBeNull();
  });

  it("merges several extents, skipping nulls", () => {
    expect(mergeExtent([0, 10], [-5, 3], null)).toEqual([-5, 10]);
    expect(mergeExtent(null, null)).toBeNull();
  });
});

describe("stackSeries", () => {
  const data = [
    { a: 10, b: 5 },
    { a: 20, b: -3 },
    { a: 15, b: 8 },
  ];
  const series = [
    { key: "a", stack: "g" },
    { key: "b", stack: "g" },
  ];

  it("accumulates in series order under offset none, regardless of sign", () => {
    const stacked = stackSeries(data, series, "none");
    expect(stacked[0]).toEqual([
      { y0: 0, y1: 10 },
      { y0: 0, y1: 20 },
      { y0: 0, y1: 15 },
    ]);
    expect(stacked[1]).toEqual([
      { y0: 10, y1: 15 },
      { y0: 20, y1: 17 },
      { y0: 15, y1: 23 },
    ]);
  });

  it("splits mixed-sign values above/below zero under offset diverging", () => {
    const stacked = stackSeries(data, series, "diverging");
    expect(stacked[0]).toEqual([
      { y0: 0, y1: 10 },
      { y0: 0, y1: 20 },
      { y0: 0, y1: 15 },
    ]);
    expect(stacked[1]).toEqual([
      { y0: 10, y1: 15 },
      { y0: -3, y1: 0 },
      { y0: 15, y1: 23 },
    ]);
  });

  it("never combines series with no stack id, or with different stack ids", () => {
    const unstacked = stackSeries(data, [{ key: "a" }, { key: "b" }], "none");
    expect(unstacked[0]).toEqual([
      { y0: 0, y1: 10 },
      { y0: 0, y1: 20 },
      { y0: 0, y1: 15 },
    ]);
    // b is independent — its own base-zero run, not stacked on top of a.
    expect(unstacked[1]).toEqual([
      { y0: 0, y1: 5 },
      { y0: 0, y1: -3 },
      { y0: 0, y1: 8 },
    ]);

    const differentStacks = stackSeries(
      data,
      [
        { key: "a", stack: "x" },
        { key: "b", stack: "y" },
      ],
      "none",
    );
    expect(differentStacks[1]).toEqual([
      { y0: 0, y1: 5 },
      { y0: 0, y1: -3 },
      { y0: 0, y1: 8 },
    ]);
  });

  it("keeps two series over the SAME column apart, positionally", () => {
    // Regression: results used to be keyed by column name, so a bar and a
    // line plotting `a` (the canonical combo chart) shared one entry — and
    // two unstacked series over `a` silently stacked on each other.
    const sameColumn = stackSeries(data, [{ key: "a" }, { key: "a" }], "none");
    expect(sameColumn.length).toBe(2);
    expect(sameColumn[0]).toEqual(sameColumn[1]);
    expect(sameColumn[1]).toEqual([
      { y0: 0, y1: 10 },
      { y0: 0, y1: 20 },
      { y0: 0, y1: 15 },
    ]);

    // Sharing an explicit stack id still stacks them, same column or not.
    const sameColumnStacked = stackSeries(
      data,
      [
        { key: "a", stack: "g" },
        { key: "a", stack: "g" },
      ],
      "none",
    );
    expect(sameColumnStacked[1]).toEqual([
      { y0: 10, y1: 20 },
      { y0: 20, y1: 40 },
      { y0: 15, y1: 30 },
    ]);
  });
});

describe("ChartStore", () => {
  it("notifies subscribers synchronously with the invalidation kind, until unsubscribed", () => {
    const store = new ChartStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.state.width = 10;
    store.notify("size");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("size");
    expect(store.state.width).toBe(10);
    unsubscribe();
    store.notify("size");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("hands each listener the kind of change — `ui-chart` handles highlight synchronously and batches the rest; `ui-chart-legend` rebuilds on registry", () => {
    const store = new ChartStore();
    const kinds: ChartInvalidation[] = [];
    store.subscribe((kind) => kinds.push(kind));

    store.state.highlight = { index: 2, series: null };
    store.notify("highlight");
    store.notify("registry");

    expect(kinds).toEqual(["highlight", "registry"]);
    expect(store.state.highlight.index).toBe(2);
  });

  it("starts with sane empty defaults", () => {
    const store = new ChartStore();
    expect(store.state).toEqual({
      data: [],
      width: 0,
      height: 0,
      axes: [],
      series: [],
      highlight: { index: null, series: null },
    });
  });
});

describe("highlight resolution", () => {
  const seriesA = document.createElement("ui-chart-bar" as never);
  const seriesB = document.createElement("ui-chart-bar" as never);

  it("isMarkHighlighted: axis-wide highlight matches the index across every series", () => {
    const h = { index: 1, series: null };
    expect(isMarkHighlighted(h, ITEM_GLOBAL, seriesA, 1)).toBe(true);
    expect(isMarkHighlighted(h, ITEM_GLOBAL, seriesB, 1)).toBe(true);
    expect(isMarkHighlighted(h, ITEM_GLOBAL, seriesA, 0)).toBe(false);
  });

  it("isMarkHighlighted: a specific series+index highlights only that exact mark", () => {
    const h = { index: 2, series: seriesA };
    expect(isMarkHighlighted(h, ITEM_GLOBAL, seriesA, 2)).toBe(true);
    expect(isMarkHighlighted(h, ITEM_GLOBAL, seriesA, 0)).toBe(false);
    expect(isMarkHighlighted(h, ITEM_GLOBAL, seriesB, 2)).toBe(false);
  });

  it("isMarkHighlighted: a series with no index (legend hover) highlights the whole series", () => {
    const h = { index: null, series: seriesA };
    expect(isMarkHighlighted(h, ITEM_GLOBAL, seriesA, 0)).toBe(true);
    expect(isMarkHighlighted(h, ITEM_GLOBAL, seriesA, 5)).toBe(true);
    expect(isMarkHighlighted(h, ITEM_GLOBAL, seriesB, 0)).toBe(false);
  });

  it('isMarkHighlighted: scope "series" highlights every mark once its series is active, regardless of index', () => {
    const scope = { highlight: "series", fade: "global" } as const;
    const h = { index: 2, series: seriesA };
    expect(isMarkHighlighted(h, scope, seriesA, 0)).toBe(true);
    expect(isMarkHighlighted(h, scope, seriesA, 7)).toBe(true);
    expect(isMarkHighlighted(h, scope, seriesB, 2)).toBe(false);
  });

  it('isMarkHighlighted: scope "none" never highlights, even the exact hovered mark', () => {
    const scope = { highlight: "none", fade: "global" } as const;
    expect(isMarkHighlighted({ index: 1, series: seriesA }, scope, seriesA, 1)).toBe(false);
    expect(isMarkHighlighted({ index: null, series: seriesA }, scope, seriesA, 0)).toBe(false);
  });

  it("isSeriesHighlighted: true whenever this series is the active one, item- or series-scoped alike", () => {
    expect(isSeriesHighlighted({ index: 1, series: seriesA }, ITEM_GLOBAL, seriesA)).toBe(true);
    expect(isSeriesHighlighted({ index: null, series: seriesA }, ITEM_GLOBAL, seriesA)).toBe(true);
    expect(isSeriesHighlighted({ index: 1, series: seriesA }, ITEM_GLOBAL, seriesB)).toBe(false);
    expect(isSeriesHighlighted({ index: null, series: null }, ITEM_GLOBAL, seriesA)).toBe(false);
  });

  it('isSeriesHighlighted: scope "none" opts a series out even while it is the active one', () => {
    const scope = { highlight: "none", fade: "global" } as const;
    expect(isSeriesHighlighted({ index: null, series: seriesA }, scope, seriesA)).toBe(false);
  });

  it("isMarkFaded: nothing fades while nothing is active", () => {
    const h = { index: null, series: null };
    expect(isMarkFaded(h, ITEM_GLOBAL, seriesA, 0)).toBe(false);
  });

  it("isMarkFaded: global fade dims every non-highlighted mark", () => {
    const h = { index: 1, series: seriesA };
    expect(isMarkFaded(h, { highlight: "item", fade: "global" }, seriesA, 1)).toBe(false); // the highlighted one
    expect(isMarkFaded(h, { highlight: "item", fade: "global" }, seriesA, 0)).toBe(true);
    expect(isMarkFaded(h, { highlight: "item", fade: "global" }, seriesB, 1)).toBe(true);
  });

  it("isMarkFaded: series fade dims only a different series, not other indices in the same one", () => {
    const h = { index: null, series: seriesA };
    expect(isMarkFaded(h, { highlight: "series", fade: "series" }, seriesA, 3)).toBe(false);
    expect(isMarkFaded(h, { highlight: "series", fade: "series" }, seriesB, 0)).toBe(true);
  });

  it("isMarkFaded: series fade dims nothing during an axis-wide (series-less) highlight", () => {
    const h = { index: 2, series: null };
    expect(isMarkFaded(h, { highlight: "item", fade: "series" }, seriesA, 0)).toBe(false);
    expect(isMarkFaded(h, { highlight: "item", fade: "series" }, seriesB, 2)).toBe(false);
  });

  it("isMarkFaded: fade none never dims anything", () => {
    const h = { index: 1, series: seriesA };
    expect(isMarkFaded(h, { highlight: "item", fade: "none" }, seriesB, 0)).toBe(false);
  });

  it("isSeriesFaded: dims a whole series only when some other series is exclusively active", () => {
    const h = { index: null, series: seriesA };
    expect(isSeriesFaded(h, ITEM_GLOBAL, seriesA)).toBe(false); // the active one
    expect(isSeriesFaded(h, ITEM_GLOBAL, seriesB)).toBe(true);
  });

  it("isSeriesFaded: nothing fades during an axis-wide (series-less) highlight, or fade none", () => {
    expect(isSeriesFaded({ index: 2, series: null }, ITEM_GLOBAL, seriesA)).toBe(false);
    expect(
      isSeriesFaded({ index: null, series: seriesA }, { highlight: "item", fade: "none" }, seriesB),
    ).toBe(false);
  });
});

describe("series-type registry", () => {
  it("registers and looks up a series type definition", () => {
    const definition = {
      type: "test-series",
      stacks: false,
      getExtremum: () => null,
      computeMarks: () => [],
    };
    registerSeriesType(definition);
    expect(getSeriesType("test-series")).toBe(definition);
  });

  it("returns undefined for an unregistered type", () => {
    expect(getSeriesType("does-not-exist")).toBeUndefined();
  });
});
