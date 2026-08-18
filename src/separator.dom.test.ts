// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-separator", () => {
  it("defaults to a horizontal separator", () => {
    document.body.innerHTML = "<ui-separator></ui-separator>";
    const el = document.querySelector("ui-separator")!;
    expect(el.getAttribute("role")).toBe("separator");
    expect(el.getAttribute("aria-orientation")).toBe("horizontal");
  });

  it("reflects a vertical orientation", () => {
    document.body.innerHTML = '<ui-separator orientation="vertical"></ui-separator>';
    const el = document.querySelector("ui-separator")!;
    expect(el.getAttribute("aria-orientation")).toBe("vertical");
  });

  it("drops out of the a11y tree when decorative", () => {
    document.body.innerHTML = "<ui-separator decorative></ui-separator>";
    const el = document.querySelector("ui-separator")!;
    expect(el.getAttribute("role")).toBe("none");
    expect(el.hasAttribute("aria-orientation")).toBe(false);
  });
});
