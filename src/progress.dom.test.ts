// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";
import { must } from "./test-utils.ts";

/** Narrow a lookup the fixture guarantees is present. */
afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-progress", () => {
  it("reports a determinate value and loading state", () => {
    document.body.innerHTML = '<ui-progress value="40"></ui-progress>';
    const el = must(document.querySelector("ui-progress"));
    expect(el.getAttribute("role")).toBe("progressbar");
    expect(el.getAttribute("aria-valuenow")).toBe("40");
    expect(el.getAttribute("data-state")).toBe("loading");
    expect(el.style.getPropertyValue("--progress")).toBe("0.4");
    expect(el.indeterminate).toBe(false);
  });

  it("completes at the maximum", () => {
    document.body.innerHTML = '<ui-progress value="100"></ui-progress>';
    expect(must(document.querySelector("ui-progress")).getAttribute("data-state")).toBe("complete");
  });

  it("drops aria-valuenow when indeterminate", () => {
    document.body.innerHTML = "<ui-progress></ui-progress>";
    const el = must(document.querySelector("ui-progress"));
    expect(el.indeterminate).toBe(true);
    expect(el.hasAttribute("aria-valuenow")).toBe(false);
    expect(el.hasAttribute("aria-valuetext")).toBe(false);
    expect(el.getAttribute("data-state")).toBe("indeterminate");
    el.setAttribute("value", "10");
    expect(el.getAttribute("aria-valuenow")).toBe("10");
  });
});
