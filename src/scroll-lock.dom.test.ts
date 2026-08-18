// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import { lockScroll } from "./scroll-lock.ts";

afterEach(() => {
  // Defensive: ensure nothing leaks the module-level lock between tests.
  document.documentElement.style.overflow = "";
  document.body.style.paddingRight = "";
});

describe("lockScroll", () => {
  it("freezes and restores document overflow", () => {
    const root = document.documentElement;
    const before = root.style.overflow;
    const unlock = lockScroll();
    expect(root.style.overflow).toBe("hidden");
    unlock();
    expect(root.style.overflow).toBe(before);
  });

  it("is reference-counted so stacked overlays only unlock once", () => {
    const root = document.documentElement;
    const unlockA = lockScroll();
    const unlockB = lockScroll();
    expect(root.style.overflow).toBe("hidden");
    unlockA();
    expect(root.style.overflow).toBe("hidden"); // B still holds it
    unlockB();
    expect(root.style.overflow).toBe("");
  });

  it("has an idempotent unlock", () => {
    const root = document.documentElement;
    const unlock = lockScroll();
    unlock();
    unlock(); // must not underflow the counter
    expect(root.style.overflow).toBe("");
    // A fresh lock still works after the double-release.
    const unlock2 = lockScroll();
    expect(root.style.overflow).toBe("hidden");
    unlock2();
  });
});
