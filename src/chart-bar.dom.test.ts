// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./chart-bar.ts";
import "./chart-line.ts";
import "./chart.ts";
import type { UIChart } from "./chart.ts";
import type { UIChartBar } from "./chart-bar.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

// `ui-chart` wires via `connectLightDom`, which defers to a microtask so a
// component can wait for late-authored light-DOM parts. Awaiting one
// microtask flushes it (and every child element's own `connectLightDom`
// microtask, queued in the same tick) — every registration/render after that
// is synchronous, so no further waiting is needed.
async function mountChart(inner: string, size = true): Promise<UIChart> {
  document.body.innerHTML = `<ui-chart${size ? ' width="400" height="200"' : ""}>${inner}</ui-chart>`;
  await Promise.resolve();
  return document.querySelector("ui-chart")!;
}

function rectAttrs(el: Element) {
  return {
    x: el.getAttribute("x") ?? "",
    y: el.getAttribute("y") ?? "",
    width: el.getAttribute("width") ?? "",
    height: el.getAttribute("height") ?? "",
  };
}

const SINGLE_TABLE = `
  <table>
    <thead><tr><th>Month</th><th>Revenue</th></tr></thead>
    <tbody>
      <tr><td>Jan</td><td>120</td></tr>
      <tr><td>Feb</td><td>132</td></tr>
      <tr><td>Mar</td><td>101</td></tr>
    </tbody>
  </table>
`;

describe("ui-chart-bar: attributes", () => {
  it("reads key/stack/label with sensible defaults", () => {
    const bar = document.createElement("ui-chart-bar") as UIChartBar;
    expect(bar.key).toBe("");
    expect(bar.stack).toBeUndefined();
    expect(bar.label).toBeUndefined();
    // The shared attribute surface every series element inherits.
    expect(bar.highlightScope).toEqual({ highlight: "item", fade: "global" });
  });

  it("reads key/stack/label/highlight/fade from attributes", () => {
    const bar = document.createElement("ui-chart-bar") as UIChartBar;
    bar.setAttribute("key", "Revenue");
    bar.setAttribute("stack", "totals");
    bar.setAttribute("label", "Monthly revenue");
    bar.setAttribute("highlight", "series");
    bar.setAttribute("fade", "none");
    expect(bar.key).toBe("Revenue");
    expect(bar.stack).toBe("totals");
    expect(bar.label).toBe("Monthly revenue");
    expect(bar.highlightScope).toEqual({ highlight: "series", fade: "none" });
  });
});

describe("ui-chart-bar: registration", () => {
  it("registers a series group with the right data-* marks", async () => {
    const chart = await mountChart(
      `${SINGLE_TABLE}
       <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
       <ui-chart-axis position="left" min="0" max="150"></ui-chart-axis>
       <ui-chart-bar key="Revenue" label="Revenue $"></ui-chart-bar>`,
    );
    const group = chart.querySelector('[data-part="series"]');
    expect(group).not.toBeNull();
    expect(group!.getAttribute("data-type")).toBe("bar");
    expect(group!.getAttribute("data-series")).toBe("Revenue");
    expect((group as HTMLElement).dataset.seriesIndex).toBe("0");

    const marks = chart.querySelectorAll('[data-part="mark"]');
    expect(marks.length).toBe(3);
    marks.forEach((mark, i) => {
      expect(mark.tagName.toLowerCase()).toBe("rect");
      expect(mark.getAttribute("data-index")).toBe(String(i));
    });
  });
});

