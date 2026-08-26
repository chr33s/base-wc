// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";
import type { MarkDescriptor, SeriesTypeDefinition } from "./chart-core.ts";
import { isNumberValue, numericExtent, registerSeriesType } from "./chart-core.ts";
import { isDiscreteScale, pointScale } from "./chart-scale.ts";
import "./chart.ts";
import "./chart-scatter.ts";
import type { UIChart, UIChartHighlightDetail } from "./chart.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

// A minimal fake series type so the container's contract is tested without
// depending on any real chart-type module (chart-bar.ts, …) — those register
// against this same API, so what passes here is what they can rely on.
beforeAll(() => {
  const fakeBar: SeriesTypeDefinition = {
    type: "fake-bar",
    stacks: false,
    // A real series type only returns null for a dimension it genuinely
    // doesn't contribute to (bar/line never plot against a continuous x); this
    // fake contributes whichever column fits the dimension — the same
    // xKey-vs-key selection scatter's own getExtremum makes, now that the
    // registration (not a pre-picked column) is what a type receives.
    getExtremum: (data, series, dim) =>
      numericExtent(data, dim === "x" ? (series.xKey ?? series.key) : series.key),
    computeMarks: (context) => {
      const marks: MarkDescriptor[] = [];
      context.data.forEach((row, i) => {
        if (!context.xScale || !context.yScale) return;
        const raw = row[context.config.key];
        const value = isNumberValue(raw) ? raw : 0;
        marks.push({
          key: `${context.config.key}:${i}`,
          tag: "rect",
          part: "mark",
          index: i,
          attrs: { "data-value": String(value) },
        });
      });
      return marks;
    },
  };
  registerSeriesType(fakeBar);
});

// `ui-chart` wires via `connectLightDom` (a microtask, so a component can
// wait for late-authored light-DOM parts) and **batches its full renders**
// onto a microtask of their own — mounting K children paints once, and any
// mutation (a registration, an attribute edit, `setSeriesHidden`) defers its
// re-render the same way. A zero-delay macrotask drains all of it — wiring,
// registrations, observer deliveries, and the coalesced render — so tests
// assert on settled DOM. Highlight changes stay synchronous and need none of
// this.
function flush() {
  return new Promise((resolve) => setTimeout(resolve));
}

async function mountChart(inner: string, size = true) {
  document.body.innerHTML = `<ui-chart${size ? ' width="400" height="200"' : ""}>${inner}</ui-chart>`;
  await flush();
  return document.querySelector("ui-chart")!;
}

async function addFakeSeries(chart: UIChart, key = "Revenue") {
  const element = document.createElement("div");
  chart.append(element);
  const unregister = chart.registerSeries({
    element,
    type: "fake-bar",
    key,
    highlightScope: { highlight: "item", fade: "global" },
    hidden: false,
  });
  await flush();
  return { element, unregister };
}

/** Collect every `highlight` event's detail — the public read of the active highlight. */
function trackHighlights(chart: UIChart) {
  const events: UIChartHighlightDetail[] = [];
  chart.addEventListener("highlight", (e) =>
    events.push((e as CustomEvent<UIChartHighlightDetail>).detail),
  );
  return events;
}

const TABLE = `
  <table>
    <thead><tr><th>Month</th><th>Revenue</th></tr></thead>
    <tbody>
      <tr><td>Jan</td><td>120</td></tr>
      <tr><td>Feb</td><td>132</td></tr>
      <tr><td>Mar</td><td>101</td></tr>
    </tbody>
  </table>
`;

