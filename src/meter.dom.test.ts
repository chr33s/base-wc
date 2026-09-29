// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";
import { must } from "./test-utils.ts";

/** Narrow a lookup the fixture guarantees is present. */
afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-meter", () => {
  it("exposes role=meter with clamped aria values", () => {
    document.body.innerHTML = '<ui-meter value="150" min="0" max="100"></ui-meter>';
    const el = must(document.querySelector("ui-meter"));
    expect(el.getAttribute("role")).toBe("meter");
    expect(el.getAttribute("aria-valuemin")).toBe("0");
    expect(el.getAttribute("aria-valuemax")).toBe("100");
    expect(el.getAttribute("aria-valuenow")).toBe("100");
    expect(el.style.getPropertyValue("--meter")).toBe("1");
  });

  it("announces a percentage by default and honours a format", () => {
    document.body.innerHTML = '<ui-meter value="25"></ui-meter>';
    const el = must(document.querySelector("ui-meter"));
    expect(el.getAttribute("aria-valuetext")).toBe("25%");
    el.format = { style: "unit", unit: "percent" };
    expect(el.getAttribute("aria-valuetext")).toContain("25");
  });

  it("classifies the value against low/high/optimum regions", () => {
    document.body.innerHTML = '<ui-meter value="50" low="30" high="70" optimum="50"></ui-meter>';
    const el = must(document.querySelector("ui-meter"));
    expect(el.getAttribute("data-state")).toBe("optimal");
    el.setAttribute("value", "20");
    expect(el.getAttribute("data-state")).toBe("suboptimal");
    el.setAttribute("optimum", "90");
    expect(el.getAttribute("data-state")).toBe("poor");
  });
});