describe("ui-chart-bar: single-series geometry", () => {
  it("positions/sizes bars exactly against hand-computed band + linear scale math", async () => {
    // x: bandScale(["Jan","Feb","Mar"], [0,400], {paddingInner:0.3, paddingOuter:0.15})
    //   -> bandwidth 93.333, starts at 20 / 153.333 / 286.667
    // y: linearScale([0,150], [200,0]) -> y(v) = 200 - (4/3)v
    //   y(0)=200, y(120)=40, y(132)=24, y(101)=65.333...
    const chart = await mountChart(
      `${SINGLE_TABLE}
       <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
       <ui-chart-axis position="left" min="0" max="150"></ui-chart-axis>
       <ui-chart-bar key="Revenue"></ui-chart-bar>`,
    );
    const marks = [...chart.querySelectorAll('[data-part="mark"]')];
    expect(marks.length).toBe(3);

    expect(rectAttrs(marks[0]!)).toEqual({ x: "20", y: "40", width: "93.333", height: "160" });
    expect(rectAttrs(marks[1]!)).toEqual({
      x: "153.333",
      y: "24",
      width: "93.333",
      height: "176",
    });
    expect(rectAttrs(marks[2]!)).toEqual({
      x: "286.667",
      y: "65.333",
      width: "93.333",
      height: "134.667",
    });
  });

  it("skips rendering marks when there is no band x-axis", async () => {
    const chart = await mountChart(
      `${SINGLE_TABLE}<ui-chart-axis position="left" min="0" max="150"></ui-chart-axis><ui-chart-bar key="Revenue"></ui-chart-bar>`,
    );
    expect(chart.querySelectorAll('[data-part="mark"]').length).toBe(0);
  });

  it("regression: keeps the value axis zero-inclusive with no explicit min/max, so bars never extrapolate past the plot", async () => {
    // Without a forced zero baseline, an aggregated domain of just [101,132]
    // (the raw data range) would make yScale(0) extrapolate far outside
    // [0, plotHeight] — a bar's y0 is always 0, so 0 must always be in-domain.
    const chart = await mountChart(
      `${SINGLE_TABLE}
       <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
       <ui-chart-axis position="left"></ui-chart-axis>
       <ui-chart-bar key="Revenue"></ui-chart-bar>`,
    );
    const marks = [...chart.querySelectorAll('[data-part="mark"]')];
    expect(marks.length).toBe(3);
    for (const mark of marks) {
      const { y, height } = rectAttrs(mark);
      expect(Number(y)).toBeGreaterThanOrEqual(0);
      expect(Number(y) + Number(height)).toBeLessThanOrEqual(200.001); // mountChart's default height
    }
    // Feb (132) is the largest value. The axis domain is "nice"-d outward
    // (see the niceLinearDomain regression test below) to [0, 140] rather
    // than the raw [0, 132] — so Feb's bar sits *near* the top with a little
    // headroom, not touching the plot's exact pixel edge.
    const feb = rectAttrs(marks[1]!);
    expect(Number(feb.y)).toBeGreaterThan(0);
    expect(Number(feb.y)).toBeCloseTo(11.429, 2);
    expect(Number(feb.height)).toBeCloseTo(188.571, 2);
  });
});

describe("ui-chart-bar: stacking", () => {
  it("stacks a second series' y0 exactly where the first series' y1 ends", async () => {
    // y: linearScale([0,150], [200,0]) -> y(v) = 200 - (4/3)v
    //   y(0)=200, y(40)=146.667, y(100)=66.667
    // A 3-category domain (Jan/Feb/Mar) so the band scale matches the same
    // bandwidth (93.333) / start (20) math used throughout this file — only
    // Jan's marks are asserted on below.
    const chart = await mountChart(
      `<table>
         <thead><tr><th>Month</th><th>A</th><th>B</th></tr></thead>
         <tbody>
           <tr><td>Jan</td><td>40</td><td>60</td></tr>
           <tr><td>Feb</td><td>10</td><td>20</td></tr>
           <tr><td>Mar</td><td>30</td><td>15</td></tr>
         </tbody>
       </table>
       <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
       <ui-chart-axis position="left" min="0" max="150"></ui-chart-axis>
       <ui-chart-bar key="A" stack="totals"></ui-chart-bar>
       <ui-chart-bar key="B" stack="totals"></ui-chart-bar>`,
    );
    const groupA = chart.querySelector('[data-series="A"]')!;
    const groupB = chart.querySelector('[data-series="B"]')!;
    const markA = rectAttrs(groupA.querySelector('[data-part="mark"][data-index="0"]')!);
    const markB = rectAttrs(groupB.querySelector('[data-part="mark"][data-index="0"]')!);

    // A: y0=0 -> 200, y1=40 -> 146.667
    expect(markA).toEqual({ x: "20", y: "146.667", width: "93.333", height: "53.333" });
    // B: y0=40 -> 146.667, y1=100 -> 66.667
    expect(markB).toEqual({ x: "20", y: "66.667", width: "93.333", height: "80" });

    // The shared boundary: A's top edge (y) meets B's bottom edge (y + height).
    const bBottom = Number(markB.y) + Number(markB.height);
    expect(bBottom).toBeCloseTo(Number(markA.y), 3);

    // Both stacked series share the full bandwidth (no side-by-side split).
    expect(markA.x).toBe(markB.x);
    expect(markA.width).toBe("93.333");
  });
});