describe("ui-chart", () => {
  it("exposes role=figure and reads a label into aria-label", async () => {
    const chart = await mountChart("", false);
    expect(chart.getAttribute("role")).toBe("figure");
    chart.setAttribute("label", "Monthly revenue");
    expect(chart.getAttribute("aria-label")).toBe("Monthly revenue");
  });

  it("ingests the authored table into .data", async () => {
    const chart = await mountChart(TABLE);
    expect(chart.data).toEqual([
      { Month: "Jan", Revenue: 120 },
      { Month: "Feb", Revenue: 132 },
      { Month: "Mar", Revenue: 101 },
    ]);
  });

  it("accepts data set programmatically, overriding the table", async () => {
    const chart = await mountChart(TABLE);
    chart.data = [{ Month: "Apr", Revenue: 999 }];
    expect(chart.data).toEqual([{ Month: "Apr", Revenue: 999 }]);
  });

  it("reports data-state empty for no data and rendered once data exists", async () => {
    const empty = await mountChart("");
    expect(empty.getAttribute("data-state")).toBe("empty");
    const withData = await mountChart(TABLE);
    expect(withData.getAttribute("data-state")).toBe("rendered");
  });

  it("generates a single aria-hidden <svg> with grid/bands/series-root groups", async () => {
    const chart = await mountChart(TABLE);
    const svgs = chart.querySelectorAll("svg");
    expect(svgs.length).toBe(1);
    expect(svgs[0]!.getAttribute("aria-hidden")).toBe("true");
    expect(svgs[0]!.querySelector('[data-part="grid"]')).not.toBeNull();
    expect(svgs[0]!.querySelector('[data-part="bands"]')).not.toBeNull();
    expect(svgs[0]!.querySelector('[data-part="series-root"]')).not.toBeNull();
  });

  it("uses explicit width/height attributes without needing layout", async () => {
    const chart = await mountChart(
      `${TABLE}<ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis><ui-chart-axis position="left"></ui-chart-axis>`,
    );
    const svg = chart.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 400 200");
  });

  it("aggregates a continuous x-axis domain from a series' xKey (the scatter case) rather than the series' primary key", async () => {
    document.body.innerHTML = `<ui-chart width="400" height="200">
      <table>
        <thead><tr><th>a</th><th>b</th></tr></thead>
        <tbody><tr><td>3</td><td>50</td></tr><tr><td>9</td><td>10</td></tr></tbody>
      </table>
      <ui-chart-axis position="bottom" scale="linear"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
    </ui-chart>`;
    await flush();
    const chart = document.querySelector("ui-chart")!;
    const element = document.createElement("div");
    chart.append(element);
    chart.registerSeries({
      element,
      type: "fake-bar",
      key: "b",
      xKey: "a",
      highlightScope: { highlight: "item", fade: "global" },
      hidden: false,
    });
    await flush();
    // The bottom axis has no `key` of its own (continuous, series-driven) —
    // its domain must come from the series' xKey ("a": [3, 9]), not its
    // primary key ("b": [10, 50]). A tick at the xKey's max (9) should exist.
    const xAxis = chart.querySelectorAll("ui-chart-axis")[0]!;
    const ticks = [...xAxis.querySelectorAll<HTMLElement>('[data-part="tick"]')];
    expect(ticks.some((t) => t.textContent === "9")).toBe(true);
    expect(ticks.some((t) => t.textContent === "50")).toBe(false);
  });

  it("renders one band rect per band-axis category, sized by bandwidth", async () => {
    const chart = await mountChart(
      `${TABLE}<ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>`,
    );
    const bands = chart.querySelectorAll('[data-part="band"]');
    expect(bands.length).toBe(3);
    expect(bands[0]!.getAttribute("fill")).toBe("transparent");
    expect(Number(bands[0]!.getAttribute("width"))).toBeGreaterThan(0);
    expect(bands[0]!.getAttribute("data-value")).toBe("Jan");
    expect(bands[1]!.getAttribute("data-index")).toBe("1");
  });

  it("regression: point-scale band rects are centered on their category and stay within the plot", async () => {
    // A point scale's own position is its category's *centre*, but band rects
    // used its own start-edge formula unmodified — so each rect began on its
    // own datum and ran a whole step to the right: the last category's rect
    // spilled entirely past the viewBox (never hoverable), and pointing near
    // the plot's own edges activated the wrong neighbour.
    const chart = await mountChart(
      `${TABLE}<ui-chart-axis position="bottom" key="Month" scale="point"></ui-chart-axis>`,
    );
    const bands = [...chart.querySelectorAll<SVGRectElement>('[data-part="band"]')];
    expect(bands.length).toBe(3);
    for (const band of bands) {
      const x = Number(band.getAttribute("x"));
      const width = Number(band.getAttribute("width"));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(400.001); // mountChart's default width
    }
    // The middle category never needs clamping — its rect must be centred
    // exactly on the scale's own (unclamped) point position. Same constructor
    // and padding `axisScale` itself uses for a point axis.
    const scale = pointScale(["Jan", "Feb", "Mar"], [0, 400], { padding: 0.15 });
    if (!isDiscreteScale(scale)) throw new Error("expected a point scale");
    const feb = bands[1]!;
    const x = Number(feb.getAttribute("x"));
    const width = Number(feb.getAttribute("width"));
    expect(x + width / 2).toBeCloseTo(scale("Feb")!, 2);
  });

  it("generates axis tick spans with a --tick fraction", async () => {
    const chart = await mountChart(
      `${TABLE}<ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>`,
    );
    const axis = chart.querySelector("ui-chart-axis")!;
    const ticks = axis.querySelectorAll('[data-part="tick"]');
    expect(ticks.length).toBe(3);
    expect(ticks[0]!.textContent).toBe("Jan");
    expect(ticks[0]!.getAttribute("style")).toContain("--tick:");
  });

  it("draws grid lines only for a dimension with a registered ui-chart-grid", async () => {
    const withGrid = await mountChart(
      `${TABLE}<ui-chart-axis position="left"></ui-chart-axis><ui-chart-grid axis="y"></ui-chart-grid>`,
    );
    expect(
      withGrid.querySelectorAll('[data-part="grid-line"][data-axis="y"]').length,
    ).toBeGreaterThan(0);

    const withoutGrid = await mountChart(`${TABLE}<ui-chart-axis position="left"></ui-chart-axis>`);
    expect(withoutGrid.querySelectorAll('[data-part="grid-line"]').length).toBe(0);
  });

  it("keeps a dimension's grid lines while any ui-chart-grid still asks for them", async () => {
    const chart = await mountChart(`
      ${TABLE}
      <ui-chart-axis position="left"></ui-chart-axis>
      <ui-chart-grid axis="y"></ui-chart-grid>
      <ui-chart-grid axis="y"></ui-chart-grid>
    `);
    const lines = () => chart.querySelectorAll('[data-part="grid-line"]').length;
    expect(lines()).toBeGreaterThan(0);

    // Registrations are counted, not just flagged: removing one of two grid
    // elements must not switch the whole dimension off.
    chart.querySelector("ui-chart-grid")!.remove();
    await flush();
    expect(lines()).toBeGreaterThan(0);

    chart.querySelector("ui-chart-grid")!.remove();
    await flush();
    expect(lines()).toBe(0);
  });

  it("renders a series group per registered series, in document order, with series-index", async () => {
    const chart = await mountChart(`
      ${TABLE}
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
    `);
    await addFakeSeries(chart);

    const group = chart.querySelector('[data-part="series"]');
    expect(group).not.toBeNull();
    expect(group!.getAttribute("data-type")).toBe("fake-bar");
    expect(group!.getAttribute("data-series")).toBe("Revenue");
    expect((group as HTMLElement).dataset.seriesIndex).toBe("0");
    expect(group!.querySelectorAll('[data-part="mark"]').length).toBe(3);
  });

  it("hides a series' group when marked hidden and removes it from the DOM", async () => {
    const chart = await mountChart(`
      ${TABLE}
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
    `);
    const { element } = await addFakeSeries(chart);
    expect(chart.querySelectorAll('[data-part="series"]').length).toBe(1);

    chart.setSeriesHidden(element, true);
    expect(chart.isSeriesHidden(element)).toBe(true);
    await flush();
    expect(chart.querySelectorAll('[data-part="series"]').length).toBe(0);
  });

  it("honors a series registered already hidden", async () => {
    const chart = await mountChart(`
      ${TABLE}
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
    `);
    const element = document.createElement("div");
    chart.append(element);
    chart.registerSeries({
      element,
      type: "fake-bar",
      key: "Revenue",
      highlightScope: { highlight: "item", fade: "global" },
      hidden: true,
    });
    expect(chart.isSeriesHidden(element)).toBe(true);
    await flush();
    expect(chart.querySelectorAll('[data-part="series"]').length).toBe(0);
  });

  it("dispatches highlight on band hover and clears on pointerleave", async () => {
    const chart = await mountChart(
      `${TABLE}<ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>`,
    );
    const events: unknown[] = [];
    chart.addEventListener("highlight", (e) => events.push((e as CustomEvent).detail));

    const band = chart.querySelectorAll('[data-part="band"]')[1]!;
    band.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    expect(events.at(-1)).toEqual({ series: null, seriesIndex: null, index: 1 });

    chart.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    expect(events.at(-1)).toEqual({ series: null, seriesIndex: null, index: null });
  });

  it("dispatches a series-specific highlight when hovering a mark directly, even though it visually covers its band", async () => {
    const chart = await mountChart(`
      ${TABLE}
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
    `);
    await addFakeSeries(chart);
    const events: unknown[] = [];
    chart.addEventListener("highlight", (e) => events.push((e as CustomEvent).detail));

    // A mark sits inside its series' <g>, which is a SIBLING of the bands
    // group, not a descendant of any band rect — hovering it must not require
    // falling through to (or missing) the band's own axis-wide highlight.
    const mark = chart.querySelectorAll('[data-part="mark"]')[2]!;
    mark.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    expect(events.at(-1)).toEqual({ series: "Revenue", seriesIndex: 0, index: 2 });
  });

  it("toggles data-highlighted/data-faded attributes to match the active highlight", async () => {
    const chart = await mountChart(`
      ${TABLE}
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
    `);
    await addFakeSeries(chart);

    chart.setHighlight({ index: 1, series: null });
    const marks = chart.querySelectorAll('[data-part="mark"]');
    expect(marks[1]!.hasAttribute("data-highlighted")).toBe(true);
    expect(marks[0]!.hasAttribute("data-faded")).toBe(true);
  });

  it("walks the highlighted index with ArrowRight/ArrowLeft and clears on Escape", async () => {
    const chart = await mountChart(TABLE);
    const events = trackHighlights(chart);
    chart.setHighlight({ index: 0, series: null });
    chart.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(events.at(-1)).toMatchObject({ index: 1 });
    chart.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(events.at(-1)).toMatchObject({ index: 0 });
    chart.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(events.at(-1)).toMatchObject({ index: null });
  });

  it("dispatches select with the clicked mark's series/index/value", async () => {
    const chart = await mountChart(`
      ${TABLE}
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
    `);
    await addFakeSeries(chart);

    const events: unknown[] = [];
    chart.addEventListener("select", (e) => events.push((e as CustomEvent).detail));
    const mark = chart.querySelectorAll('[data-part="mark"]')[2]!;
    mark.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(events).toEqual([{ series: "Revenue", seriesIndex: 0, index: 2, value: 101 }]);
  });

  it("keeps the series registry live: a registration appears in getSeries() and unregistering removes it", async () => {
    const chart = await mountChart(`
      ${TABLE}
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
    `);
    expect(chart.getSeries().length).toBe(0);

    const { unregister } = await addFakeSeries(chart);
    expect(chart.getSeries().length).toBe(1);
    expect(chart.getSeries()[0]!.key).toBe("Revenue");

    unregister();
    expect(chart.getSeries().length).toBe(0);
    await flush();
    expect(chart.querySelectorAll('[data-part="series"]').length).toBe(0);
  });
});

