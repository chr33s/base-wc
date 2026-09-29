// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { ChartRow, SeriesRegistration } from "./chart-core.ts";
import { getSeriesType } from "./chart-core.ts";
import { linearScale } from "./chart-scale.ts";
import "./chart.ts";
import "./chart-scatter.ts";
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

const TABLE = `
  <table>
    <thead><tr><th>X</th><th>Y</th></tr></thead>
    <tbody>
      <tr><td>0</td><td>0</td></tr>
      <tr><td>10</td><td>20</td></tr>
      <tr><td>20</td><td>10</td></tr>
      <tr><td></td><td>15</td></tr>
      <tr><td>5</td><td>n/a</td></tr>
    </tbody>
  </table>
`;

const AXES = `
  <ui-chart-axis position="bottom" scale="linear"></ui-chart-axis>
  <ui-chart-axis position="left" scale="linear"></ui-chart-axis>
`;

describe("ui-chart-scatter attributes", () => {
  it("reads x-key/key/r/label/highlight/fade with correct defaults", () => {
    const el = document.createElement("ui-chart-scatter");
    expect(el.xKey).toBe("");
    expect(el.key).toBe("");
    expect(el.r).toBe("4");
    expect(el.label).toBeUndefined();
    expect(el.highlightScope).toEqual({ highlight: "item", fade: "global" });

    el.setAttribute("x-key", "Weight");
    el.setAttribute("key", "Height");
    el.setAttribute("r", "9");
    el.setAttribute("label", "Points");
    el.setAttribute("highlight", "series");
    el.setAttribute("fade", "none");
    expect(el.xKey).toBe("Weight");
    expect(el.key).toBe("Height");
    expect(el.r).toBe("9");
    expect(el.label).toBe("Points");
    expect(el.highlightScope).toEqual({ highlight: "series", fade: "none" });
  });
});

describe("ui-chart-scatter inside ui-chart", () => {
  it("registers a series group and positions circles from xKey/key against continuous scales", async () => {
    const chart = await mountChart(
      `${TABLE}${AXES}<ui-chart-scatter x-key="X" key="Y"></ui-chart-scatter>`,
    );

    const group = must(chart.querySelector('[data-part="series"][data-series="Y"]'));
    expect(group).not.toBeNull();
    expect(group.getAttribute("data-type")).toBe("scatter");

    // width=400, height=200; X domain [0,20] -> range [0,400] => cx = x*20
    // Y domain [0,20] -> range [200,0] (inverted) => cy = 200 - y*10
    const marks = [...chart.querySelectorAll('[data-part="mark"]')];
    expect(marks.length).toBe(3); // rows 3 (missing X) and 4 (non-numeric Y) are skipped

    expect(must(marks[0]).tagName.toLowerCase()).toBe("circle");
    expect(must(marks[0]).getAttribute("cx")).toBe("0");
    expect(must(marks[0]).getAttribute("cy")).toBe("200");
    expect((marks[0] as HTMLElement).dataset.index).toBe("0");

    expect(must(marks[1]).getAttribute("cx")).toBe("200");
    expect(must(marks[1]).getAttribute("cy")).toBe("0");
    expect((marks[1] as HTMLElement).dataset.index).toBe("1");

    expect(must(marks[2]).getAttribute("cx")).toBe("400");
    expect(must(marks[2]).getAttribute("cy")).toBe("100");
    expect((marks[2] as HTMLElement).dataset.index).toBe("2");
  });

  it("skips a row missing either x or y coordinate, without affecting the other rows", async () => {
    const chart = await mountChart(
      `${TABLE}${AXES}<ui-chart-scatter x-key="X" key="Y"></ui-chart-scatter>`,
    );
    const marks = [...chart.querySelectorAll('[data-part="mark"]')];
    const indices = marks.map((m) => (m as HTMLElement).dataset.index);
    // row 3 (empty X) and row 4 ("n/a" Y) never produce a mark.
    expect(indices).toEqual(["0", "1", "2"]);
  });

  it("defaults marker radius to 4 and honors the r attribute, including live updates", async () => {
    const chart = await mountChart(
      `${TABLE}${AXES}<ui-chart-scatter x-key="X" key="Y"></ui-chart-scatter>`,
    );
    const marksDefault = [...chart.querySelectorAll('[data-part="mark"]')];
    for (const mark of marksDefault) expect(mark.getAttribute("r")).toBe("4");

    const scatter = must(chart.querySelector("ui-chart-scatter"));
    scatter.setAttribute("r", "9");
    await flush();
    const marksUpdated = [...chart.querySelectorAll('[data-part="mark"]')];
    for (const mark of marksUpdated) expect(mark.getAttribute("r")).toBe("9");
  });

  it("renders with an explicit r attribute set from the start", async () => {
    const chart = await mountChart(
      `${TABLE}${AXES}<ui-chart-scatter x-key="X" key="Y" r="12"></ui-chart-scatter>`,
    );
    const marks = [...chart.querySelectorAll('[data-part="mark"]')];
    expect(marks.length).toBe(3);
    for (const mark of marks) expect(mark.getAttribute("r")).toBe("12");
  });
});