describe("ui-chart-bar: grouping", () => {
  it("splits the bandwidth between unstacked sibling series, side-by-side without overlap", async () => {
    // bandwidth 93.333 / 2 series = 46.667 each; series 0 at bandStart,
    // series 1 at bandStart + 46.667.
    const chart = await mountChart(
      `<table>
         <thead><tr><th>Month</th><th>A</th><th>B</th></tr></thead>
         <tbody>
           <tr><td>Jan</td><td>40</td><td>70</td></tr>
           <tr><td>Feb</td><td>55</td><td>20</td></tr>
           <tr><td>Mar</td><td>10</td><td>90</td></tr>
         </tbody>
       </table>
       <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
       <ui-chart-axis position="left" min="0" max="100"></ui-chart-axis>
       <ui-chart-bar key="A"></ui-chart-bar>
       <ui-chart-bar key="B"></ui-chart-bar>`,
    );
    const groupA = chart.querySelector('[data-series="A"]')!;
    const groupB = chart.querySelector('[data-series="B"]')!;
    const marksA = [...groupA.querySelectorAll('[data-part="mark"]')];
    const marksB = [...groupB.querySelectorAll('[data-part="mark"]')];
    expect(marksA.length).toBe(3);
    expect(marksB.length).toBe(3);

    const expectedWidth = "46.667";
    for (let i = 0; i < 3; i++) {
      const a = rectAttrs(marksA[i]!);
      const b = rectAttrs(marksB[i]!);
      expect(a.width).toBe(expectedWidth);
      expect(b.width).toBe(expectedWidth);
      // Side-by-side, not overlapping: series B starts exactly where A ends
      // (each side independently rounded to 3 decimals, so allow the ~0.001
      // combined quantization error rather than exact equality).
      expect(Number(b.x)).toBeCloseTo(Number(a.x) + Number(a.width), 2);
    }

    // First category's absolute positions, hand-computed from the band scale.
    expect(rectAttrs(marksA[0]!).x).toBe("20");
    expect(rectAttrs(marksB[0]!).x).toBe("66.667");
  });

  it("regression: re-splits the band across the remaining bars when one is hidden", async () => {
    // The group used to come from a module-level side table that tracked every
    // bar element regardless of visibility, so hiding the middle series left
    // its column empty and the other two at a third of the band each.
    const chart = await mountChart(
      `<table>
         <thead><tr><th>Month</th><th>A</th><th>B</th><th>C</th></tr></thead>
         <tbody>
           <tr><td>Jan</td><td>40</td><td>70</td><td>20</td></tr>
           <tr><td>Feb</td><td>55</td><td>20</td><td>35</td></tr>
           <tr><td>Mar</td><td>10</td><td>90</td><td>60</td></tr>
         </tbody>
       </table>
       <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
       <ui-chart-axis position="left" min="0" max="100"></ui-chart-axis>
       <ui-chart-bar key="A"></ui-chart-bar>
       <ui-chart-bar key="B"></ui-chart-bar>
       <ui-chart-bar key="C"></ui-chart-bar>`,
    );
    const firstMark = (key: string) =>
      rectAttrs(chart.querySelector(`[data-series="${key}"] [data-part="mark"][data-index="0"]`)!);
    // bandwidth 93.333 / 3
    expect(firstMark("A").width).toBe("31.111");

    chart.setSeriesHidden(chart.querySelector<HTMLElement>('ui-chart-bar[key="B"]')!, true);

    // bandwidth 93.333 / 2, and C moves up into the freed column.
    expect(firstMark("A")).toMatchObject({ x: "20", width: "46.667" });
    expect(firstMark("C")).toMatchObject({ x: "66.667", width: "46.667" });

    chart.setSeriesHidden(chart.querySelector<HTMLElement>('ui-chart-bar[key="B"]')!, false);
    expect(firstMark("A").width).toBe("31.111");
    expect(firstMark("C").x).toBe("82.222");
  });

  it("treats an empty stack attribute as unstacked, not as a shared group", async () => {
    const chart = await mountChart(
      `<table>
         <thead><tr><th>Month</th><th>A</th><th>B</th></tr></thead>
         <tbody><tr><td>Jan</td><td>40</td><td>30</td></tr></tbody>
       </table>
       <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
       <ui-chart-axis position="left" min="0" max="100"></ui-chart-axis>
       <ui-chart-bar key="A" stack=""></ui-chart-bar>
       <ui-chart-bar key="B" stack=""></ui-chart-bar>`,
    );
    const b = rectAttrs(chart.querySelector('[data-series="B"] [data-part="mark"]')!);
    // y: linearScale([0,100],[200,0]) -> y(v) = 200 - 2v. Unstacked, B runs
    // from 0 to 30 (y=140, height 60); stacked on A it would start at 40.
    expect(b).toMatchObject({ y: "140", height: "60" });
    // …and they sit side by side, which is what unstacked siblings do.
    expect(chart.querySelector<UIChartBar>('ui-chart-bar[key="A"]')!.stack).toBeUndefined();
  });

  it("gives each stack group its own column alongside unstacked siblings", async () => {
    const chart = await mountChart(
      `<table>
         <thead><tr><th>Month</th><th>A</th><th>B</th><th>C</th></tr></thead>
         <tbody><tr><td>Jan</td><td>40</td><td>30</td><td>20</td></tr></tbody>
       </table>
       <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
       <ui-chart-axis position="left" min="0" max="100"></ui-chart-axis>
       <ui-chart-bar key="A" stack="totals"></ui-chart-bar>
       <ui-chart-bar key="B" stack="totals"></ui-chart-bar>
       <ui-chart-bar key="C"></ui-chart-bar>`,
    );
    const firstMark = (key: string) =>
      rectAttrs(chart.querySelector(`[data-series="${key}"] [data-part="mark"]`)!);
    // Two slots: the "totals" stack, then the unstacked C — a single band
    // domain (one category) makes the bandwidth the full 400 - padding.
    const a = firstMark("A");
    const b = firstMark("B");
    const c = firstMark("C");
    expect(a.x).toBe(b.x);
    expect(a.width).toBe(b.width);
    expect(Number(c.x)).toBeCloseTo(Number(a.x) + Number(a.width), 2);
    expect(c.width).toBe(a.width);
  });
});

