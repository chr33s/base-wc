// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import { isRTL } from "./direction.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isRTL", () => {
  function mount(html: string) {
    document.body.innerHTML = html;
    const el = document.querySelector("#el");
    if (!el) throw new Error("missing #el");
    return el;
  }

  it("reads the nearest [dir] ancestor", () => {
    expect(isRTL(mount('<div dir="rtl"><span id="el"></span></div>'))).toBe(true);
    expect(isRTL(mount('<div dir="ltr"><span id="el"></span></div>'))).toBe(false);
  });

  it("lets a nearer [dir] override a farther one", () => {
    const el = mount('<div dir="rtl"><div dir="ltr"><span id="el"></span></div></div>');
    expect(isRTL(el)).toBe(false);
  });

  it("treats the attribute value case-insensitively", () => {
    expect(isRTL(mount('<div dir="RTL"><span id="el"></span></div>'))).toBe(true);
  });

  it("falls back to computed direction, defaulting to left-to-right", () => {
    expect(isRTL(mount('<span id="el"></span>'))).toBe(false);
    const el = mount('<span id="el" style="direction: rtl"></span>');
    expect(isRTL(el)).toBe(true);
  });
});
