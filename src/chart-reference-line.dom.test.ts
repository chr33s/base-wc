// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { SeriesTypeDefinition } from "./chart-core.ts";
import { numericExtent, registerSeriesType } from "./chart-core.ts";
import "./chart.ts";
import "./chart-bar.ts";
import "./chart-legend.ts";
import "./chart-reference-line.ts";
import type { UIChart } from "./chart.ts";
import { flush, must } from "./test-utils.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

// `ui-chart` wires via `connectLightDom` (a microtask) and batches its full
// renders onto a microtask of their own — mounting K children paints once,
// and any later mutation defers its re-render the same way. A zero-delay
// macrotask drains all of it (wiring, registrations, observer deliveries and
// the coalesced render), so tests assert on settled DOM.
async function mountChart(inner: string, size = true) {
  document.body.innerHTML = `<ui-chart${size ? ' width="400" height="200"' : ""}>${inner}</ui-chart>`;
  await flush();
  return must(document.querySelector("ui-chart"));
}

function referenceLineGroup(chart: UIChart) {
  return chart.querySelector('[data-part="series"][data-type="reference-line"]');
}

describe("ui-chart-reference-line (attribute reading/defaults)", () => {
  it('defaults axis to "y" and reads value/label from attributes', () => {
    const el = document.createElement("ui-chart-reference-line");
    expect(el.axis).toBe("y");
    expect(el.value).toBeNull();
    expect(el.label).toBeUndefined();

    el.setAttribute("axis", "x");
    el.setAttribute("value", "42");
    el.setAttribute("label", "Target");
    expect(el.axis).toBe("x");
    expect(el.value).toBe("42");
    expect(el.label).toBe("Target");

    // Any value other than the literal "x" falls back to "y".
    el.setAttribute("axis", "bogus");
    expect(el.axis).toBe("y");
  });
});

