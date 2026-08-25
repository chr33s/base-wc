// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./chart.ts";
import "./chart-bar.ts";
import "./chart-legend.ts";
import "./chart-scatter.ts";
import type { UIChart } from "./chart.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

// `ui-chart` (and `ui-chart-legend`) wire via `connectLightDom`, which defers
// to a microtask so a component can wait for late-authored light-DOM parts.
// Awaiting one microtask flushes it (and every child element's own
// `connectLightDom` microtask, queued in the same tick) — everything after
// that is synchronous.
async function mountChart(inner: string): Promise<UIChart> {
  document.body.innerHTML = `<ui-chart width="400" height="200">${inner}</ui-chart>`;
  await Promise.resolve();
  return document.querySelector("ui-chart")!;
}

const TABLE = `
  <table>
    <thead><tr><th>Month</th><th>Revenue</th><th>Cost</th></tr></thead>
    <tbody>
      <tr><td>Jan</td><td>120</td><td>90</td></tr>
      <tr><td>Feb</td><td>132</td><td>85</td></tr>
    </tbody>
  </table>
`;

const TWO_SERIES = `
  ${TABLE}
  <ui-chart-bar key="Revenue" label="Revenue ($)"></ui-chart-bar>
  <ui-chart-bar key="Cost"></ui-chart-bar>
  <ui-chart-legend></ui-chart-legend>
`;

