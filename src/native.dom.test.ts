// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";

/** Narrow a lookup the fixture guarantees is present. */
afterEach(() => {
  document.body.innerHTML = "";
});

import { adoptedControl, fireNativeChange, managedDisabled, retireNative } from "./native.ts";
import { must } from "./test-utils.ts";

describe("adoptedControl", () => {
  it("finds an authored control at any depth but not a nested instance's", () => {
    document.body.innerHTML = `
      <ui-select id="outer"><div><select id="mine"></select></div>
        <ui-select><select id="theirs"></select></ui-select>
      </ui-select>`;
    const host = must(document.querySelector("#outer"));
    expect(adoptedControl(host, "select")?.id).toBe("mine");
    expect(adoptedControl(host, "textarea")).toBeNull();
  });
});

describe("retireNative", () => {
  it("hides the control from layout, a11y and tab order", () => {
    document.body.innerHTML = "<input />";
    const input = must(document.querySelector("input"));
    retireNative(input);
    expect(input.hidden).toBe(true);
    expect(input.tabIndex).toBe(-1);
    expect(input.getAttribute("aria-hidden")).toBe("true");
    expect(input.hasAttribute("data-ui-adopted")).toBe(true);
  });
});

describe("fireNativeChange", () => {
  it("dispatches bubbling input then change", () => {
    document.body.innerHTML = "<div><input /></div>";
    const seen: string[] = [];
    const div = must(document.querySelector("div"));
    div.addEventListener("input", () => seen.push("input"));
    div.addEventListener("change", () => seen.push("change"));
    fireNativeChange(must(document.querySelector("input")));
    expect(seen).toEqual(["input", "change"]);
  });
});

describe("managedDisabled", () => {
  it("re-enables only a control it disabled", () => {
    document.body.innerHTML = "<input /><input disabled />";
    const [own, authored] = [...document.querySelectorAll("input")];
    if (!own || !authored) throw new Error("expected two inputs");
    const setOwn = managedDisabled(own);
    setOwn(true);
    expect(own.disabled).toBe(true);
    setOwn(false);
    expect(own.disabled).toBe(false);
    const setAuthored = managedDisabled(authored);
    setAuthored(true);
    setAuthored(false);
    expect(authored.disabled).toBe(true);
  });
});
