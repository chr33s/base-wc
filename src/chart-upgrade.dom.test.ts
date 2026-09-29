// @vitest-environment happy-dom
import { expect, it } from "vite-plus/test";
import { flush, must } from "./test-utils.ts";

/** Narrow a lookup the fixture guarantees is present. */
// Regression: a chart child is upgraded by its own module (`chart-axis.ts`),
// which `chart.ts` imports — so the child's definition always lands *before*
// `ui-chart`'s. Wiring against the container in that window used to call
// registration methods that did not exist yet, throwing out of the child's
// lifecycle callback and leaving it permanently unwired.
it("wires chart children authored before ui-chart is defined", async () => {
  document.body.innerHTML = `
    <ui-chart width="200" height="100">
      <table>
        <thead><tr><th>Month</th><th>Revenue</th></tr></thead>
        <tbody><tr><td>Jan</td><td>10</td></tr><tr><td>Feb</td><td>20</td></tr></tbody>
      </table>
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
      <ui-chart-grid axis="y"></ui-chart-grid>
    </ui-chart>`;

  // Only the children's module: `ui-chart` is still an un-upgraded element.
  await import("./chart-axis.ts");
  await flush();
  expect(customElements.get("ui-chart")).toBeUndefined();

  await import("./chart.ts");
  await flush();
  await flush();

  const chart = must(document.querySelector("ui-chart"));
  expect(chart.getAttribute("data-state")).toBe("rendered");
  // The axis registered (it draws its own ticks) …
  expect(chart.querySelectorAll('[data-part="tick"]').length).toBeGreaterThan(0);
  // … and so did the grid, which is the registration that used to throw.
  expect(chart.querySelectorAll('[data-part="grid-line"]').length).toBeGreaterThan(0);
});
