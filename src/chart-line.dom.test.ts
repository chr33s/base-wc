// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./chart.ts";
import "./chart-line.ts";
import { getSeriesType, registerSeriesType } from "./chart-core.ts";
import type { UIChart } from "./chart.ts";
import { bandScale, linearScale } from "./chart-scale.ts";
import { type Point, areaPath, linePath, round } from "./chart-shape.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

// `ui-chart` wires via `connectLightDom` (a microtask) and batches its full
// renders onto a microtask of their own — mounting K children paints once,
// and any later mutation defers its re-render the same way. A zero-delay
// macrotask drains all of it (wiring, registrations, observer deliveries and
// the coalesced render), so tests assert on settled DOM.
function flush() {
  return new Promise((resolve) => setTimeout(resolve));
}

async function mountChart(inner: string, size = true) {
  document.body.innerHTML = `<ui-chart${size ? ' width="400" height="200"' : ""}>${inner}</ui-chart>`;
  await flush();
  return document.querySelector("ui-chart")!;
}

const AXES = `
  <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
  <ui-chart-axis position="left" min="0" max="150"></ui-chart-axis>
`;

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

const TABLE_WITH_GAP = `
  <table>
    <thead><tr><th>Month</th><th>Revenue</th></tr></thead>
    <tbody>
      <tr><td>Jan</td><td>120</td></tr>
      <tr><td>Feb</td><td></td></tr>
      <tr><td>Mar</td><td>101</td></tr>
    </tbody>
  </table>
`;

// Reconstructs the exact scales `ui-chart` builds internally for the AXES
// markup above (band x-axis over 400px, linear y-axis over 200px with an
// explicit [0, 150] domain) so expected path strings come from the same
// scale/shape kernel the component itself uses — never a hardcoded number.
function expectedScales() {
  const xScale = bandScale(["Jan", "Feb", "Mar"], [0, 400], {
    paddingInner: 0.3,
    paddingOuter: 0.15,
  });
  const yScale = linearScale([0, 150], [200, 0]);
  return { xScale, yScale };
}

function strokeOf(chart: UIChart, key = "Revenue") {
  return chart.querySelector<SVGPathElement>(
    `[data-part="series"][data-series="${key}"] [data-part="stroke"]`,
  )!;
}

