// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-color-picker", () => {
  async function mount(attrs = 'value="#3366ff"') {
    document.body.innerHTML = `<ui-color-picker ${attrs}></ui-color-picker>`;
    await flush();
    return document.querySelector("ui-color-picker")!;
  }

  it("generates the area, hue and hex controls with slider semantics", async () => {
    const el = await mount();
    const area = el.querySelector("[data-color-area]")!;
    expect(area.getAttribute("role")).toBe("slider");
    expect(area.getAttribute("aria-valuetext")).toBe("#3366ff");
    expect(el.querySelector<HTMLInputElement>("[data-color-hue]")!.type).toBe("range");
    expect(el.querySelector<HTMLInputElement>("[data-color-hex]")!.value).toBe("#3366ff");
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
    const hex = el.querySelector<HTMLInputElement>("[data-color-hex]")!;
    hex.value = "#00ff00";
    hex.dispatchEvent(new Event("change", { bubbles: true }));
    expect(el.value).toBe("#00ff00");
    expect(value).toBe("#00ff00");
  });

  it("rejects an invalid hex and restores the current value", async () => {
    const el = await mount('value="#123456"');
    const hex = el.querySelector<HTMLInputElement>("[data-color-hex]")!;
    hex.value = "nope";
    hex.dispatchEvent(new Event("change", { bubbles: true }));
    expect(el.value).toBe("#123456");
    expect(hex.value).toBe("#123456");
  });

  it("moving the hue slider changes the value", async () => {
    const el = await mount('value="#ff0000"');
    const hue = el.querySelector<HTMLInputElement>("[data-color-hue]")!;
    hue.value = "120";
    hue.dispatchEvent(new Event("input", { bubbles: true }));
    expect(el.value).toBe("#00ff00"); // hue 120° at full sat/val = green
  });
});

describe("ui-color-field", () => {
  it("adopts and retires a native color input, writing picks back to it", async () => {
    document.body.innerHTML = `<ui-color-field><input type="color" name="brand" value="#112233" /></ui-color-field>`;
    await flush();
    const field = document.querySelector("ui-color-field")!;
    const input = document.querySelector<HTMLInputElement>("input")!;
    expect(input.hidden).toBe(true); // retired, still submitting
    const trigger = field.querySelector<HTMLButtonElement>("[data-color-trigger]")!;
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");

    const picker = field.querySelector("ui-color-picker")!;
    picker.dispatchEvent(
      new CustomEvent("change", { bubbles: true, detail: { value: "#abcdef" } }),
    );
    expect(input.value).toBe("#abcdef");
  });
});
