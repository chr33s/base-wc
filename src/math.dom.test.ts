// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { clamp, clampSnap } from "./math.ts";

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
