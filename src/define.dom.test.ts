// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { define } from "./define.ts";

describe("define", () => {
  it("registers a custom element", () => {
    class UIDefineProbe extends HTMLElement {}
    define("ui-define-probe", UIDefineProbe);
    expect(customElements.get("ui-define-probe")).toBe(UIDefineProbe);
  });

  it("is idempotent: a second define neither throws nor replaces the first", () => {
    class First extends HTMLElement {}
    class Second extends HTMLElement {}
    define("ui-define-idempotent", First);
    expect(() => define("ui-define-idempotent", Second)).not.toThrow();
    expect(customElements.get("ui-define-idempotent")).toBe(First);
  });
});