describe("ui-chart-line", () => {
  it("registers a line series group with the expected stroke path", async () => {
    const chart = await mountChart(`${TABLE}${AXES}<ui-chart-line key="Revenue"></ui-chart-line>`);

    const group = chart.querySelector('[data-part="series"][data-series="Revenue"]');
    expect(group).not.toBeNull();
    expect(group!.getAttribute("data-type")).toBe("line");

    const { xScale, yScale } = expectedScales();
    const points: Point[] = [
      { x: xScale.center("Jan")!, y: yScale(120) },
      { x: xScale.center("Feb")!, y: yScale(132) },
      { x: xScale.center("Mar")!, y: yScale(101) },
    ];
    const expectedD = linePath(points, "linear", false);

    const stroke = strokeOf(chart);
    expect(stroke).not.toBeNull();
    expect(stroke.getAttribute("fill")).toBe("none");
    expect(stroke.getAttribute("d")).toBe(expectedD);
  });

  it("respects the curve attribute (monotone)", async () => {
    const chart = await mountChart(
      `${TABLE}${AXES}<ui-chart-line key="Revenue" curve="monotone"></ui-chart-line>`,
    );

    const { xScale, yScale } = expectedScales();
    const points: Point[] = [
      { x: xScale.center("Jan")!, y: yScale(120) },
      { x: xScale.center("Feb")!, y: yScale(132) },
      { x: xScale.center("Mar")!, y: yScale(101) },
    ];
    const expectedD = linePath(points, "monotone", false);

    expect(strokeOf(chart).getAttribute("d")).toBe(expectedD);
  });

  it("breaks the line into two subpaths at a null value by default", async () => {
    const chart = await mountChart(
      `${TABLE_WITH_GAP}${AXES}<ui-chart-line key="Revenue"></ui-chart-line>`,
    );

    const { xScale, yScale } = expectedScales();
    const points: Point[] = [
      { x: xScale.center("Jan")!, y: yScale(120) },
      { x: xScale.center("Feb")!, y: null },
      { x: xScale.center("Mar")!, y: yScale(101) },
    ];
    const expectedD = linePath(points, "linear", false);
    const d = strokeOf(chart).getAttribute("d")!;

    expect(d).toBe(expectedD);
    expect((d.match(/M/g) ?? []).length).toBe(2);
  });

  it("bridges the gap into a single subpath when connect-nulls is set", async () => {
    const chart = await mountChart(
      `${TABLE_WITH_GAP}${AXES}<ui-chart-line key="Revenue" connect-nulls></ui-chart-line>`,
    );

    const { xScale, yScale } = expectedScales();
    const points: Point[] = [
      { x: xScale.center("Jan")!, y: yScale(120) },
      { x: xScale.center("Feb")!, y: null },
      { x: xScale.center("Mar")!, y: yScale(101) },
    ];
    const expectedD = linePath(points, "linear", true);
    const d = strokeOf(chart).getAttribute("d")!;

    expect(d).toBe(expectedD);
    expect((d.match(/M/g) ?? []).length).toBe(1);
  });

  it("renders an area path behind the stroke when area is set, filled to the y=0 baseline", async () => {
    const chart = await mountChart(
      `${TABLE}${AXES}<ui-chart-line key="Revenue" area></ui-chart-line>`,
    );

    const group = chart.querySelector('[data-part="series"][data-series="Revenue"]')!;
    const children = Array.from(group.children);
    const areaEl = group.querySelector('[data-part="area"]')!;
    const strokeEl = group.querySelector('[data-part="stroke"]')!;
    expect(areaEl).not.toBeNull();
    // area paints first (behind the stroke) — earlier in document order.
    expect(children.indexOf(areaEl)).toBeLessThan(children.indexOf(strokeEl));
    expect(areaEl.hasAttribute("fill")).toBe(false);

    const { xScale, yScale } = expectedScales();
    const points: Point[] = [
      { x: xScale.center("Jan")!, y: yScale(120) },
      { x: xScale.center("Feb")!, y: yScale(132) },
      { x: xScale.center("Mar")!, y: yScale(101) },
    ];
    const expectedD = areaPath(points, yScale(0), "linear", false);
    expect(areaEl.getAttribute("d")).toBe(expectedD);
  });

  it("renders a mark circle per non-null point when marks is set", async () => {
    const chart = await mountChart(
      `${TABLE_WITH_GAP}${AXES}<ui-chart-line key="Revenue" marks></ui-chart-line>`,
    );

    const group = chart.querySelector('[data-part="series"][data-series="Revenue"]')!;
    const marks = group.querySelectorAll('[data-part="mark"]');
    // 3 rows, 1 null -> 2 non-null marks.
    expect(marks.length).toBe(2);

    // Mark coordinates go through `chart-shape.ts`'s canonical `round` (3
    // digits), the same rounding the path generators already applied — every
    // series type emits coordinates the same way.
    const { xScale, yScale } = expectedScales();
    expect(marks[0]!.getAttribute("cx")).toBe(String(round(xScale.center("Jan")!)));
    expect(marks[0]!.getAttribute("cy")).toBe(String(round(yScale(120))));
    expect(marks[0]!.getAttribute("data-index")).toBe("0");
    expect(marks[1]!.getAttribute("data-index")).toBe("2");
  });

  it("omits marks and area by default", async () => {
    const chart = await mountChart(`${TABLE}${AXES}<ui-chart-line key="Revenue"></ui-chart-line>`);
    const group = chart.querySelector('[data-part="series"][data-series="Revenue"]')!;
    expect(group.querySelectorAll('[data-part="mark"]').length).toBe(0);
    expect(group.querySelector('[data-part="area"]')).toBeNull();
  });

  it("a bare (non-area) line ignores its stack attribute", async () => {
    const chart = await mountChart(`
      ${TABLE}${AXES}
      <ui-chart-line key="Revenue" stack="g"></ui-chart-line>
    `);
    const { xScale, yScale } = expectedScales();
    const points: Point[] = [
      { x: xScale.center("Jan")!, y: yScale(120) },
      { x: xScale.center("Feb")!, y: yScale(132) },
      { x: xScale.center("Mar")!, y: yScale(101) },
    ];
    // Unstacked expectation (raw values), since stack must be ignored without `area`.
    const expectedD = linePath(points, "linear", false);
    expect(strokeOf(chart).getAttribute("d")).toBe(expectedD);
  });

  it("mutates the stored registration in place on attribute change (label)", async () => {
    const chart = await mountChart(
      `${TABLE}${AXES}<ui-chart-line key="Revenue" label="Rev"></ui-chart-line>`,
    );
    const line = chart.querySelector("ui-chart-line")!;
    line.setAttribute("label", "Revenue ($)");
    // Registration mutation doesn't change DOM directly, but requestRender()
    // must not throw and the series group must still be present/consistent.
    expect(chart.querySelectorAll('[data-part="series"][data-series="Revenue"]').length).toBe(1);
  });
});

