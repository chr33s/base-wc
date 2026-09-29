// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import { arcPath, pieAngles } from "./chart-shape.ts";
import "./chart-pie.ts";
import "./chart.ts";
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
  document.body.innerHTML = `<ui-chart${size ? ' width="300" height="300"' : ""}>${inner}</ui-chart>`;
  await flush();
  return must(document.querySelector("ui-chart"));
}

const TABLE = `
  <table>
    <thead><tr><th>Fruit</th><th>Count</th></tr></thead>
    <tbody>
      <tr><td>Apple</td><td>10</td></tr>
      <tr><td>Banana</td><td>20</td></tr>
      <tr><td>Cherry</td><td>30</td></tr>
      <tr><td>Date</td><td>40</td></tr>
    </tbody>
  </table>
`;

describe("ui-chart-pie", () => {
  it("reads attribute defaults", async () => {
    document.body.innerHTML = `<ui-chart-pie key="Count"></ui-chart-pie>`;
    const pie = must(document.querySelector("ui-chart-pie"));
    expect(pie.key).toBe("Count");
    expect(pie.innerRadius).toBe(0);
    expect(pie.outerRadius).toBeUndefined();
    expect(pie.padAngle).toBe(0);
    expect(pie.startAngle).toBe(0);
    expect(pie.endAngle).toBeCloseTo(Math.PI * 2);
    expect(pie.sort).toBe(false);
    expect(pie.label).toBeUndefined();
    expect(pie.highlightScope).toEqual({ highlight: "item", fade: "global" });
  });

  it("registers with a real ui-chart parent and renders one arc per data row", async () => {
    const chart = await mountChart(`${TABLE}<ui-chart-pie key="Count"></ui-chart-pie>`);
    const group = chart.querySelector('[data-part="series"][data-series="Count"]');
    expect(group).not.toBeNull();
    expect(must(group).getAttribute("data-type")).toBe("pie");

    const arcs = chart.querySelectorAll('[data-part="arc"]');
    expect(arcs.length).toBe(4);
    arcs.forEach((arc, i) => {
      expect(arc.getAttribute("data-index")).toBe(String(i));
      expect(arc.tagName.toLowerCase()).toBe("path");
      expect(arc.getAttribute("d")).toBeTruthy();
    });
  });

  it("computes slice angles/paths matching pieAngles + arcPath called directly with the same inputs", async () => {
    const chart = await mountChart(`${TABLE}<ui-chart-pie key="Count"></ui-chart-pie>`);
    const plot = { x: 0, y: 0, width: 300, height: 300 };
    const cx = plot.x + plot.width / 2;
    const cy = plot.y + plot.height / 2;
    const outerRadius = Math.min(plot.width, plot.height) / 2 - 4;

    const values = [10, 20, 30, 40];
    const slices = pieAngles(values, {
      startAngle: 0,
      endAngle: Math.PI * 2,
      padAngle: 0,
      sort: false,
    });
    const expectedPaths = slices.map((slice) =>
      arcPath({
        innerRadius: 0,
        outerRadius,
        startAngle: slice.startAngle,
        endAngle: slice.endAngle,
        padAngle: slice.padAngle,
        cx,
        cy,
      }),
    );

    const arcs = [...chart.querySelectorAll('[data-part="arc"]')];
    expect(arcs.map((a) => a.getAttribute("d"))).toEqual(expectedPaths);
  });

  it("renders a donut when inner-radius is set", async () => {
    const chart = await mountChart(
      `${TABLE}<ui-chart-pie key="Count" inner-radius="40"></ui-chart-pie>`,
    );
    const plot = { x: 0, y: 0, width: 300, height: 300 };
    const cx = plot.x + plot.width / 2;
    const cy = plot.y + plot.height / 2;
    const outerRadius = Math.min(plot.width, plot.height) / 2 - 4;

    const values = [10, 20, 30, 40];
    const slices = pieAngles(values, {
      startAngle: 0,
      endAngle: Math.PI * 2,
      padAngle: 0,
      sort: false,
    });
    const expectedFirstPath = arcPath({
      innerRadius: 40,
      outerRadius,
      startAngle: must(slices[0]).startAngle,
      endAngle: must(slices[0]).endAngle,
      padAngle: must(slices[0]).padAngle,
      cx,
      cy,
    });

    const arcs = chart.querySelectorAll('[data-part="arc"]');
    expect(must(arcs[0]).getAttribute("d")).toBe(expectedFirstPath);
    // A donut's inner edge means the path is not a simple wedge back to the
    // center — it should contain a second arc command rather than a line to (cx, cy).
    expect(must(arcs[0]).getAttribute("d")).not.toContain(`L${cx},${cy}`);
  });

  it("honors outer-radius when explicitly authored", async () => {
    const chart = await mountChart(
      `${TABLE}<ui-chart-pie key="Count" outer-radius="60"></ui-chart-pie>`,
    );
    const cx = 150;
    const cy = 150;
    const values = [10, 20, 30, 40];
    const slices = pieAngles(values, {
      startAngle: 0,
      endAngle: Math.PI * 2,
      padAngle: 0,
      sort: false,
    });
    const expectedFirstPath = arcPath({
      innerRadius: 0,
      outerRadius: 60,
      startAngle: must(slices[0]).startAngle,
      endAngle: must(slices[0]).endAngle,
      padAngle: must(slices[0]).padAngle,
      cx,
      cy,
    });
    const arcs = chart.querySelectorAll('[data-part="arc"]');
    expect(must(arcs[0]).getAttribute("d")).toBe(expectedFirstPath);
  });

  it("still emits a mark for a zero-value slice, keeping data-index alignment", async () => {
    const chart = await mountChart(`
      <table>
        <thead><tr><th>Fruit</th><th>Count</th></tr></thead>
        <tbody>
          <tr><td>Apple</td><td>0</td></tr>
          <tr><td>Banana</td><td>20</td></tr>
        </tbody>
      </table>
      <ui-chart-pie key="Count"></ui-chart-pie>
    `);
    const arcs = chart.querySelectorAll('[data-part="arc"]');
    expect(arcs.length).toBe(2);
    expect(must(arcs[0]).getAttribute("data-index")).toBe("0");
    expect(must(arcs[1]).getAttribute("data-index")).toBe("1");
  });

  it("changes slice paint order (but not data-index) when sort is set", async () => {
    const unsorted = await mountChart(`${TABLE}<ui-chart-pie key="Count"></ui-chart-pie>`);
    const unsortedIndexes = [...unsorted.querySelectorAll('[data-part="arc"]')].map((a) =>
      a.getAttribute("data-index"),
    );
    expect(unsortedIndexes).toEqual(["0", "1", "2", "3"]);

    const sorted = await mountChart(`${TABLE}<ui-chart-pie key="Count" sort></ui-chart-pie>`);
    const sortedIndexes = [...sorted.querySelectorAll('[data-part="arc"]')].map((a) =>
      a.getAttribute("data-index"),
    );
    // Descending by value (40, 30, 20, 10) => original indexes 3, 2, 1, 0.
    expect(sortedIndexes).toEqual(["3", "2", "1", "0"]);
  });

  it("dispatches ui-chart's select event with the clicked slice's index/value", async () => {
    const chart = await mountChart(`${TABLE}<ui-chart-pie key="Count"></ui-chart-pie>`);
    const events: unknown[] = [];
    chart.addEventListener("select", (e) => events.push((e as CustomEvent).detail));

    const arcs = chart.querySelectorAll('[data-part="arc"]');
    must(arcs[2]).dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(events).toEqual([{ series: "Count", seriesIndex: 0, index: 2, value: 30 }]);
  });

  it("re-renders with the new column's slices when the key attribute changes", async () => {
    const chart = await mountChart(`
      <table>
        <thead><tr><th>Fruit</th><th>A</th><th>B</th></tr></thead>
        <tbody>
          <tr><td>Apple</td><td>10</td><td>1</td></tr>
          <tr><td>Banana</td><td>10</td><td>3</td></tr>
        </tbody>
      </table>
      <ui-chart-pie key="A"></ui-chart-pie>
    `);
    const before = [...chart.querySelectorAll('[data-part="arc"]')].map((a) => a.getAttribute("d"));

    // The element *is* its registration, so the attribute edit is already the
    // update — the next (batched) render picks up the new column with no
    // unregister/re-register churn.
    must(chart.querySelector("ui-chart-pie")).setAttribute("key", "B");
    await flush();

    expect(must(chart.querySelector('[data-part="series"]')).getAttribute("data-series")).toBe("B");
    const after = [...chart.querySelectorAll('[data-part="arc"]')].map((a) => a.getAttribute("d"));
    expect(after).not.toEqual(before);
  });

  it("removes its series group on disconnect", async () => {
    const chart = await mountChart(`${TABLE}<ui-chart-pie key="Count"></ui-chart-pie>`);
    expect(chart.querySelectorAll('[data-part="series"]').length).toBe(1);
    must(chart.querySelector("ui-chart-pie")).remove();
    expect(chart.querySelectorAll('[data-part="series"]').length).toBe(0);
  });
});
