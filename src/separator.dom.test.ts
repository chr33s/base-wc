// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";
import { must } from "./test-utils.ts";

/** Narrow a lookup the fixture guarantees is present. */
afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-separator", () => {
  it("defaults to a horizontal separator", () => {
    document.body.innerHTML = "<ui-separator></ui-separator>";
    const el = must(document.querySelector("ui-separator"));
    expect(el.getAttribute("role")).toBe("separator");
    expect(el.getAttribute("aria-orientation")).toBe("horizontal");
  });

  it("reflects a vertical orientation", () => {
    document.body.innerHTML = '<ui-separator orientation="vertical"></ui-separator>';
    const el = must(document.querySelector("ui-separator"));
    expect(el.getAttribute("aria-orientation")).toBe("vertical");
  });

  it("drops out of the a11y tree when decorative", () => {
    document.body.innerHTML = "<ui-separator decorative></ui-separator>";
    const el = must(document.querySelector("ui-separator"));
    expect(el.getAttribute("role")).toBe("none");
    expect(el.hasAttribute("aria-orientation")).toBe(false);
  });
});

describe("ui-separator — role-constrained containers", () => {
  it("demotes itself inside a listbox, whose children may only be options or groups", async () => {
    document.body.innerHTML = `
      <ui-select>
        <button data-select-trigger><span data-select-value>Pick</span></button>
        <ui-select-popup>
          <ui-select-option value="a">A</ui-select-option>
          <ui-separator></ui-separator>
          <ui-select-option value="b">B</ui-select-option>
        </ui-select-popup>
      </ui-select>`;
    await Promise.resolve();
    await Promise.resolve(); // the root's deferred wiring, then the separator's re-read
    const popup = must(document.querySelector("ui-select-popup"));
    const separator = must(document.querySelector("ui-separator"));
    expect(popup.getAttribute("role")).toBe("listbox");
    // A `separator` child makes the listbox invalid; the rule stays visible,
    // the semantics go.
    expect(separator.getAttribute("role")).toBe("none");
    expect(separator.hasAttribute("aria-orientation")).toBe(false);
  });

  it("keeps separator semantics inside a menu, where the role is valid", async () => {
    document.body.innerHTML = `
      <ui-menu>
        <button data-menu-trigger>Options</button>
        <ui-menu-popup>
          <ui-menu-item value="a">A</ui-menu-item>
          <ui-separator></ui-separator>
          <ui-menu-item value="b">B</ui-menu-item>
        </ui-menu-popup>
      </ui-menu>`;
    await Promise.resolve();
    await Promise.resolve();
    expect(must(document.querySelector("ui-separator")).getAttribute("role")).toBe("separator");
  });
});