describe("ui-chart-reference-line (registration + geometry)", () => {
  it('draws a horizontal line at the y-scale\'s pixel position for axis="y"', async () => {
    const chart = await mountChart(`
      <ui-chart-axis position="left" min="0" max="200"></ui-chart-axis>
      <ui-chart-reference-line axis="y" value="100"></ui-chart-reference-line>
    `);
    const group = referenceLineGroup(chart);
    expect(group).not.toBeNull();
    const line = must(must(group).querySelector('[data-part="line"]'));
    expect(line.tagName.toLowerCase()).toBe("path");
    // height=200, domain [0,200] → range [200,0] → y(100) = 100.
    expect(line.getAttribute("d")).toBe("M0,100L400,100");
    expect(line.getAttribute("fill")).toBe("none");
    // A reference-line mark represents no single data row.
    expect(line.hasAttribute("data-index")).toBe(false);
  });

  it('draws a vertical line at the x-scale\'s pixel position for axis="x"', async () => {
    const chart = await mountChart(`
      <ui-chart-axis position="bottom" min="0" max="10"></ui-chart-axis>
      <ui-chart-reference-line axis="x" value="5"></ui-chart-reference-line>
    `);
    const group = referenceLineGroup(chart);
    expect(group).not.toBeNull();
    const line = must(must(group).querySelector('[data-part="line"]'));
    // width=400, domain [0,10] → range [0,400] → x(5) = 200; spans full height.
    expect(line.getAttribute("d")).toBe("M200,0L200,200");
  });

  it("renders a label text mark when a label attribute is present", async () => {
    const chart = await mountChart(`
      <ui-chart-axis position="left" min="0" max="200"></ui-chart-axis>
      <ui-chart-reference-line axis="y" value="100" label="Target"></ui-chart-reference-line>
    `);
    const group = must(referenceLineGroup(chart));
    const label = group.querySelector('[data-part="label"]');
    expect(label).not.toBeNull();
    expect(must(label).tagName.toLowerCase()).toBe("text");
    expect(must(label).textContent).toBe("Target");
    expect(must(label).getAttribute("x")).toBe("4");
    expect(must(label).getAttribute("y")).toBe("96");
  });

  it("omits the label mark when no label attribute is present", async () => {
    const chart = await mountChart(`
      <ui-chart-axis position="left" min="0" max="200"></ui-chart-axis>
      <ui-chart-reference-line axis="y" value="100"></ui-chart-reference-line>
    `);
    const group = must(referenceLineGroup(chart));
    expect(group.querySelector('[data-part="label"]')).toBeNull();
  });

  it("resolves an ISO date string value against a time-scaled axis", async () => {
    const chart = await mountChart(`
      <ui-chart-axis position="left" scale="time" min="0" max="1000"></ui-chart-axis>
      <ui-chart-reference-line axis="y" value="1970-01-01T00:00:00.500Z"></ui-chart-reference-line>
    `);
    const group = must(referenceLineGroup(chart));
    const line = must(group.querySelector('[data-part="line"]'));
    // domain [0,1000]ms, height=200 → y(500) = 100.
    expect(line.getAttribute("d")).toBe("M0,100L400,100");
  });

  it("renders nothing when the relevant axis scale is unavailable", async () => {
    const chart = await mountChart(`
      <ui-chart-reference-line axis="y" value="100"></ui-chart-reference-line>
    `);
    expect(must(referenceLineGroup(chart)).querySelectorAll("*").length).toBe(0);
  });

  it("renders nothing for an unparsable value", async () => {
    const chart = await mountChart(`
      <ui-chart-axis position="left" min="0" max="200"></ui-chart-axis>
      <ui-chart-reference-line axis="y" value="not-a-number"></ui-chart-reference-line>
    `);
    expect(must(referenceLineGroup(chart)).querySelectorAll("*").length).toBe(0);
  });

  it("registers via chart.registerSeries under its own type, and never distorts axis extrema", async () => {
    const fakeBar: SeriesTypeDefinition = {
      type: "fake-bar-for-reference-line",
      stacks: false,
      getExtremum: (data, series) => numericExtent(data, series.key),
      computeMarks: () => [],
    };
    registerSeriesType(fakeBar);

    const chart = await mountChart(`
      <table>
        <thead><tr><th>Month</th><th>Revenue</th></tr></thead>
        <tbody><tr><td>Jan</td><td>50</td></tr><tr><td>Feb</td><td>80</td></tr></tbody>
      </table>
      <ui-chart-axis position="left"></ui-chart-axis>
      <ui-chart-reference-line axis="y" value="5000"></ui-chart-reference-line>
    `);
    const element = document.createElement("div");
    chart.append(element);
    chart.registerSeries({
      element,
      type: "fake-bar-for-reference-line",
      key: "Revenue",
      highlightScope: { highlight: "item", fade: "global" },
      hidden: false,
    });
    await flush();

    const group = referenceLineGroup(chart);
    expect(group).not.toBeNull();
    expect(must(group).getAttribute("data-series")).toMatch(/^reference-line-/);

    // The y-axis domain must come from the real series' data ([50, 80]), not
    // be widened to include the reference line's out-of-range value (5000).
    const axis = must(chart.querySelector("ui-chart-axis"));
    const ticks = [...axis.querySelectorAll<HTMLElement>('[data-part="tick"]')].map((t) =>
      Number(t.textContent),
    );
    expect(ticks.every((v) => v <= 100)).toBe(true);
    expect(ticks.includes(5000)).toBe(false);
  });

  it("regression: takes no palette slot, and never reaches the legend", async () => {
    // A reference line used to register as an ordinary series, so it consumed
    // `--series-index: 0` and pushed every real series' colour along by one —
    // while the legend, which discovered series by tag, kept the old numbering.
    const chart = await mountChart(`
      <table>
        <thead><tr><th>Month</th><th>Revenue</th></tr></thead>
        <tbody><tr><td>Jan</td><td>50</td></tr><tr><td>Feb</td><td>80</td></tr></tbody>
      </table>
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
      <ui-chart-reference-line axis="y" value="60"></ui-chart-reference-line>
      <ui-chart-bar key="Revenue"></ui-chart-bar>
      <ui-chart-legend></ui-chart-legend>
    `);

    expect(chart.getSeries().map((s) => s.key)).toEqual(["Revenue"]);
    const bar = chart.querySelector('[data-part="series"][data-type="bar"]') as HTMLElement;
    expect(bar.dataset.seriesIndex).toBe("0");
    // The annotation's own group carries no palette slot at all.
    expect((referenceLineGroup(chart) as HTMLElement).dataset.seriesIndex).toBeUndefined();

    const legend = must(chart.querySelector("ui-chart-legend"));
    const buttons = [...legend.querySelectorAll<HTMLButtonElement>("button")];
    expect(buttons.length).toBe(1);
    expect(must(buttons[0]).getAttribute("data-series")).toBe("Revenue");
    expect(
      must(buttons[0])
        .querySelector<HTMLElement>('[data-part="swatch"]')!
        .style.getPropertyValue("--series-index"),
    ).toBe("0");
  });

  it("regression: never highlighted or faded by another series' highlight", async () => {
    // Group-level highlight/fade state used to be applied to every registered
    // series indiscriminately, so a reference line — which has its own module
    // doc promising it is "never highlighted/faded" — dimmed to 30% opacity
    // (the demo skin's [data-faded] rule) whenever any *other* series was
    // specifically hovered.
    const chart = await mountChart(`
      <table>
        <thead><tr><th>Month</th><th>Revenue</th></tr></thead>
        <tbody><tr><td>Jan</td><td>50</td></tr><tr><td>Feb</td><td>80</td></tr></tbody>
      </table>
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
      <ui-chart-reference-line axis="y" value="60"></ui-chart-reference-line>
      <ui-chart-bar key="Revenue"></ui-chart-bar>
    `);
    const bar = must(chart.querySelector<HTMLElement>("ui-chart-bar"));
    const group = must(referenceLineGroup(chart));

    chart.setHighlight({ index: 0, series: bar });
    expect(group.hasAttribute("data-faded")).toBe(false);
    expect(group.hasAttribute("data-highlighted")).toBe(false);
    for (const child of group.children) {
      expect(child.hasAttribute("data-faded")).toBe(false);
      expect(child.hasAttribute("data-highlighted")).toBe(false);
    }
  });
});
