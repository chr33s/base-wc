// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";

/** Narrow a lookup the fixture guarantees is present. */
afterEach(() => {
  document.body.innerHTML = "";
});

import { syncRangeState } from "./range.ts";
import { must } from "./test-utils.ts";

function mount(): HTMLElement {
  document.body.innerHTML = "<div></div>";
  return must(document.querySelector("div"));
}

describe("syncRangeState", () => {
  it("clamps, mirrors aria values and publishes the fraction", () => {
    const el = mount();
    const state = syncRangeState(el, { min: 0, max: 10, value: 15, property: "--f" });
    expect(state).toEqual({ value: 10, fraction: 1 });
    expect(el.getAttribute("aria-valuenow")).toBe("10");
    expect(el.getAttribute("aria-valuetext")).toBe("100%");
    expect(el.style.getPropertyValue("--f")).toBe("1");
  });

  it("yields fraction 0 for a degenerate range", () => {
    const el = mount();
    expect(syncRangeState(el, { min: 5, max: 5, value: 5, property: "--f" }).fraction).toBe(0);
  });

  it("formats the clamped value when given format options", () => {
    const el = mount();
    syncRangeState(el, {
      min: 0,
      max: 100,
      value: 50,
      property: "--f",
      format: { style: "currency", currency: "USD" },
      locale: "en-US",
    });
    expect(el.getAttribute("aria-valuetext")).toBe("$50.00");
  });

  it("falls back to a plain number on an unsupported option", () => {
    const el = mount();
    syncRangeState(el, {
      min: 0,
      max: 100,
      value: 50,
      property: "--f",
      format: { style: "currency" },
    });
    expect(el.getAttribute("aria-valuetext")).toBe("50");
  });
});
