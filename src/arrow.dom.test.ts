// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import { arrowOffset } from "./anchor.ts";
import "./elements.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-arrow", () => {
  it("is decorative with a default side", async () => {
    document.body.innerHTML = `<ui-arrow></ui-arrow>`;
    const arrow = document.querySelector("ui-arrow")!;
    expect(arrow.getAttribute("aria-hidden")).toBe("true");
    expect(arrow.getAttribute("data-side")).toBe("bottom");
  });

  it("keeps an explicit side", async () => {
    document.body.innerHTML = `<ui-arrow data-side="top"></ui-arrow>`;
    expect(document.querySelector("ui-arrow")!.getAttribute("data-side")).toBe("top");
  });
});

describe("arrowOffset", () => {
  const A = 10; // arrow size
  const P = 8; // padding

  it("centers the arrow on the reference when there is room", () => {
    // reference center 100, popup [50, 250] (size 200) → 100 - 50 - 5 = 45
    expect(arrowOffset(100, 50, 200, A, P)).toBe(45);
  });

  it("clamps to the near edge when the reference is past the start", () => {
    // reference center 40, popup starts at 50 → ideal negative → clamp to padding
    expect(arrowOffset(40, 50, 200, A, P)).toBe(P);
  });

  it("clamps to the far edge when the reference is past the end", () => {
    // reference center 1000, popup [50,250] → clamp to size - arrow - padding
    expect(arrowOffset(1000, 50, 200, A, P)).toBe(200 - A - P);
  });

  it("never exceeds the near edge even for a tiny popup", () => {
    // popup smaller than arrow + padding → max collapses to padding
    expect(arrowOffset(100, 50, 12, A, P)).toBe(P);
  });
});