describe("ui-chart-scatter: axis-trigger hover", () => {
  it("highlights the nearest point on pointermove, through the series' own hitTest", async () => {
    // `hitTest` used to be implemented but never called: the container only
    // knew how to invert the pointer's x through the index axis, and a scatter
    // chart's axis has no `key` to look a row up by — so hovering anywhere but
    // exactly over a 4px circle highlighted nothing.
    const chart = await mountChart(
      `${TABLE}${AXES}<ui-chart-scatter x-key="X" key="Y"></ui-chart-scatter>`,
    );
    const svg = must(chart.querySelector("svg"));
    // happy-dom has no layout engine, so the plot needs a box for the
    // pointer→local-coordinate mapping to have anything to map through.
    svg.getBoundingClientRect = () =>
      ({ x: 0, y: 0, top: 0, left: 0, width: 400, height: 200 }) as DOMRect;

    const events: unknown[] = [];
    chart.addEventListener("highlight", (e) => events.push((e as CustomEvent).detail));

    // Nearest to (195, 15) is row 1 at (200, 0).
    chart.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: 195, clientY: 15 }),
    );
    expect(events.at(-1)).toMatchObject({ index: 1, series: "Y" });
  });

  it("picks the closest point across several scatter series, not the first that answers", async () => {
    const chart = await mountChart(`
      <table>
        <thead><tr><th>X</th><th>A</th><th>B</th></tr></thead>
        <tbody><tr><td>0</td><td>0</td><td>20</td></tr><tr><td>20</td><td>20</td><td>0</td></tr></tbody>
      </table>
      ${AXES}
      <ui-chart-scatter x-key="X" key="A"></ui-chart-scatter>
      <ui-chart-scatter x-key="X" key="B"></ui-chart-scatter>
    `);
    must(chart.querySelector("svg")).getBoundingClientRect = () =>
      ({ x: 0, y: 0, top: 0, left: 0, width: 400, height: 200 }) as DOMRect;

    const events: unknown[] = [];
    chart.addEventListener("highlight", (e) => events.push((e as CustomEvent).detail));

    // A's points are (0,200) and (400,0); B's are (0,0) and (400,200).
    // Near the top-left corner, B's first point is closest.
    chart.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 5, clientY: 5 }));
    expect(events.at(-1)).toMatchObject({ series: "B", seriesIndex: 1, index: 0 });

    // Near the bottom-left, A's first point wins instead.
    chart.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: 5, clientY: 195 }),
    );
    expect(events.at(-1)).toMatchObject({ series: "A", seriesIndex: 0, index: 0 });
  });

  it("ignores pointer movement outside the plot box", async () => {
    // The listener is on the host, so it also sees the pointer crossing the
    // legend, the axis chrome and the tooltip — none of which should pull the
    // highlight away from whatever they are showing.
    const chart = await mountChart(
      `${TABLE}${AXES}<ui-chart-scatter x-key="X" key="Y"></ui-chart-scatter>`,
    );
    must(chart.querySelector("svg")).getBoundingClientRect = () =>
      ({ x: 0, y: 0, top: 0, left: 0, width: 400, height: 200 }) as DOMRect;

    const events: unknown[] = [];
    chart.addEventListener("highlight", (e) => events.push((e as CustomEvent).detail));

    // Below the plot — where a legend would sit.
    chart.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: 195, clientY: 260 }),
    );
    expect(events).toEqual([]);

    // Inside it, the same pointer does highlight.
    chart.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: 195, clientY: 15 }),
    );
    expect(events.length).toBe(1);
  });
});

describe("scatter series type hitTest", () => {
  function makeContext(data: ChartRow[]) {
    const xScale = linearScale([0, 20], [0, 400]);
    const yScale = linearScale([0, 20], [200, 0]);
    const config: SeriesRegistration = {
      element: document.createElement("div"),
      type: "scatter",
      key: "Y",
      xKey: "X",
      highlightScope: { highlight: "item", fade: "global" },
      hidden: false,
    };
    return {
      config,
      data,
      xScale,
      yScale,
      categoryKey: undefined,
      stacked: undefined,
      plot: { x: 0, y: 0, width: 400, height: 200 },
      groupIndex: 0,
      groupCount: 1,
    };
  }

  const DATA: ChartRow[] = [
    { X: 0, Y: 0 }, // cx=0, cy=200
    { X: 10, Y: 20 }, // cx=200, cy=0
    { X: 20, Y: 10 }, // cx=400, cy=100
  ];

  it("returns the nearest plotted point, and how far away it is", () => {
    const scatter = must(getSeriesType("scatter"));
    const context = makeContext(DATA);
    // The distance comes back with the index so `ui-chart` can compare hits
    // across several series and take the closest.
    expect(scatter.hitTest?.(context, 10, 190)).toEqual({
      index: 0,
      distance: Math.hypot(10, 10),
    });
    expect(scatter.hitTest?.(context, 190, 10)).toMatchObject({ index: 1 });
    expect(scatter.hitTest?.(context, 390, 110)).toMatchObject({ index: 2 });
  });

  it("returns null when the dataset is empty", () => {
    const scatter = must(getSeriesType("scatter"));
    const context = makeContext([]);
    expect(scatter.hitTest?.(context, 100, 100)).toBeNull();
  });

  it("returns null when every row lacks both coordinates", () => {
    const scatter = must(getSeriesType("scatter"));
    const context = makeContext([
      { X: null, Y: "n/a" },
      { X: "oops", Y: null },
    ]);
    expect(scatter.hitTest?.(context, 100, 100)).toBeNull();
  });

  it("skips rows lacking a coordinate but still finds the nearest among the valid ones", () => {
    const scatter = must(getSeriesType("scatter"));
    const context = makeContext([must(DATA[0]), { X: null, Y: 5 }, must(DATA[1]), must(DATA[2])]);
    // The invalid row (index 1) is excluded; nearest to (190, 10) is still
    // the point originally at index 2 ({X:10, Y:20} -> cx=200, cy=0).
    expect(scatter.hitTest?.(context, 190, 10)).toMatchObject({ index: 2 });
  });
});