describe("ui-chart: one registry", () => {
  it("regression: two series over the same dataset column keep their own marks", async () => {
    // These used to share one element map keyed by column name, so the second
    // series stole the first's marks (and set circle attributes on its rects):
    // a bar and a line over `Revenue` — the canonical combo chart — rendered
    // nothing at all.
    const chart = await mountChart(`
      ${TABLE}
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
    `);
    await addFakeSeries(chart, "Revenue");
    await addFakeSeries(chart, "Revenue");

    const groups = [...chart.querySelectorAll('[data-part="series"]')];
    expect(groups.length).toBe(2);
    for (const group of groups) {
      expect(group.querySelectorAll('[data-part="mark"]').length).toBe(3);
    }
    // Two distinct palette slots, so a consumer's colours still tell them apart.
    expect(groups.map((g) => (g as HTMLElement).dataset.seriesIndex)).toEqual(["0", "1"]);
  });

  it("regression: a series keeps its palette slot while another is hidden", async () => {
    const chart = await mountChart(`
      ${TABLE}
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
    `);
    const first = await addFakeSeries(chart, "Revenue");
    await addFakeSeries(chart, "Cost");

    const slotOfCost = () =>
      (chart.querySelector('[data-part="series"][data-series="Cost"]') as HTMLElement).dataset
        .seriesIndex;
    expect(slotOfCost()).toBe("1");

    // Hiding the series in front of it used to renumber it to 0 — changing its
    // colour mid-interaction, and disagreeing with its own legend swatch.
    chart.setSeriesHidden(first.element, true);
    await flush();
    expect(slotOfCost()).toBe("1");
  });

  it("exposes the registered data series through getSeries(), in document order", async () => {
    const chart = await mountChart(`
      ${TABLE}
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
    `);
    await addFakeSeries(chart, "Revenue");
    await addFakeSeries(chart, "Cost");
    expect(chart.getSeries().map((s) => s.key)).toEqual(["Revenue", "Cost"]);

    const [revenue] = chart.getSeries();
    chart.setSeriesHidden(revenue!.element, true);
    // Hidden is a flag on the registration, not a removal from the registry.
    expect(chart.getSeries().map((s) => s.key)).toEqual(["Revenue", "Cost"]);
    expect(chart.getSeries()[0]!.hidden).toBe(true);
    expect(chart.isSeriesHidden(revenue!.element)).toBe(true);
  });
});