describe("ui-chart-line: highlight state", () => {
  it("carries highlight/fade on the stroke itself, so a bare line responds at all", async () => {
    // A line's stroke and its area represent no single data row, so they
    // carry no `data-index` and never received per-mark state — which made
    // hovering a legend item visually inert for a line chart. The stroke/area
    // marks now carry the *series'* own state directly (never the group —
    // an ancestor and a descendant both carrying the same attribute would
    // double up under a consumer's `filter`-based CSS).
    const chart = await mountChart(`
      <table>
        <thead><tr><th>Month</th><th>A</th><th>B</th></tr></thead>
        <tbody><tr><td>Jan</td><td>1</td><td>2</td></tr><tr><td>Feb</td><td>3</td><td>4</td></tr></tbody>
      </table>
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left" min="0" max="10"></ui-chart-axis>
      <ui-chart-line key="A"></ui-chart-line>
      <ui-chart-line key="B"></ui-chart-line>
    `);
    const groupA = chart.querySelector('[data-series="A"]')!;
    const groupB = chart.querySelector('[data-series="B"]')!;
    const strokeA = groupA.querySelector('[data-part="stroke"]')!;
    const strokeB = groupB.querySelector('[data-part="stroke"]')!;

    chart.setHighlight({ index: null, series: chart.querySelector<HTMLElement>("ui-chart-line")! });
    expect(strokeA.hasAttribute("data-highlighted")).toBe(true);
    expect(strokeA.hasAttribute("data-faded")).toBe(false);
    expect(strokeB.hasAttribute("data-faded")).toBe(true);
    // Never on the group — see this module's own regression coverage below.
    expect(groupA.hasAttribute("data-highlighted")).toBe(false);
    expect(groupB.hasAttribute("data-faded")).toBe(false);

    chart.setHighlight({ index: null, series: null });
    expect(strokeA.hasAttribute("data-highlighted")).toBe(false);
    expect(strokeB.hasAttribute("data-faded")).toBe(false);
  });

  it("regression: highlighting one series never brightens its siblings via a group-level attribute", async () => {
    // `data-highlighted` used to land on both the series group and its
    // specifically-highlighted mark. SVG's `filter` applies to an element's
    // whole rendered subtree, so a consumer's `filter: brightness()` on that
    // attribute brightened not just the hovered mark but *every* sibling mark
    // beside it too, via the group. Neither attribute is ever set on the
    // group now, for either state.
    const chart = await mountChart(`
      <table>
        <thead><tr><th>Month</th><th>A</th></tr></thead>
        <tbody><tr><td>Jan</td><td>1</td></tr><tr><td>Feb</td><td>3</td></tr></tbody>
      </table>
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left" min="0" max="10"></ui-chart-axis>
      <ui-chart-line key="A" marks></ui-chart-line>
    `);
    const group = chart.querySelector('[data-series="A"]')!;
    const line = chart.querySelector<HTMLElement>("ui-chart-line")!;

    chart.setHighlight({ index: 0, series: line });
    expect(group.hasAttribute("data-highlighted")).toBe(false);
    expect(group.hasAttribute("data-faded")).toBe(false);

    chart.setHighlight({ index: null, series: line });
    expect(group.hasAttribute("data-highlighted")).toBe(false);
  });

  it("fades every mark of an inactive series, matching its own stroke", async () => {
    const chart = await mountChart(`
      <table>
        <thead><tr><th>Month</th><th>A</th><th>B</th></tr></thead>
        <tbody><tr><td>Jan</td><td>1</td><td>2</td></tr><tr><td>Feb</td><td>3</td><td>4</td></tr></tbody>
      </table>
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left" min="0" max="10"></ui-chart-axis>
      <ui-chart-line key="A" marks></ui-chart-line>
      <ui-chart-line key="B" marks></ui-chart-line>
    `);
    chart.setHighlight({ index: null, series: chart.querySelector<HTMLElement>("ui-chart-line")! });

    const groupB = chart.querySelector('[data-series="B"]')!;
    expect(groupB.querySelector('[data-part="stroke"]')!.hasAttribute("data-faded")).toBe(true);
    for (const mark of groupB.querySelectorAll('[data-part="mark"]')) {
      expect(mark.hasAttribute("data-faded")).toBe(true);
    }
  });
});

