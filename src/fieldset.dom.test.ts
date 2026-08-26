// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";

async function mount(attrs = "") {
  document.body.innerHTML = `
    <ui-fieldset ${attrs}>
      <span data-fieldset-legend>Shipping</span>
      <input id="name" />
      <input id="street" disabled />
    </ui-fieldset>`;
  await Promise.resolve();
  const fieldset = document.querySelector("ui-fieldset")!;
  const legend = document.querySelector<HTMLElement>("[data-fieldset-legend]")!;
  const name = document.querySelector<HTMLInputElement>("#name")!;
  const street = document.querySelector<HTMLInputElement>("#street")!;
  return { fieldset, legend, name, street };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-fieldset", () => {
  it("is a labelled group", async () => {
    const { fieldset, legend } = await mount();
    expect(fieldset.getAttribute("role")).toBe("group");
    expect(fieldset.getAttribute("aria-labelledby")).toBe(legend.id);
  });

  it("propagates disabled to descendant controls", async () => {
    const { name } = await mount("disabled");
    expect(name.hasAttribute("disabled")).toBe(true);
  });

  it("re-enables only the controls it disabled, preserving own-disabled ones", async () => {
    const { fieldset, name, street } = await mount("disabled");
    expect(name.hasAttribute("disabled")).toBe(true);
    expect(street.hasAttribute("disabled")).toBe(true);
    fieldset.removeAttribute("disabled");
    expect(name.hasAttribute("disabled")).toBe(false); // was enabled → re-enabled
    expect(street.hasAttribute("disabled")).toBe(true); // was disabled on its own → left alone
  });

  it("propagates to every library form control (derived from FORM_CONTROL_TAGS)", async () => {
    document.body.innerHTML = `
      <ui-fieldset>
        <ui-otp-field name="code" length="4"></ui-otp-field>
        <ui-calendar name="date" value="2026-07-15"></ui-calendar>
      </ui-fieldset>`;
    await new Promise((r) => setTimeout(r, 0));
    const fieldset = document.querySelector("ui-fieldset")!;
    const otp = document.querySelector("ui-otp-field")!;
    const calendar = document.querySelector("ui-calendar")!;
    const cell = otp.querySelector("input")!;
    const day = () => calendar.querySelector<HTMLButtonElement>("[data-calendar-day]")!;

    fieldset.setAttribute("disabled", "");
    expect(otp.hasAttribute("disabled")).toBe(true);
    expect(cell.disabled).toBe(true);
    expect(calendar.hasAttribute("disabled")).toBe(true);
    expect(day().disabled).toBe(true);

    fieldset.removeAttribute("disabled");
    expect(otp.hasAttribute("disabled")).toBe(false);
    expect(cell.disabled).toBe(false);
    expect(calendar.hasAttribute("disabled")).toBe(false);
    expect(day().disabled).toBe(false);
  });
});