describe("ui-chart-bar: stack-offset", () => {
  const MIXED = `
    <table>
      <thead><tr><th>Month</th><th>A</th><th>B</th></tr></thead>
      <tbody><tr><td>Jan</td><td>40</td><td>-20</td></tr></tbody>
    </table>
    <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
    <ui-chart-axis position="left" min="-50" max="50"></ui-chart-axis>
    <ui-chart-bar key="A" stack="totals"></ui-chart-bar>
    <ui-chart-bar key="B" stack="totals"></ui-chart-bar>
  `;

  it('accumulates through zero by default (offset "none")', async () => {
    const chart = await mountChart(MIXED);
    // y: linearScale([-50,50],[200,0]) -> y(v) = 100 - 2v
    // B stacks on A's total: y0=40 (y=20), y1=20 (y=60).
    expect(rectAttrs(chart.querySelector('[data-series="B"] [data-part="mark"]')!)).toMatchObject({
      y: "20",
      height: "40",
    });
  });

  it('splits above/below the baseline with stack-offset="diverging"', async () => {
    document.body.innerHTML = `<ui-chart width="400" height="200" stack-offset="diverging">${MIXED}</ui-chart>`;
    await Promise.resolve();
    const chart = document.querySelector("ui-chart")!;
    expect(chart.stackOffset).toBe("diverging");
    // B is negative, so it starts at the zero baseline and goes down:
    // y0=-20 (y=140), y1=0 (y=100).
    expect(rectAttrs(chart.querySelector('[data-series="B"] [data-part="mark"]')!)).toMatchObject({
      y: "100",
      height: "40",
    });
  });
});

