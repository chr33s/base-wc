// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { clamp, clampSnap, numberAttribute, toNumber } from "./math.ts";

describe("clamp", () => {
  it("clamps into [min, max]", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe("clampSnap", () => {
  it("snaps to the step grid anchored at min", () => {
    expect(clampSnap(7, { min: 0, max: 100, step: 5 })).toBe(5);
    expect(clampSnap(8, { min: 0, max: 100, step: 5 })).toBe(10);
    // Grid anchored at min=1: allowed values are 1, 3, 5, …
    expect(clampSnap(4, { min: 1, max: 9, step: 2 })).toBe(5);
  });

  it("clamps into [min, max] after snapping", () => {
    expect(clampSnap(999, { min: 0, max: 100, step: 5 })).toBe(100);
    expect(clampSnap(-3, { min: 0, max: 100, step: 5 })).toBe(0);
  });

  it("treats absent bounds as unbounded (grid anchored at 0)", () => {
    expect(clampSnap(7.4, { step: 1 })).toBe(7);
    expect(clampSnap(-12.6, { min: null, max: null, step: 5 })).toBe(-15);
  });

  it("trims float noise from the grid arithmetic", () => {
    expect(clampSnap(0.3, { min: 0, max: 1, step: 0.1 })).toBe(0.3);
    expect(clampSnap(0.1 + 0.2, { min: 0, max: 1, step: 0.1 })).toBe(0.3);
  });
});

describe("clamp invariants", () => {
  const cases: ReadonlyArray<[n: number, min: number, max: number]> = [
    [0, -5, 5],
    [-100, -5, 5],
    [100, -5, 5],
    [3, 3, 3],
    [-0.5, -1, 0],
    [1e9, 0, 1],
  ];

  it.each(cases)("clamp(%d, %d, %d) lands inside the range and is idempotent", (n, min, max) => {
    const once = clamp(n, min, max);
    expect(once).toBeGreaterThanOrEqual(min);
    expect(once).toBeLessThanOrEqual(max);
    expect(clamp(once, min, max)).toBe(once);
  });

  it("returns values already in range unchanged", () => {
    for (const n of [-5, -1, 0, 0.25, 5]) expect(clamp(n, -5, 5)).toBe(n);
  });
});

describe("clampSnap invariants", () => {
  const bounds = [
    { min: 0, max: 100, step: 5 },
    { min: 1, max: 9, step: 2 },
    { min: -1, max: 1, step: 0.1 },
    { step: 0.5 },
  ];
  const inputs = [-1000, -3.3, -0.05, 0, 0.04, 1.7, 7, 42.42, 99.99, 1000];

  it("is idempotent, in range, and lands on the grid anchored at min", () => {
    for (const b of bounds) {
      for (const n of inputs) {
        const v = clampSnap(n, b);
        expect(clampSnap(v, b)).toBe(v);
        if (b.min != null) expect(v).toBeGreaterThanOrEqual(b.min);
        if (b.max != null) expect(v).toBeLessThanOrEqual(b.max);
        const base = b.min ?? 0;
        const steps = (v - base) / b.step;
        const atMax = b.max != null && v === b.max;
        if (!atMax) expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-6);
      }
    }
  });

  it("is monotonic in its input", () => {
    for (const b of bounds) {
      let previous = -Infinity;
      for (const n of [...inputs].sort((x, y) => x - y)) {
        const v = clampSnap(n, b);
        expect(v).toBeGreaterThanOrEqual(previous);
        previous = v;
      }
    }
  });
});

describe("toNumber", () => {
  const cases: ReadonlyArray<[raw: string | null | undefined, expected: number | undefined]> = [
    ["12", 12],
    ["-3.5", -3.5],
    ["0", 0],
    [" 7 ", 7],
    ["1e3", 1000],
    ["", undefined],
    ["   ", undefined],
    [null, undefined],
    [undefined, undefined],
    ["soon", undefined],
    ["NaN", undefined],
    ["Infinity", undefined],
    ["-Infinity", undefined],
  ];

  it.each(cases)("toNumber(%j) is %j", (raw, expected) => {
    expect(toNumber(raw)).toBe(expected);
  });

  it("yields the fallback exactly when there is no finite number", () => {
    for (const [raw, expected] of cases) {
      expect(toNumber(raw, 99)).toBe(expected ?? 99);
    }
  });

  it("keeps a legitimate zero instead of falling back", () => {
    expect(toNumber("0", 5)).toBe(0);
  });
});

describe("numberAttribute", () => {
  function el(attrs: Record<string, string>) {
    const node = document.createElement("div");
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    return node;
  }

  it("reads a numeric attribute", () => {
    expect(numberAttribute(el({ delay: "250" }), "delay", 600)).toBe(250);
    expect(numberAttribute(el({ delay: "250" }), "delay")).toBe(250);
  });

  it("treats absent, empty and unparsable alike", () => {
    for (const attrs of [{}, { delay: "" }, { delay: "soon" }]) {
      expect(numberAttribute(el(attrs), "delay", 600)).toBe(600);
      expect(numberAttribute(el(attrs), "delay")).toBeUndefined();
    }
  });

  it("keeps an authored zero", () => {
    expect(numberAttribute(el({ delay: "0" }), "delay", 600)).toBe(0);
  });
});
