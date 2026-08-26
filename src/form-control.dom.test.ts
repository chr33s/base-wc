// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { FORM_CONTROL_TAGS } from "./form-control.ts";
import "./elements.ts";

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.innerHTML = "";
});

describe("FORM_CONTROL_TAGS", () => {
  it("lists every form-value-bearing tag and no pure enhancers", () => {
    for (const tag of [
      "ui-calendar",
      "ui-color-picker",
      "ui-otp-field",
      "ui-radio-group",
      "ui-number-field",
      "ui-slider",
      "ui-select",
      "ui-combobox",
      "ui-autocomplete",
    ]) {
      expect(FORM_CONTROL_TAGS).toContain(tag);
    }
    for (const tag of ["ui-toggle", "ui-switch", "ui-checkbox", "ui-date-field"]) {
      expect(FORM_CONTROL_TAGS).not.toContain(tag);
    }
  });
});

describe("required / valueMissing (via ui-otp-field)", () => {
  it("reports valueMissing while empty and turns valid once filled", async () => {
    document.body.innerHTML = `<ui-otp-field name="code" length="4" required></ui-otp-field>`;
    await flush();
    const otp = document.querySelector("ui-otp-field")!;
    expect(otp.validity.valueMissing).toBe(true);
    expect(otp.validity.valid).toBe(false);
    expect(otp.validationMessage).toBe("Please fill out this field.");

    const onInvalid = vi.fn<(e: Event) => void>();
    otp.addEventListener("invalid", onInvalid);
    expect(otp.checkValidity()).toBe(false);
    expect(onInvalid).toHaveBeenCalledTimes(1);

    otp.value = "1234";
    expect(otp.validity.valid).toBe(true);
    expect(otp.validationMessage).toBe("");
    expect(otp.checkValidity()).toBe(true);
    expect(onInvalid).toHaveBeenCalledTimes(1); // no second invalid event
  });
});

describe("adopted-native mode stays inert", () => {
  it("a native-mode host reports valid even with required (the input validates)", async () => {
    document.body.innerHTML = `
      <ui-slider required><input type="range" name="v" value="40" /></ui-slider>`;
    await flush();
    const slider = document.querySelector("ui-slider")!;
    // The adopted native input is the submitting control; the host's own
    // constraint validation must not double up on top of it.
    expect(slider.validity.valid).toBe(true);
    expect(slider.checkValidity()).toBe(true);
  });
});