describe("ui-chart-bar: identity", () => {
  it("stays hidden across a DOM move", async () => {
    document.body.innerHTML = `<div id="from"></div><div id="to"></div>`;
    const chart = document.createElement("ui-chart");
    chart.setAttribute("width", "400");
    chart.setAttribute("height", "200");
    chart.innerHTML = `${SINGLE_TABLE}
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left" min="0" max="150"></ui-chart-axis>
      <ui-chart-bar key="Revenue"></ui-chart-bar>`;
    document.querySelector("#from")!.append(chart);
    await Promise.resolve();

    const bar = chart.querySelector<HTMLElement>("ui-chart-bar")!;
    chart.setSeriesHidden(bar, true);
    expect(chart.isSeriesHidden(bar)).toBe(true);

    // Moving unregisters and re-registers every child series; a series hidden
    // through the legend must not come back visible because of it.
    document.querySelector("#to")!.append(chart);
    await Promise.resolve();
    expect(chart.isSeriesHidden(bar)).toBe(true);
    expect(chart.querySelectorAll('[data-part="mark"]').length).toBe(0);
  });

  it("draws a bar for every row, including two rows sharing one date instant", async () => {
    // Band lookups compared `Date` cells by object identity, so the second row
    // for a given day — a different Date object with the same instant, which is
    // what parsing two <time> cells produces — resolved to no band and its bar
    // was silently dropped.
    const chart = await mountChart(
      `<table>
         <thead><tr><th>Day</th><th>A</th></tr></thead>
         <tbody>
           <tr><td><time datetime="2026-01-01">Jan 1</time></td><td>5</td></tr>
           <tr><td><time datetime="2026-01-01">Jan 1</time></td><td>7</td></tr>
           <tr><td><time datetime="2026-01-02">Jan 2</time></td><td>9</td></tr>
         </tbody>
       </table>
       <ui-chart-axis position="bottom" key="Day" scale="band"></ui-chart-axis>
       <ui-chart-axis position="left" min="0" max="10"></ui-chart-axis>
       <ui-chart-bar key="A"></ui-chart-bar>`,
    );
    expect(chart.data.length).toBe(3);
    // Two distinct days -> two bands; all three rows still get a bar.
    const bands = [...chart.querySelectorAll<SVGRectElement>('[data-part="band"]')];
    expect(bands.length).toBe(2);
    expect(chart.querySelectorAll('[data-part="mark"]').length).toBe(3);

    // A band reports the data row it stands for, not its slot in the domain:
    // hovering the second column must highlight row 2 (Jan 2), not row 1
    // (which is the *second* Jan 1 row).
    expect(bands.map((band) => band.dataset.index)).toEqual(["0", "2"]);
  });
});

describe("ui-chart-bar: combo chart", () => {
  it("regression: a bar and a line over the same column both render", async () => {
    // Mark elements used to be pooled per dataset column across the whole
    // chart, so these two series fought over one set: the bar group came out
    // empty and the line's point marks were the bar's <rect>s with circle
    // attributes on them. Nothing was drawn.
    const chart = await mountChart(
      `${SINGLE_TABLE}
       <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
       <ui-chart-axis position="left" min="0" max="150"></ui-chart-axis>
       <ui-chart-bar key="Revenue"></ui-chart-bar>
       <ui-chart-line key="Revenue" marks></ui-chart-line>`,
    );

    const bars = chart.querySelectorAll('[data-type="bar"] [data-part="mark"]');
    const points = chart.querySelectorAll('[data-type="line"] [data-part="mark"]');
    expect(bars.length).toBe(3);
    expect(points.length).toBe(3);
    for (const bar of bars) expect(bar.tagName.toLowerCase()).toBe("rect");
    for (const point of points) expect(point.tagName.toLowerCase()).toBe("circle");
    expect(chart.querySelector('[data-type="line"] [data-part="stroke"]')).not.toBeNull();
  });
});

describe("ui-chart-bar: interaction", () => {
  it("dispatches ui-chart's select event with the clicked bar's series/index/value", async () => {
    const chart = await mountChart(
      `${SINGLE_TABLE}
       <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
       <ui-chart-axis position="left" min="0" max="150"></ui-chart-axis>
       <ui-chart-bar key="Revenue"></ui-chart-bar>`,
    );
    const events: unknown[] = [];
    chart.addEventListener("select", (e) => events.push((e as CustomEvent).detail));

    const mark = chart.querySelectorAll('[data-part="mark"]')[1]!; // Feb, value 132
    mark.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(events).toEqual([{ series: "Revenue", seriesIndex: 0, index: 1, value: 132 }]);
  });
});
