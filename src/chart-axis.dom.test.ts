// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./chart.ts";
import "./chart-axis.ts";
import "./chart-bar.ts";
import { flush, must } from "./test-utils.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

async function mountChart(inner: string) {
  document.body.innerHTML = `
    <ui-chart width="400" height="200">
      <table>
        <thead><tr><th>Month</th><th>Revenue</th></tr></thead>
        <tbody>
          <tr><td>Jan</td><td>120</td></tr>
          <tr><td>Feb</td><td>132</td></tr>
        </tbody>
      </table>
      ${inner}
    </ui-chart>`;
  await flush();
  return must(document.querySelector("ui-chart"));
}

describe("ui-chart-axis (attribute reading/defaults)", () => {
  it("defaults to a bottom linear axis with no pinned bounds", () => {
    const axis = document.createElement("ui-chart-axis");
    expect(axis.position).toBe("bottom");
    expect(axis.scaleType).toBe("linear");
    expect(axis.key).toBeUndefined();
    expect(axis.min).toBeUndefined();
    expect(axis.max).toBeUndefined();
    expect(axis.tickCount).toBeUndefined();
  });

  it("reads position, scale, key and numeric bounds from attributes", () => {
    const axis = document.createElement("ui-chart-axis");
    axis.setAttribute("position", "left");
    axis.setAttribute("scale", "sqrt");
    axis.setAttribute("key", "Revenue");
    axis.setAttribute("min", "0");
    axis.setAttribute("max", "150");
    axis.setAttribute("ticks", "4");
    expect(axis.position).toBe("left");
    expect(axis.scaleType).toBe("sqrt");
    expect(axis.key).toBe("Revenue");
    expect(axis.min).toBe(0);
    expect(axis.max).toBe(150);
    expect(axis.tickCount).toBe(4);
  });

  it("falls back to the defaults for invalid position and scale values", () => {
    const axis = document.createElement("ui-chart-axis");
    axis.setAttribute("position", "diagonal");
    axis.setAttribute("scale", "cubic");
    expect(axis.position).toBe("bottom");
    expect(axis.scaleType).toBe("linear");
  });
});

describe("ui-chart-axis (rendering)", () => {
  it("draws one tick per category on a band axis, formatted with the formatter", async () => {
    const chart = await mountChart(`
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-bar key="Revenue"></ui-chart-bar>`);
    const axis = must(chart.querySelector("ui-chart-axis"));
    const texts = [...axis.querySelectorAll('[data-part="tick"]')].map((t) => t.textContent);
    expect(texts).toEqual(["Jan", "Feb"]);

    axis.formatter = (value) => `<${String(value)}>`;
    chart.requestRender();
    await flush();
    const formatted = [...axis.querySelectorAll('[data-part="tick"]')].map((t) => t.textContent);
    expect(formatted).toEqual(["<Jan>", "<Feb>"]);
  });

  it("positions each tick as a 0..1 fraction of the axis length", async () => {
    const chart = await mountChart(`
      <ui-chart-axis position="left" min="0" max="100" ticks="2"></ui-chart-axis>
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-bar key="Revenue"></ui-chart-bar>`);
    const axis = must(chart.querySelector('ui-chart-axis[position="left"]'));
    const fractions = [...axis.querySelectorAll<HTMLElement>('[data-part="tick"]')].map((t) =>
      Number(t.style.getPropertyValue("--tick")),
    );
    expect(fractions.length).toBeGreaterThan(1);
    for (const fraction of fractions) {
      expect(fraction).toBeGreaterThanOrEqual(0);
      expect(fraction).toBeLessThanOrEqual(1);
    }
  });
});

describe("ui-chart-grid", () => {
  it("defaults to the y dimension and reads x from the attribute", () => {
    const grid = document.createElement("ui-chart-grid");
    expect(grid.axis).toBe("y");
    grid.setAttribute("axis", "x");
    expect(grid.axis).toBe("x");
  });

  it("draws grid lines for its dimension inside the chart svg", async () => {
    const chart = await mountChart(`
      <ui-chart-axis position="left" min="0" max="150"></ui-chart-axis>
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-bar key="Revenue"></ui-chart-bar>
      <ui-chart-grid axis="y"></ui-chart-grid>`);
    expect(chart.querySelectorAll('[data-part="grid-line"][data-axis="y"]').length).toBeGreaterThan(
      0,
    );
    expect(chart.querySelectorAll('[data-part="grid-line"][data-axis="x"]').length).toBe(0);
  });
});
