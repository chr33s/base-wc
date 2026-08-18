// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";

// `ui-switch` is a pure enhancer of an authored native checkbox. Wiring is
// deferred a microtask (so the child has parsed); tests await it.
async function mount(inputAttrs = "") {
  document.body.innerHTML = `<form><ui-switch><input type="checkbox" name="notify" ${inputAttrs} /></ui-switch></form>`;
  await Promise.resolve();
  const form = document.querySelector("form")!;
  const el = document.querySelector("ui-switch")!;
  const input = document.querySelector<HTMLInputElement>("input")!;
  return { form, el, input };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-switch", () => {
  it("adopts the native checkbox: announces it as a switch and mirrors state", async () => {
    const { el, input } = await mount("checked");
    expect(input.getAttribute("role")).toBe("switch");
    // A role=switch needs aria-checked to convey on/off to assistive tech.
    expect(input.getAttribute("aria-checked")).toBe("true");
    expect(el.checked).toBe(true);
    expect(el.getAttribute("data-state")).toBe("checked");
    // The host is not itself a form control — the native input is.
    expect(el.getAttribute("role")).toBe(null);
  });

  it("keeps aria-checked in step with the native checked state", async () => {
    const { el, input } = await mount();
    expect(input.getAttribute("aria-checked")).toBe("false");
    el.checked = true;
    expect(input.getAttribute("aria-checked")).toBe("true");
  });

  it("the native checkbox is the form value, with or without JS", async () => {
    const { form, input } = await mount();
    expect(new FormData(form).get("notify")).toBe(null); // unchecked → omitted
    input.checked = true;
    expect(new FormData(form).get("notify")).toBe("on");
  });

  it("mirrors state onto data-state when the native control changes", async () => {
    const { el, input } = await mount();
    expect(el.getAttribute("data-state")).toBe("unchecked");
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(el.getAttribute("data-state")).toBe("checked");
    expect(el.checked).toBe(true);
  });

  it("toggling via the checked setter drives the native control + state hook", async () => {
    const { el, input } = await mount();
    el.checked = true;
    expect(input.checked).toBe(true);
    expect(el.getAttribute("data-state")).toBe("checked");
  });

  it("reflects the disabled state of the native control", async () => {
    const { el } = await mount("disabled");
    expect(el.disabled).toBe(true);
    expect(el.hasAttribute("data-disabled")).toBe(true);
  });

  it("no-ops without an authored native control", async () => {
    document.body.innerHTML = `<ui-switch></ui-switch>`;
    await Promise.resolve();
    const el = document.querySelector("ui-switch")!;
    expect(el.checked).toBe(false);
    expect(el.getAttribute("data-state")).toBe(null);
  });
});
