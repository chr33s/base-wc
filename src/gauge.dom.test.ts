// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import { arcPath } from "./chart-shape.ts";
import "./gauge.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

const DEG2RAD = Math.PI / 180;

/** Recompute the same geometry `ui-gauge` uses internally, for assertions. */
function expectedArc(
  options: {
    min?: number;
    max?: number;
    value: number;
    startAngle?: number;
    endAngle?: number;
    thickness?: number;
    viewBox?: number;
  } = { value: 0 },
) {
  const min = options.min ?? 0;
  const max = options.max ?? 100;
  const startAngleDeg = options.startAngle ?? -120;
  const endAngleDeg = options.endAngle ?? 120;
  const thickness = options.thickness ?? 12;
  const viewBox = options.viewBox ?? 200;

  const clamped = Math.max(min, Math.min(options.value, max));
  const fraction = max > min ? (clamped - min) / (max - min) : 0;

  const startAngle = startAngleDeg * DEG2RAD;
  const endAngle = endAngleDeg * DEG2RAD;
  const valueAngle = startAngle + fraction * (endAngle - startAngle);

  const outerRadius = viewBox / 2 - 4;
  const innerRadius = outerRadius - thickness;
  const cx = viewBox / 2;
  const cy = viewBox / 2;

  return {
    fraction,
    track: arcPath({ innerRadius, outerRadius, startAngle, endAngle, cx, cy }),
    value: arcPath({ innerRadius, outerRadius, startAngle, endAngle: valueAngle, cx, cy }),
  };
}

