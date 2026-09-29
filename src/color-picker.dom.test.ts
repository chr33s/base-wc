// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";
import { flush, must } from "./test-utils.ts";

/** The value, or a failure naming the missing element. */
afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-color-picker", () => {
  async function mount(attrs = 'value="#3366ff"') {
    document.body.innerHTML = `<ui-color-picker ${attrs}></ui-color-picker>`;
    await flush();
    return must(document.querySelector("ui-color-picker"));
  }

  it("generates the area, hue and hex controls with slider semantics", async () => {
    const el = await mount();
    const area = must(el.querySelector("[data-color-area]"));
    expect(area.getAttribute("role")).toBe("slider");
    expect(area.getAttribute("aria-valuetext")).toBe("#3366ff");
    expect(must(el.querySelector<HTMLInputElement>("[data-color-hue]")).type).toBe("range");
    expect(must(el.querySelector<HTMLInputElement>("[data-color-hex]")).value).toBe("#3366ff");
  });

  it("round-trips a hex value through .value", async () => {
    const el = await mount('value="#ffffff"');
    expect(el.value).toBe("#ffffff");
    el.value = "#000000";
    expect(el.value).toBe("#000000");
    // A 3-digit hex expands.
    el.value = "#f00";
    expect(el.value).toBe("#ff0000");
  });

  it("editing the hex field updates the value and fires change", async () => {
    const el = await mount();
    let value = "";
    el.addEventListener("change", (e) => (value = (e as CustomEvent).detail.value));
    const hex = must(el.querySelector<HTMLInputElement>("[data-color-hex]"));
    hex.value = "#00ff00";
    hex.dispatchEvent(new Event("change", { bubbles: true }));
    expect(el.value).toBe("#00ff00");
    expect(value).toBe("#00ff00");
  });

  it("rejects an invalid hex and restores the current value", async () => {
    const el = await mount('value="#123456"');
    const hex = must(el.querySelector<HTMLInputElement>("[data-color-hex]"));
    hex.value = "nope";
    hex.dispatchEvent(new Event("change", { bubbles: true }));
    expect(el.value).toBe("#123456");
    expect(hex.value).toBe("#123456");
  });

  it("moving the hue slider changes the value", async () => {
    const el = await mount('value="#ff0000"');
    const hue = must(el.querySelector<HTMLInputElement>("[data-color-hue]"));
    hue.value = "120";
    hue.dispatchEvent(new Event("input", { bubbles: true }));
    expect(el.value).toBe("#00ff00"); // hue 120° at full sat/val = green
  });

  it("formResetCallback restores the value attribute's color", async () => {
    const el = await mount('value="#3366ff"');
    el.value = "#000000";
    expect(el.value).toBe("#000000");
    el.formResetCallback();
    expect(el.value).toBe("#3366ff");
  });

  it("formDisabledCallback disables the inner controls", async () => {
    const el = await mount();
    const hue = must(el.querySelector<HTMLInputElement>("[data-color-hue]"));
    el.formDisabledCallback(true);
    expect(hue.disabled).toBe(true);
    expect(el.hasAttribute("data-disabled")).toBe(true);
    el.formDisabledCallback(false);
    expect(hue.disabled).toBe(false);
    expect(el.hasAttribute("data-disabled")).toBe(false);
  });
});

describe("ui-color-field", () => {
  it("adopts and retires a native color input, writing picks back to it", async () => {
    document.body.innerHTML = `<ui-color-field><input type="color" name="brand" value="#112233" /></ui-color-field>`;
    await flush();
    const field = must(document.querySelector("ui-color-field"));
    const input = must(document.querySelector<HTMLInputElement>("input"));
    expect(input.hidden).toBe(true); // retired, still submitting
    const trigger = must(field.querySelector<HTMLButtonElement>("[data-color-trigger]"));
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");

    const picker = must(field.querySelector("ui-color-picker"));
    picker.dispatchEvent(
      new CustomEvent("change", { bubbles: true, detail: { value: "#abcdef" } }),
    );
    expect(input.value).toBe("#abcdef");
  });

  it("adopts an authored [data-color-trigger] instead of generating one", async () => {
    document.body.innerHTML = `
      <ui-color-field>
        <input type="color" name="brand" value="#112233" />
        <button data-color-trigger aria-label="Pick a brand color">Swatch</button>
      </ui-color-field>`;
    await flush();
    const field = must(document.querySelector("ui-color-field"));
    const triggers = field.querySelectorAll("[data-color-trigger]");
    expect(triggers.length).toBe(1); // adopted, not duplicated
    expect(must(triggers[0]).getAttribute("aria-label")).toBe("Pick a brand color");
    expect(must(triggers[0]).getAttribute("aria-haspopup")).toBe("dialog");
  });
});
