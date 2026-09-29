// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./chart.ts";
import "./chart-bar.ts";
import "./chart-line.ts";
import "./chart-tooltip.ts";
import type { UIChart } from "./chart.ts";
import type { UIChartHighlightDetail } from "./chart.ts";
import type { UIChartTooltip } from "./chart-tooltip.ts";
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
    <thead><tr><th>Month</th><th>Revenue</th><th>Cost</th></tr></thead>
    <tbody>
      <tr><td>Jan</td><td>120</td><td>80</td></tr>
      <tr><td>Feb</td><td>132</td><td>90</td></tr>
      <tr><td>Mar</td><td>101</td><td>70</td></tr>
    </tbody>
  </table>
`;

// Real series elements: the tooltip reads the chart's series *registry*
// (`chart.getSeries()`), so a series has to actually register to produce a row
// — an unupgraded tag renders nothing in the chart and belongs in no tooltip.
const SERIES = `
  <ui-chart-bar key="Revenue" label="Revenue"></ui-chart-bar>
  <ui-chart-line key="Cost" label="Cost"></ui-chart-line>
`;

/** Append a `<ui-chart-tooltip>` into `chart` and let its own `connectLightDom` microtask flush. */
async function mountTooltip(chart: UIChart, trigger?: "axis" | "item") {
  const tooltip = document.createElement("ui-chart-tooltip") as UIChartTooltip;
  if (trigger) tooltip.setAttribute("trigger", trigger);
  chart.append(tooltip);
  await flush();
  return tooltip;
}

function fireHighlight(chart: UIChart, detail: UIChartHighlightDetail) {
  chart.dispatchEvent(
    new CustomEvent<UIChartHighlightDetail>("highlight", { bubbles: true, detail }),
  );
}

describe("ui-chart-tooltip", () => {
  it("sets popover=manual and role=tooltip, with no rows rendered before any highlight", async () => {
    const chart = await mountChart(`${TABLE}${SERIES}`);
    const tooltip = await mountTooltip(chart);

    expect(tooltip.getAttribute("popover")).toBe("manual");
    expect(tooltip.getAttribute("role")).toBe("tooltip");
    expect(tooltip.trigger).toBe("axis");
    expect(tooltip.querySelectorAll('[data-part="row"]').length).toBe(0);
  });

  it("defaults trigger to axis and reads an explicit trigger=item attribute", async () => {
    const chart = await mountChart(`${TABLE}${SERIES}`);
    const axisTooltip = await mountTooltip(chart);
    expect(axisTooltip.trigger).toBe("axis");

    const itemTooltip = await mountTooltip(chart, "item");
    expect(itemTooltip.trigger).toBe("item");
  });

  it("populates one row per visible series with the right label/value on an axis highlight", async () => {
    const chart = await mountChart(`${TABLE}${SERIES}`);
    const tooltip = await mountTooltip(chart);

    fireHighlight(chart, { index: 1, series: null, seriesIndex: null });

    const rows = [...tooltip.querySelectorAll('[data-part="row"]')];
    expect(rows.length).toBe(2);
    expect(must(rows[0]).getAttribute("data-series")).toBe("Revenue");
    expect(must(must(rows[0]).querySelector('[data-part="label"]')).textContent).toBe("Revenue");
    expect(must(must(rows[0]).querySelector('[data-part="value"]')).textContent).toBe("132");
    expect(must(rows[1]).getAttribute("data-series")).toBe("Cost");
    expect(must(must(rows[1]).querySelector('[data-part="value"]')).textContent).toBe("90");
  });

  it("excludes a hidden series from the generated table", async () => {
    const chart = await mountChart(`${TABLE}${SERIES}`);
    const tooltip = await mountTooltip(chart);
    const [, line] = [...chart.querySelectorAll<HTMLElement>("ui-chart-bar, ui-chart-line")];

    chart.setSeriesHidden(must(line), true);
    fireHighlight(chart, { index: 2, series: null, seriesIndex: null });

    const rows = [...tooltip.querySelectorAll('[data-part="row"]')];
    expect(rows.length).toBe(1);
    expect(must(rows[0]).getAttribute("data-series")).toBe("Revenue");
    expect(must(must(rows[0]).querySelector('[data-part="value"]')).textContent).toBe("101");
  });

  it("trigger=item shows only the specifically-highlighted series", async () => {
    const chart = await mountChart(`${TABLE}${SERIES}`);
    const tooltip = await mountTooltip(chart, "item");

    fireHighlight(chart, { index: 2, series: "Cost", seriesIndex: 1 });

    const rows = [...tooltip.querySelectorAll('[data-part="row"]')];
    expect(rows.length).toBe(1);
    expect(must(rows[0]).getAttribute("data-series")).toBe("Cost");
    expect(must(must(rows[0]).querySelector('[data-part="label"]')).textContent).toBe("Cost");
    expect(must(must(rows[0]).querySelector('[data-part="value"]')).textContent).toBe("70");
  });

  it("clears content when a highlight event reports both index and series null", async () => {
    const chart = await mountChart(`${TABLE}${SERIES}`);
    const tooltip = await mountTooltip(chart);

    fireHighlight(chart, { index: 0, series: null, seriesIndex: null });
    expect(tooltip.querySelectorAll('[data-part="row"]').length).toBeGreaterThan(0);

    fireHighlight(chart, { index: null, series: null, seriesIndex: null });
    expect(tooltip.querySelectorAll('[data-part="row"]').length).toBe(0);
  });

  it("hides (clears) an item-trigger tooltip when its series goes null, even if index is set", async () => {
    const chart = await mountChart(`${TABLE}${SERIES}`);
    const tooltip = await mountTooltip(chart, "item");

    fireHighlight(chart, { index: 1, series: "Revenue", seriesIndex: 0 });
    expect(tooltip.querySelectorAll('[data-part="row"]').length).toBe(1);

    fireHighlight(chart, { index: 1, series: null, seriesIndex: null });
    expect(tooltip.querySelectorAll('[data-part="row"]').length).toBe(0);
  });

  it("regression: trigger=item never shows an empty popover for a hidden series' highlight", async () => {
    // The legend still highlights a hidden series on hover (so `detail.series`
    // is non-null), but that series produces no row — `shouldShow` alone used
    // to be enough to open the popover, leaving an empty bordered box.
    const chart = await mountChart(`${TABLE}${SERIES}`);
    const tooltip = await mountTooltip(chart, "item");
    const bar = must(chart.querySelector<HTMLElement>("ui-chart-bar"));
    chart.setSeriesHidden(bar, true);

    fireHighlight(chart, { index: 1, series: "Revenue", seriesIndex: 0 });

    expect(tooltip.querySelectorAll('[data-part="row"]').length).toBe(0);
    expect(tooltip.matches(":popover-open")).toBe(false);
  });

  it("regression: trigger=axis shows nothing (not an empty table) when every series is hidden", async () => {
    const chart = await mountChart(`${TABLE}${SERIES}`);
    const tooltip = await mountTooltip(chart);
    for (const series of chart.querySelectorAll<HTMLElement>("ui-chart-bar, ui-chart-line")) {
      chart.setSeriesHidden(series, true);
    }

    fireHighlight(chart, { index: 1, series: null, seriesIndex: null });

    expect(tooltip.querySelector('[data-part="table"]')).toBeNull();
    expect(tooltip.matches(":popover-open")).toBe(false);
  });

  it("uses an authored <template> child instead of the generated table, substituting placeholder tokens", async () => {
    const chart = await mountChart(`${TABLE}${SERIES}`);
    const tooltip = await mountTooltip(chart);
    const template = document.createElement("template");
    template.innerHTML = `<div data-row>{label}: {value} (index {index})</div>`;
    tooltip.append(template);

    fireHighlight(chart, { index: 0, series: null, seriesIndex: null });

    // The generated-table path must not run when a template is authored.
    expect(tooltip.querySelector('[data-part="table"]')).toBeNull();
    const clones = [...tooltip.querySelectorAll("[data-row]")];
    expect(clones.length).toBe(2);
    expect(must(clones[0]).textContent).toBe("Revenue: 120 (index 0)");
    expect(must(clones[1]).textContent).toBe("Cost: 80 (index 0)");
    // The template itself must survive (it's re-cloned on every highlight).
    expect(tooltip.querySelector("template")).not.toBeNull();
  });

  it("regression: a template's own text nodes don't accumulate across repeated highlights", async () => {
    // `#clearContent` used to remove only elements (`querySelectorAll`), which
    // never matches a bare text node — so every highlight appended another
    // copy of the template's own literal text without ever reclaiming the
    // last one, growing without bound while the pointer moved.
    const chart = await mountChart(`${TABLE}${SERIES}`);
    const tooltip = await mountTooltip(chart);
    const template = document.createElement("template");
    template.innerHTML = `{label}: {value} `;
    tooltip.append(template);

    fireHighlight(chart, { index: 0, series: null, seriesIndex: null });
    fireHighlight(chart, { index: 1, series: null, seriesIndex: null });
    fireHighlight(chart, { index: 2, series: null, seriesIndex: null });

    // One instantiation per row, not one per row per highlight fired so far.
    expect(tooltip.childNodes.length).toBe(1 /* template */ + 2 /* rows */);
    expect(tooltip.textContent).toBe("Revenue: 101 Cost: 70 ");
  });

  it("gives each row the series' palette slot, unchanged by another series being hidden", async () => {
    const chart = await mountChart(`${TABLE}${SERIES}`);
    const tooltip = await mountTooltip(chart);
    const slots = () =>
      [...tooltip.querySelectorAll<HTMLElement>('[data-part="row"]')].map((row) =>
        row.style.getPropertyValue("--series-index"),
      );

    fireHighlight(chart, { index: 0, series: null, seriesIndex: null });
    expect(slots()).toEqual(["0", "1"]);
    // Published as an attribute too, the same way a series group and a legend
    // item publish it, so one consumer rule colours all three.
    expect(
      [...tooltip.querySelectorAll<HTMLElement>('[data-part="row"]')].map(
        (row) => row.dataset.seriesIndex,
      ),
    ).toEqual(["0", "1"]);

    // Rows used to be numbered by their position among the *visible* series,
    // so hiding the first one recoloured the second.
    chart.setSeriesHidden(must(chart.querySelector<HTMLElement>("ui-chart-bar")), true);
    fireHighlight(chart, { index: 0, series: null, seriesIndex: null });
    expect(slots()).toEqual(["1"]);
  });

  it("trigger=item shows one row for a combo chart, not one per series over that column", async () => {
    // Rows were matched by `key`, so a bar and a line over the same column —
    // the case the whole family is built to keep apart — produced two rows for
    // a single hovered mark. The palette slot in the highlight is unambiguous.
    const chart = await mountChart(`${TABLE}
      <ui-chart-bar key="Revenue" label="Bars"></ui-chart-bar>
      <ui-chart-line key="Revenue" label="Trend"></ui-chart-line>`);
    const tooltip = await mountTooltip(chart, "item");

    fireHighlight(chart, { index: 1, series: "Revenue", seriesIndex: 1 });
    const labels = [...tooltip.querySelectorAll('[data-part="label"]')].map((c) => c.textContent);
    expect(labels).toEqual(["Trend"]);

    fireHighlight(chart, { index: 1, series: "Revenue", seriesIndex: 0 });
    expect([...tooltip.querySelectorAll('[data-part="label"]')].map((c) => c.textContent)).toEqual([
      "Bars",
    ]);
  });

  it("its generated table is never mistaken for the chart's dataset", async () => {
    // The tooltip renders a <table> of its own inside the chart. A descendant
    // search for the dataset would find it — especially with the tooltip
    // authored ahead of the real table — and read the tooltip's own rows back
    // in as data.
    const chart = await mountChart(`<ui-chart-tooltip></ui-chart-tooltip>${TABLE}${SERIES}`);
    await flush();
    const before = chart.data;

    fireHighlight(chart, { index: 1, series: null, seriesIndex: null });
    expect(chart.querySelector("ui-chart-tooltip [data-part='table']")).not.toBeNull();

    // Any direct-child mutation re-checks which table is the dataset.
    chart.append(document.createElement("span"));
    await flush();
    expect(chart.data).toEqual(before);
    expect(chart.data.length).toBe(3);
  });

  it("keeps working after being moved in the DOM", async () => {
    const chart = await mountChart(`${TABLE}${SERIES}`);
    const tooltip = await mountTooltip(chart);
    // Teardown drops the listeners it put on the *chart*, so a reconnection
    // has to re-wire — a moved tooltip that never shows again is the bug here.
    chart.append(document.createElement("div"));
    must(chart.querySelector("div")).append(tooltip);
    await flush();

    fireHighlight(chart, { index: 1, series: null, seriesIndex: null });
    expect(tooltip.querySelectorAll('[data-part="row"]').length).toBe(2);
  });

  it("repositions via fixed left/top on a chart pointermove while active, and stops after hiding", async () => {
    const chart = await mountChart(`${TABLE}${SERIES}`);
    const tooltip = await mountTooltip(chart);

    fireHighlight(chart, { index: 0, series: null, seriesIndex: null });
    chart.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: 50, clientY: 60 }),
    );
    expect(tooltip.style.position).toBe("fixed");
    expect(tooltip.style.left).toBe("62px");
    expect(tooltip.style.top).toBe("72px");

    fireHighlight(chart, { index: null, series: null, seriesIndex: null });
    tooltip.style.left = "";
    tooltip.style.top = "";
    chart.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: 90, clientY: 90 }),
    );
    expect(tooltip.style.left).toBe("");
    expect(tooltip.style.top).toBe("");
  });
});