describe("ui-gauge", () => {
  it("exposes role=meter with aria-value* mirroring value/min/max", () => {
    document.body.innerHTML = `<ui-gauge value="30" min="0" max="60"></ui-gauge>`;
    const el = document.querySelector("ui-gauge")!;
    expect(el.getAttribute("role")).toBe("meter");
    expect(el.getAttribute("aria-valuemin")).toBe("0");
    expect(el.getAttribute("aria-valuemax")).toBe("60");
    expect(el.getAttribute("aria-valuenow")).toBe("30");
  });

  it("defaults min/max/start-angle/end-angle/thickness when omitted", () => {
    document.body.innerHTML = `<ui-gauge value="50"></ui-gauge>`;
    const el = document.querySelector("ui-gauge")! as import("./gauge.ts").UIGauge;
    expect(el.min).toBe(0);
    expect(el.max).toBe(100);
    expect(el.startAngle).toBe(-120);
    expect(el.endAngle).toBe(120);
    expect(el.thickness).toBe(12);
  });

  it("renders a single aria-hidden svg with track and value paths", () => {
    document.body.innerHTML = `<ui-gauge value="10"></ui-gauge>`;
    const el = document.querySelector("ui-gauge")!;
    const svgs = el.querySelectorAll("svg");
    expect(svgs.length).toBe(1);
    expect(svgs[0]!.getAttribute("aria-hidden")).toBe("true");
    expect(el.querySelector('path[data-part="track"]')).not.toBeNull();
    expect(el.querySelector('path[data-part="value"]')).not.toBeNull();
  });

  it("neither path sets a fill (unstyled defaults to currentColor/black)", () => {
    document.body.innerHTML = `<ui-gauge value="10"></ui-gauge>`;
    const el = document.querySelector("ui-gauge")!;
    expect(el.querySelector('[data-part="track"]')!.hasAttribute("fill")).toBe(false);
    expect(el.querySelector('[data-part="value"]')!.hasAttribute("fill")).toBe(false);
  });

  it("computes --gauge as 0 at min", () => {
    document.body.innerHTML = `<ui-gauge value="0" min="0" max="100"></ui-gauge>`;
    const el = document.querySelector("ui-gauge")! as HTMLElement;
    expect(el.style.getPropertyValue("--gauge")).toBe("0");
  });

  it("computes --gauge as 0.5 at the midpoint", () => {
    document.body.innerHTML = `<ui-gauge value="50" min="0" max="100"></ui-gauge>`;
    const el = document.querySelector("ui-gauge")! as HTMLElement;
    expect(el.style.getPropertyValue("--gauge")).toBe("0.5");
  });

  it("computes --gauge as 1 at max", () => {
    document.body.innerHTML = `<ui-gauge value="100" min="0" max="100"></ui-gauge>`;
    const el = document.querySelector("ui-gauge")! as HTMLElement;
    expect(el.style.getPropertyValue("--gauge")).toBe("1");
  });

  it("clamps an out-of-range value, both above max and below min", () => {
    document.body.innerHTML = `<ui-gauge value="250" min="0" max="100"></ui-gauge>`;
    const above = document.querySelector("ui-gauge")! as HTMLElement;
    expect(above.getAttribute("aria-valuenow")).toBe("100");
    expect(above.style.getPropertyValue("--gauge")).toBe("1");

    document.body.innerHTML = `<ui-gauge value="-50" min="0" max="100"></ui-gauge>`;
    const below = document.querySelector("ui-gauge")! as HTMLElement;
    expect(below.getAttribute("aria-valuenow")).toBe("0");
    expect(below.style.getPropertyValue("--gauge")).toBe("0");
  });

  it("draws the track arc across the full start-angle..end-angle span regardless of value", () => {
    document.body.innerHTML = `<ui-gauge value="10" min="0" max="100"></ui-gauge>`;
    const el = document.querySelector("ui-gauge")!;
    const expected = expectedArc({ value: 10 });
    expect(el.querySelector('[data-part="track"]')!.getAttribute("d")).toBe(expected.track);

    document.body.innerHTML = `<ui-gauge value="90" min="0" max="100"></ui-gauge>`;
    const el2 = document.querySelector("ui-gauge")!;
    const expected2 = expectedArc({ value: 90 });
    // Track ignores the value entirely — same span both times.
    expect(expected.track).toBe(expected2.track);
    expect(el2.querySelector('[data-part="track"]')!.getAttribute("d")).toBe(expected2.track);
  });

  it("grows the value arc's angular span as the value increases", () => {
    document.body.innerHTML = `<ui-gauge value="0" min="0" max="100"></ui-gauge>`;
    const atZero = document
      .querySelector("ui-gauge")!
      .querySelector('[data-part="value"]')!
      .getAttribute("d")!;
    expect(atZero).toBe(expectedArc({ value: 0 }).value);

    document.body.innerHTML = `<ui-gauge value="25" min="0" max="100"></ui-gauge>`;
    const atQuarter = document
      .querySelector("ui-gauge")!
      .querySelector('[data-part="value"]')!
      .getAttribute("d")!;
    expect(atQuarter).toBe(expectedArc({ value: 25 }).value);

    document.body.innerHTML = `<ui-gauge value="100" min="0" max="100"></ui-gauge>`;
    const atFull = document
      .querySelector("ui-gauge")!
      .querySelector('[data-part="value"]')!
      .getAttribute("d")!;
    expect(atFull).toBe(expectedArc({ value: 100 }).value);

    // Sanity: three different spans, none accidentally equal.
    expect(new Set([atZero, atQuarter, atFull]).size).toBe(3);
  });

  it("matches the track arc when value hits max (value arc == full span)", () => {
    document.body.innerHTML = `<ui-gauge value="100" min="0" max="100"></ui-gauge>`;
    const el = document.querySelector("ui-gauge")!;
    const trackD = el.querySelector('[data-part="track"]')!.getAttribute("d");
    const valueD = el.querySelector('[data-part="value"]')!.getAttribute("d");
    expect(valueD).toBe(trackD);
  });

  it("honors custom start-angle/end-angle attributes", () => {
    document.body.innerHTML = `<ui-gauge value="50" min="0" max="100" start-angle="-90" end-angle="90"></ui-gauge>`;
    const el = document.querySelector("ui-gauge")!;
    const expected = expectedArc({ value: 50, startAngle: -90, endAngle: 90 });
    expect(el.querySelector('[data-part="track"]')!.getAttribute("d")).toBe(expected.track);
    expect(el.querySelector('[data-part="value"]')!.getAttribute("d")).toBe(expected.value);
  });

  it("changes the inner radius (and thus the rendered path) with thickness", () => {
    document.body.innerHTML = `<ui-gauge value="50" min="0" max="100" thickness="12"></ui-gauge>`;
    const thin = document
      .querySelector("ui-gauge")!
      .querySelector('[data-part="track"]')!
      .getAttribute("d")!;
    expect(thin).toBe(expectedArc({ value: 50, thickness: 12 }).track);

    document.body.innerHTML = `<ui-gauge value="50" min="0" max="100" thickness="40"></ui-gauge>`;
    const thick = document
      .querySelector("ui-gauge")!
      .querySelector('[data-part="track"]')!
      .getAttribute("d")!;
    expect(thick).toBe(expectedArc({ value: 50, thickness: 40 }).track);

    expect(thin).not.toBe(thick);
  });

  it("uses explicit width/height attributes for the viewBox instead of the 200x200 default", () => {
    document.body.innerHTML = `<ui-gauge value="50" width="300" height="150"></ui-gauge>`;
    const el = document.querySelector("ui-gauge")!;
    const svg = el.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 300 150");
    const expected = expectedArc({ value: 50 });
    void expected; // geometry re-derivation below uses the 300x150 viewBox, not the default
    const outerRadius = Math.min(300, 150) / 2 - 4;
    const innerRadius = outerRadius - 12;
    const cx = 150;
    const cy = 75;
    const startAngle = -120 * DEG2RAD;
    const endAngle = 120 * DEG2RAD;
    const expectedTrack = arcPath({ innerRadius, outerRadius, startAngle, endAngle, cx, cy });
    expect(el.querySelector('[data-part="track"]')!.getAttribute("d")).toBe(expectedTrack);
  });

  it("defaults to a 200x200 viewBox when no width/height attributes are set", () => {
    document.body.innerHTML = `<ui-gauge value="50"></ui-gauge>`;
    const el = document.querySelector("ui-gauge")!;
    expect(el.querySelector("svg")!.getAttribute("viewBox")).toBe("0 0 200 200");
  });

  it("updates on attribute changes after connection", () => {
    document.body.innerHTML = `<ui-gauge value="0" min="0" max="100"></ui-gauge>`;
    const el = document.querySelector("ui-gauge")! as HTMLElement;
    expect(el.style.getPropertyValue("--gauge")).toBe("0");
    el.setAttribute("value", "75");
    expect(el.getAttribute("aria-valuenow")).toBe("75");
    expect(el.style.getPropertyValue("--gauge")).toBe("0.75");
  });
});