describe("ui-chart-line: sparkline recipe (values attribute, no dataset/axes)", () => {
  it("plots values evenly across the plot width with no ui-chart-axis children at all", async () => {
    const chart = await mountChart(`<ui-chart-line values="0 10 20 30"></ui-chart-line>`);
    const stroke = chart.querySelector('[data-part="stroke"]')!;
    // 4 values over width 400 -> step 133.333; y spans [0,30] over height 200,
    // inverted (higher value = smaller y): y(0)=200, y(30)=0.
    const points: Point[] = [
      { x: 0, y: 200 },
      { x: 133.333, y: 133.333 },
      { x: 266.667, y: 66.667 },
      { x: 400, y: 0 },
    ];
    expect(stroke.getAttribute("d")).toBe(linePath(points, "linear", false));
  });

  it("supports area fill against the plot's bottom edge in sparkline mode", async () => {
    const chart = await mountChart(`<ui-chart-line values="1 2 3" area></ui-chart-line>`);
    const area = chart.querySelector('[data-part="area"]')!;
    expect(area).not.toBeNull();
    // Baseline is the plot's bottom edge (height), not a data-derived y=0.
    expect(area.getAttribute("d")).toContain(",200");
  });

  it("ignores the values attribute when a real key/dataset is also present (normal mode wins)", async () => {
    const chart = await mountChart(`${TABLE}${AXES}<ui-chart-line key="Revenue"></ui-chart-line>`);
    // Sanity: normal cartesian mode still renders (values was never set here).
    expect(chart.querySelector('[data-part="stroke"]')).not.toBeNull();
  });
});

describe("ui-chart-line: regression — a sharp spike to the data max must not touch the plot's exact pixel edge", () => {
  it("gives the peak headroom via the axis's nice-d domain, instead of landing exactly on y=0", async () => {
    // A real bug: with no explicit axis min/max, the auto-aggregated domain
    // used to be the raw data extrema — so the single highest point mapped to
    // *exactly* pixel y=0 (the plot's own top edge), and its mark/stroke,
    // centered on that point, extended past the box on its own line-width
    // alone. The `<svg>` now clips to its own box either way (charts.css'
    // `.chart > svg { overflow: hidden }` — a chart's plot is a hard visual
    // boundary), so that edge case is no longer *invisible/inconsistent*
    // depending on the surrounding page — but landing exactly on the edge is
    // still bad default appearance (a peak visibly cropped mid-stroke).
    // `chart.ts` now nice-domains the auto-computed extent the same way its
    // own tick generation already does, so the peak sits with real headroom
    // under the top edge instead of touching (and now being cropped by) it.
    const chart = await mountChart(`
      <table>
        <thead><tr><th>Month</th><th>Revenue</th></tr></thead>
        <tbody>
          <tr><td>Jan</td><td>120</td></tr>
          <tr><td>Feb</td><td>132</td></tr>
          <tr><td>Mar</td><td>101</td></tr>
          <tr><td>Apr</td><td>134</td></tr>
          <tr><td>May</td><td>90</td></tr>
          <tr><td>Jun</td><td>230</td></tr>
        </tbody>
      </table>
      ${AXES.replace(' min="0" max="150"', "")}
      <ui-chart-line key="Revenue" curve="monotone" marks></ui-chart-line>
    `);
    const marks = [...chart.querySelectorAll('[data-part="mark"]')];
    expect(marks.length).toBe(6);
    // Jun (230) is the data max — its mark must sit strictly below the
    // plot's top edge (y=0), not on it.
    const jun = marks[5]!;
    expect(Number(jun.getAttribute("cy"))).toBeGreaterThan(0);
    // Domain [90,230] nice-domains (tickCount 6) to [80,240] — every mark
    // stays within that headroom-padded range, none touch y=0 or y=200.
    for (const mark of marks) {
      const cy = Number(mark.getAttribute("cy"));
      expect(cy).toBeGreaterThan(0);
      expect(cy).toBeLessThan(200);
    }
  });
});