describe("ui-chart: highlight is not a re-render", () => {
  it("re-applies highlight/fade state without rebuilding the plot", async () => {
    const chart = await mountChart(`
      ${TABLE}
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
      <ui-chart-grid axis="y"></ui-chart-grid>
    `);
    await addFakeSeries(chart);
    const gridLine = chart.querySelector('[data-part="grid-line"]');
    const band = chart.querySelectorAll('[data-part="band"]')[1]!;
    expect(gridLine).not.toBeNull();

    chart.setHighlight({ index: 1, series: null });

    // A full render replaces every grid line; a highlight must not.
    expect(chart.querySelector('[data-part="grid-line"]')).toBe(gridLine);
    expect(band.hasAttribute("data-highlighted")).toBe(true);
    expect(chart.querySelectorAll('[data-part="mark"]')[1]!.hasAttribute("data-highlighted")).toBe(
      true,
    );

    chart.setHighlight({ index: null, series: null });
    expect(band.hasAttribute("data-highlighted")).toBe(false);
  });
});

describe("ui-chart: lifecycle", () => {
  it("regression: keyboard interaction survives being moved in the DOM", async () => {
    document.body.innerHTML = `<div id="from"></div><div id="to"></div>`;
    const chart = document.createElement("ui-chart");
    chart.setAttribute("width", "400");
    chart.setAttribute("height", "200");
    chart.innerHTML = TABLE;
    document.querySelector("#from")!.append(chart);
    await flush();

    document.querySelector("#to")!.append(chart);
    await flush();

    // Teardown used to drop every listener and leave the element flagged as
    // wired, so a moved chart painted once and then ignored input forever.
    const events = trackHighlights(chart);
    chart.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(events.at(-1)).toMatchObject({ index: 0 });
    expect(chart.querySelectorAll("svg").length).toBe(1);
  });

  it("re-observes its own box after a move, when no explicit size is authored", async () => {
    const observed: Element[] = [];
    const callbacks: ResizeObserverCallback[] = [];
    class StubResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback);
      }
      observe(target: Element) {
        observed.push(target);
      }
      unobserve() {}
      disconnect() {}
    }
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver;
    try {
      document.body.innerHTML = `<div id="from"></div><div id="to"></div>`;
      const chart = document.createElement("ui-chart");
      chart.innerHTML = TABLE;
      document.querySelector("#from")!.append(chart);
      await flush();
      expect(observed).toEqual([chart.querySelector("svg")]);

      // Deliver a measurement through the observer itself, so the chart has
      // genuinely measured once: the re-observe guard must key on "no explicit
      // width/height attributes", not on "not measured yet", or a chart that
      // has ever been measured stops observing the moment it moves.
      const entry = { contentRect: { width: 400, height: 200 } } as ResizeObserverEntry;
      callbacks[0]!([entry], new StubResizeObserver(() => {}) as unknown as ResizeObserver);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await flush();
      expect(chart.querySelector("svg")!.getAttribute("viewBox")).toBe("0 0 400 200");

      document.querySelector("#to")!.append(chart);
      await flush();
      // Teardown disconnected the old observer, so re-wiring has to make a new
      // one — a moved chart that never measures again would freeze at its last
      // size (or, having never been measured, never render at all).
      expect(observed.length).toBe(2);
    } finally {
      globalThis.ResizeObserver = original;
    }
  });

  it("keeps a single rounded box: pointer interaction and the plot's own viewBox agree on width/height", async () => {
    // `#render` draws the plot's viewBox and every mark against `round(state.
    // width/height)`; interaction now reads the same value back from
    // `#plotSize` rather than re-reading the store's raw measurement, so the
    // two can never independently drift apart. (`round()` only trims
    // sub-thousandth-pixel jitter, so this doesn't reach a directly observable
    // behavioural difference — it locks in that there is exactly one box, not
    // that a specific pointer position used to resolve incorrectly.)
    const chart = await mountChart(`
      <table>
        <thead><tr><th>X</th><th>Y</th></tr></thead>
        <tbody><tr><td>0</td><td>0</td></tr><tr><td>10</td><td>10</td></tr></tbody>
      </table>
      <ui-chart-axis position="bottom" scale="linear"></ui-chart-axis>
      <ui-chart-axis position="left" scale="linear"></ui-chart-axis>
      <ui-chart-scatter x-key="X" key="Y"></ui-chart-scatter>
    `);
    const svg = chart.querySelector("svg")!;
    svg.getBoundingClientRect = () =>
      ({ x: 0, y: 0, top: 0, left: 0, width: 400, height: 200 }) as DOMRect;

    const events: unknown[] = [];
    chart.addEventListener("highlight", (e) => events.push((e as CustomEvent).detail));
    chart.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: 400, clientY: 0 }),
    );
    expect(events.at(-1)).toMatchObject({ index: 1 }); // the domain-max point, at the plot's own edge
  });

  it("regression: a row with a null index-axis value never wins the nearest-index hover contest", async () => {
    // `#nearestIndex` used to inline `Number(raw)`, and `Number(null)` is 0 —
    // so a null-valued row sat at the origin and beat every real row whenever
    // the pointer neared x=0. `toNumeric(null)` is NaN, which never wins.
    const chart = await mountChart(`
      <table>
        <thead><tr><th>X</th><th>Y</th></tr></thead>
        <tbody>
          <tr><td>5</td><td>1</td></tr>
          <tr><td></td><td>2</td></tr>
          <tr><td>10</td><td>3</td></tr>
        </tbody>
      </table>
      <ui-chart-axis position="bottom" scale="linear" key="X" min="0" max="10"></ui-chart-axis>
      <ui-chart-axis position="left" min="0" max="5"></ui-chart-axis>
    `);
    chart.querySelector("svg")!.getBoundingClientRect = () =>
      ({ x: 0, y: 0, top: 0, left: 0, width: 400, height: 200 }) as DOMRect;

    const events = trackHighlights(chart);
    // x=0 in plot space inverts to value 0 — nearest *plottable* row is X=5
    // (index 0); the null row (index 1) would have been distance 0 away.
    chart.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: 0, clientY: 50 }),
    );
    expect(events.at(-1)).toMatchObject({ index: 0 });
  });

  it("re-attaches its plot when the chart's own innerHTML is replaced", async () => {
    const chart = await mountChart(`
      ${TABLE}
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
    `);
    expect(chart.querySelectorAll("svg").length).toBe(1);

    // Wiping the children takes the generated <svg> with them, while the host
    // itself never disconnects — so nothing would otherwise put it back, and
    // the chart would report data-state="rendered" with no plot at all.
    chart.innerHTML = TABLE;
    await flush();

    expect(chart.querySelectorAll("svg").length).toBe(1);
    expect(chart.querySelector('[data-part="series-root"]')).not.toBeNull();
    expect(chart.data.length).toBe(3);
  });

  it("ingests a <table> that is authored after the chart has already wired", async () => {
    const chart = await mountChart("");
    expect(chart.getAttribute("data-state")).toBe("empty");

    chart.insertAdjacentHTML("afterbegin", TABLE);
    await flush();

    expect(chart.data.length).toBe(3);
    expect(chart.getAttribute("data-state")).toBe("rendered");
  });

  it("re-ingests the authored table when its cells change after mount", async () => {
    const chart = await mountChart(TABLE);
    expect(chart.data[0]!.Revenue).toBe(120);

    chart.querySelector("tbody td:last-child")!.textContent = "999";
    await flush();
    expect(chart.data[0]!.Revenue).toBe(999);
  });

  it("keeps a programmatic .data assignment when the table changes afterwards", async () => {
    const chart = await mountChart(TABLE);
    chart.data = [{ Month: "Apr", Revenue: 999 }];

    chart.querySelector("tbody td")!.textContent = "Dec";
    await flush();
    expect(chart.data).toEqual([{ Month: "Apr", Revenue: 999 }]);
  });

  it("regression: removing the dataset table clears .data and data-state, rather than keeping the last read", async () => {
    // `#ingestTable` used to return early whenever there was no direct-child
    // table, so a table that was removed (or re-parented out of direct-child
    // reach) left `.data`/`data-state` pointing at a dataset nothing in the
    // DOM could update any more.
    const chart = await mountChart(TABLE);
    expect(chart.data.length).toBe(3);
    expect(chart.getAttribute("data-state")).toBe("rendered");

    chart.querySelector("table")!.remove();
    await flush();

    expect(chart.data).toEqual([]);
    expect(chart.getAttribute("data-state")).toBe("empty");
  });

  it("regression: wrapping the dataset table out of direct-child reach also clears .data", async () => {
    const chart = await mountChart(TABLE);
    const table = chart.querySelector("table")!;
    const wrapper = document.createElement("div");
    table.replaceWith(wrapper);
    wrapper.append(table);
    await flush();

    expect(chart.data).toEqual([]);
  });
});

