// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";

async function mount(controlAttrs = "required") {
  document.body.innerHTML = `
    <ui-field>
      <label data-field-label>Email</label>
      <input data-field-control type="email" ${controlAttrs} />
      <p data-field-description>We never share it.</p>
      <p data-field-error>Please enter a valid email.</p>
    </ui-field>`;
  await Promise.resolve();
  const field = document.querySelector("ui-field")!;
  const label = document.querySelector<HTMLLabelElement>("[data-field-label]")!;
  const control = document.querySelector<HTMLInputElement>("[data-field-control]")!;
  const description = document.querySelector<HTMLElement>("[data-field-description]")!;
  const error = document.querySelector<HTMLElement>("[data-field-error]")!;
  return { field, label, control, description, error };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-field", () => {
  it("cross-references label and description by IDREF", async () => {
    const { label, control, description } = await mount();
    expect(label.htmlFor).toBe(control.id);
    expect(control.getAttribute("aria-labelledby")).toBe(label.id);
    expect(control.getAttribute("aria-describedby")).toBe(description.id);
  });

  it("does not show errors before the field is touched", async () => {
    const { control, error } = await mount();
    expect(error.hidden).toBe(true);
    expect(control.hasAttribute("aria-invalid")).toBe(false);
  });

  it("reveals the error on blur and links it via aria-describedby", async () => {
    const { control, description, error } = await mount(); // empty required → invalid
    control.dispatchEvent(new Event("blur"));
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(error.hidden).toBe(false);
    expect(control.getAttribute("aria-describedby")).toBe(`${description.id} ${error.id}`);
  });

  it("clears the error once the value becomes valid", async () => {
    const { control, description, error } = await mount();
    control.dispatchEvent(new Event("blur")); // show error
    control.value = "a@b.com";
    control.dispatchEvent(new Event("input"));
    expect(control.hasAttribute("aria-invalid")).toBe(false);
    expect(error.hidden).toBe(true);
    expect(control.getAttribute("aria-describedby")).toBe(description.id);
  });

  it("validate() returns validity and forces the error display", async () => {
    const { field, control, error } = await mount();
    expect(field.validate()).toBe(false);
    expect(error.hidden).toBe(false);
    control.value = "a@b.com";
    expect(field.validate()).toBe(true);
    expect(error.hidden).toBe(true);
  });
});