describe("ui-chart-line: unstacked area zero baseline", () => {
  const AUTO_AXES = `
    <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
    <ui-chart-axis position="left"></ui-chart-axis>
  `;
  const HIGH_TABLE = `
    <table>
      <thead><tr><th>Month</th><th>Revenue</th></tr></thead>
      <tbody>
        <tr><td>Jan</td><td>101</td></tr>
        <tr><td>Feb</td><td>134</td></tr>
        <tr><td>Mar</td><td>120</td></tr>
      </tbody>
    </table>
  `;

  it("regression: an unstacked area keeps y=0 in the auto-derived domain, so the fill stays inside the plot", async () => {
    // `computeMarks` fills an unstacked area down to `yScale(0)` — the same
    // zero-baseline geometry as a bar — but `getExtremum` used to report only
    // the raw data extent, so with data like [101, 134] the domain excluded 0
    // and the fill extrapolated hundreds of pixels below the plot box.
    const chart = await mountChart(
      `${HIGH_TABLE}${AUTO_AXES}<ui-chart-line key="Revenue" area></ui-chart-line>`,
    );
    const area = chart.querySelector('[data-part="area"]')!;
    const ys = [...area.getAttribute("d")!.matchAll(/,(-?[\d.]+)/g)].map((m) => Number(m[1]));
    expect(ys.length).toBeGreaterThan(0);
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(200.001); // mountChart's default height
    }
    // The baseline genuinely sits at y(0) — the plot's bottom edge, since the
    // merged [0, 134] domain nice-rounds to [0, 140].
    expect(Math.max(...ys)).toBeCloseTo(200, 3);
  });

  it("a bare line with the same data is not forced to a zero baseline", async () => {
    const chart = await mountChart(
      `${HIGH_TABLE}${AUTO_AXES}<ui-chart-line key="Revenue"></ui-chart-line>`,
    );
    // The raw [101, 134] extent nice-rounds to [100, 140] — no tick at 0.
    const axis = chart.querySelectorAll("ui-chart-axis")[1]!;
    const ticks = [...axis.querySelectorAll<HTMLElement>('[data-part="tick"]')].map(
      (t) => t.textContent,
    );
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks).not.toContain("0");
  });
});

describe("ui-chart: batched rendering", () => {
  it("mounts with a single coalesced render, not one per registered child", async () => {
    // Wrap the registered "line" renderer with a counter: `computeMarks` runs
    // exactly once per visible series per full render, so K renders for a
    // 2-line chart would show up as 2K calls here. Mounting used to render
    // once per registration (~7 full renders before first paint).
    const lineType = getSeriesType("line")!;
    let calls = 0;
    registerSeriesType({
      ...lineType,
      computeMarks: (context) => {
        calls += 1;
        return lineType.computeMarks(context);
      },
    });
    try {
      await mountChart(`
        ${TABLE}${AXES}
        <ui-chart-grid axis="y"></ui-chart-grid>
        <ui-chart-line key="Revenue"></ui-chart-line>
        <ui-chart-line key="Revenue" area></ui-chart-line>
      `);
      expect(calls).toBe(2);
    } finally {
      registerSeriesType(lineType);
    }
  });
});