describe("ui-chart-axis", () => {
  it("defaults to position bottom and scale linear", async () => {
    document.body.innerHTML = `<ui-chart width="100" height="100"><ui-chart-axis></ui-chart-axis></ui-chart>`;
    await flush();
    const axis = document.querySelector("ui-chart-axis")!;
    expect(axis.position).toBe("bottom");
    expect(axis.scaleType).toBe("linear");
  });

  it("clears its ticks when it stops being the axis in use for its orientation", async () => {
    const chart = await mountChart(`
      ${TABLE}
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
    `);
    const [bottom, left] = [...chart.querySelectorAll("ui-chart-axis")];
    expect(bottom!.querySelectorAll('[data-part="tick"]').length).toBe(3);
    expect(left!.querySelectorAll('[data-part="tick"]').length).toBeGreaterThan(0);

    // Only one axis per orientation is used; the former value axis is now a
    // second horizontal one, so it must drop the ticks it had drawn rather
    // than leave a stale set of them on the page.
    left!.setAttribute("position", "bottom");
    await flush();
    expect(left!.querySelectorAll('[data-part="tick"]').length).toBe(0);
    expect(bottom!.querySelectorAll('[data-part="tick"]').length).toBe(3);
  });

  it("reads position/key/scale from attributes", async () => {
    document.body.innerHTML = `<ui-chart width="100" height="100"><ui-chart-axis position="left" key="Revenue" scale="log"></ui-chart-axis></ui-chart>`;
    await flush();
    const axis = document.querySelector("ui-chart-axis")!;
    expect(axis.position).toBe("left");
    expect(axis.key).toBe("Revenue");
    expect(axis.scaleType).toBe("log");
  });
});
