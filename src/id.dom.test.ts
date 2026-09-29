// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { labelFrom, nextId } from "./id.ts";

describe("nextId", () => {
  it("prefixes ids and never repeats one", () => {
    const ids = Array.from({ length: 50 }, () => nextId("ui-thing"));
    expect(new Set(ids).size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^ui-thing-\d+$/);
  });

  it("keeps prefixes from sharing a numbering space collision", () => {
    expect(nextId("a")).not.toBe(nextId("b"));
  });
});

describe("labelFrom", () => {
  function parts() {
    const surface = document.createElement("div");
    const part = document.createElement("h2");
    return { surface, part };
  }

  it("generates an id for an id-less part and points the attribute at it", () => {
    const { surface, part } = parts();
    labelFrom(surface, "aria-labelledby", part, "ui-title");
    expect(part.id).toMatch(/^ui-title-\d+$/);
    expect(surface.getAttribute("aria-labelledby")).toBe(part.id);
  });

  it("keeps an authored id", () => {
    const { surface, part } = parts();
    part.id = "mine";
    labelFrom(surface, "aria-describedby", part, "ui-desc");
    expect(part.id).toBe("mine");
    expect(surface.getAttribute("aria-describedby")).toBe("mine");
  });

  it("does nothing when the part is absent", () => {
    const { surface } = parts();
    labelFrom(surface, "aria-labelledby", null, "ui-title");
    expect(surface.hasAttribute("aria-labelledby")).toBe(false);
  });
});