describe("ui-chart-legend", () => {
  it("has role=list on the host", async () => {
    const chart = await mountChart(TWO_SERIES);
    const legend = chart.querySelector("ui-chart-legend")!;
    expect(legend.getAttribute("role")).toBe("list");
  });

  it("regression: role=listitem sits on a wrapper, never on the button itself", async () => {
    // role="listitem" on the button directly overrides its implicit `button`
    // role — and aria-pressed is only a valid state under role="button" — so
    // the on/off semantics this legend relies on would never reach assistive
    // tech. The listitem role has to live on something else.
    const chart = await mountChart(TWO_SERIES);
    const legend = chart.querySelector("ui-chart-legend")!;
    const button = legend.querySelector<HTMLButtonElement>("button")!;

    expect(button.hasAttribute("role")).toBe(false);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.closest('[role="listitem"]')).not.toBeNull();
    expect(button.closest('[role="listitem"]')).not.toBe(button);
  });

  it("renders one listitem button per registered series, in document order", async () => {
    const chart = await mountChart(TWO_SERIES);
    const legend = chart.querySelector("ui-chart-legend")!;
    const buttons = legend.querySelectorAll<HTMLButtonElement>("button");

    expect(buttons.length).toBe(2);
    expect(buttons[0]!.textContent).toBe("Revenue ($)");
    expect(buttons[1]!.textContent).toBe("Cost");
  });

  it("labels fall back to the key attribute when no label attribute is authored", async () => {
    const chart = await mountChart(TWO_SERIES);
    const legend = chart.querySelector("ui-chart-legend")!;
    const buttons = legend.querySelectorAll<HTMLButtonElement>("button");
    expect(buttons[1]!.textContent).toBe("Cost");
  });

  it("assigns --series-index to each swatch matching discovery order", async () => {
    const chart = await mountChart(TWO_SERIES);
    const legend = chart.querySelector("ui-chart-legend")!;
    const swatches = legend.querySelectorAll<HTMLElement>('[data-part="swatch"]');

    expect(swatches.length).toBe(2);
    expect(swatches[0]!.style.getPropertyValue("--series-index")).toBe("0");
    expect(swatches[1]!.style.getPropertyValue("--series-index")).toBe("1");
  });

  it("starts a visible series with aria-pressed=true and no data-hidden", async () => {
    const chart = await mountChart(TWO_SERIES);
    const legend = chart.querySelector("ui-chart-legend")!;
    const button = legend.querySelector<HTMLButtonElement>("button")!;

    // Pressed is the "on" state (`ui-toggle`'s convention): shown = pressed.
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.hasAttribute("data-hidden")).toBe(false);
  });

  it("clicking an item calls chart.setSeriesHidden and flips aria-pressed/data-hidden", async () => {
    const chart = await mountChart(TWO_SERIES);
    const legend = chart.querySelector("ui-chart-legend")!;
    const revenueSeries = chart.querySelector<HTMLElement>("ui-chart-bar")!;
    const button = legend.querySelector<HTMLButtonElement>("button")!;

    expect(chart.isSeriesHidden(revenueSeries)).toBe(false);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(chart.isSeriesHidden(revenueSeries)).toBe(true);

    // The item is updated in place, but re-query anyway so this asserts the
    // rendered state rather than a stale reference.
    const rebuilt = legend.querySelector<HTMLButtonElement>("button")!;
    expect(rebuilt.getAttribute("aria-pressed")).toBe("false");
    expect(rebuilt.hasAttribute("data-hidden")).toBe(true);

    // Clicking again toggles it back to visible.
    rebuilt.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(chart.isSeriesHidden(revenueSeries)).toBe(false);
    const rebuiltAgain = legend.querySelector<HTMLButtonElement>("button")!;
    expect(rebuiltAgain.getAttribute("aria-pressed")).toBe("true");
    expect(rebuiltAgain.hasAttribute("data-hidden")).toBe(false);
  });

  it("dispatches a toggle event with the series' key and new hidden state", async () => {
    const chart = await mountChart(TWO_SERIES);
    const legend = chart.querySelector("ui-chart-legend")!;
    const button = legend.querySelector<HTMLButtonElement>("button")!;

    const events: unknown[] = [];
    legend.addEventListener("toggle", (event: Event) => events.push((event as CustomEvent).detail));

    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(events).toEqual([{ series: "Revenue", hidden: true }]);

    const rebuilt = legend.querySelector<HTMLButtonElement>("button")!;
    rebuilt.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(events).toEqual([
      { series: "Revenue", hidden: true },
      { series: "Revenue", hidden: false },
    ]);
  });

  it("sets the chart's highlight to the hovered series, and clears it when the pointer leaves", async () => {
    const chart = await mountChart(TWO_SERIES);
    const legend = chart.querySelector("ui-chart-legend")!;
    const costSeries = chart.querySelectorAll("ui-chart-bar")[1]!;
    const button = legend.querySelectorAll<HTMLButtonElement>("button")[1]!;

    // Delegated on the host, so the event has to bubble from the item.
    button.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    expect(chart.getStore().getState().highlight).toEqual({ index: null, series: costSeries });

    legend.dispatchEvent(new PointerEvent("pointerleave"));
    expect(chart.getStore().getState().highlight).toEqual({ index: null, series: null });
  });

  it("keeps focus on the item that was just toggled", async () => {
    // The list used to be rebuilt wholesale on every registry change, so
    // activating an item destroyed the very button the user was on and dropped
    // keyboard focus to the document.
    const chart = await mountChart(TWO_SERIES);
    const legend = chart.querySelector("ui-chart-legend")!;
    const button = legend.querySelector<HTMLButtonElement>("button")!;

    button.focus();
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(legend.querySelector("button")).toBe(button);
    expect(button.isConnected).toBe(true);
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("re-renders its item list when a series element is added to the chart", async () => {
    const chart = await mountChart(TWO_SERIES);
    const legend = chart.querySelector("ui-chart-legend")!;
    expect(legend.querySelectorAll("button").length).toBe(2);

    const scatter = document.createElement("ui-chart-scatter");
    scatter.setAttribute("key", "Extra");
    chart.insertBefore(scatter, legend);
    await Promise.resolve();

    expect(legend.querySelectorAll("button").length).toBe(3);
    const labels = [...legend.querySelectorAll<HTMLButtonElement>("button")].map(
      (b) => b.textContent,
    );
    expect(labels).toContain("Extra");
  });

  it("re-renders its item list when a series element is removed from the chart", async () => {
    const chart = await mountChart(TWO_SERIES);
    const legend = chart.querySelector("ui-chart-legend")!;
    chart.querySelector('ui-chart-bar[key="Cost"]')!.remove();
    await Promise.resolve();

    const buttons = legend.querySelectorAll<HTMLButtonElement>("button");
    expect(buttons.length).toBe(1);
    expect(buttons[0]!.textContent).toBe("Revenue ($)");
  });

  it("renders no items when the chart has no series", async () => {
    const chart = await mountChart(`${TABLE}<ui-chart-legend></ui-chart-legend>`);
    const legend = chart.querySelector("ui-chart-legend")!;
    expect(legend.querySelectorAll("button").length).toBe(0);
  });

  it("regression: hovering the chart leaves the legend's buttons alone", async () => {
    // The legend used to watch the chart's whole subtree for mutations — and
    // every highlight re-renders the plot, so hovering the chart tore every
    // button out and rebuilt it, dropping focus and hover state mid-gesture.
    const chart = await mountChart(TWO_SERIES);
    const legend = chart.querySelector("ui-chart-legend")!;
    const button = legend.querySelector<HTMLButtonElement>("button")!;

    chart.setHighlight({ index: 1, series: null });
    await Promise.resolve();

    expect(legend.querySelector("button")).toBe(button);
    expect(button.isConnected).toBe(true);
  });

  it("keeps swatch slots in step with the chart's own series indices", async () => {
    const chart = await mountChart(TWO_SERIES);
    const legend = chart.querySelector("ui-chart-legend")!;
    const swatchSlots = () =>
      [...legend.querySelectorAll<HTMLElement>('[data-part="swatch"]')].map((s) =>
        s.style.getPropertyValue("--series-index"),
      );
    const groupSlots = () =>
      [...chart.querySelectorAll<SVGGElement>('[data-part="series"]')].map(
        (g) => g.dataset.seriesIndex,
      );

    expect(swatchSlots()).toEqual(["0", "1"]);
    expect(groupSlots()).toEqual(["0", "1"]);

    // Hiding the first series must not renumber the second one anywhere.
    chart.setSeriesHidden(chart.querySelector<HTMLElement>("ui-chart-bar")!, true);
    expect(swatchSlots()).toEqual(["0", "1"]);
    expect(groupSlots()).toEqual(["1"]);
  });

  it("updates an item's label when the series' attribute changes", async () => {
    const chart = await mountChart(TWO_SERIES);
    const legend = chart.querySelector("ui-chart-legend")!;
    chart.querySelector("ui-chart-bar")!.setAttribute("label", "Net revenue");
    const buttons = legend.querySelectorAll<HTMLButtonElement>("button");
    expect(buttons[0]!.textContent).toBe("Net revenue");
  });
});
