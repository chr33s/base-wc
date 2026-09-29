// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import "./elements.ts";
import { must } from "./test-utils.ts";

/** The value, or a failure naming the missing element. */
async function mount(controlAttrs = "required") {
  document.body.innerHTML = `
    <ui-field>
      <label data-field-label>Email</label>
      <input data-field-control type="email" ${controlAttrs} />
      <p data-field-description>We never share it.</p>
      <p data-field-error>Please enter a valid email.</p>
    </ui-field>`;
  await Promise.resolve();
  const field = must(document.querySelector("ui-field"));
  const label = must(document.querySelector<HTMLLabelElement>("[data-field-label]"));
  const control = must(document.querySelector<HTMLInputElement>("[data-field-control]"));
  const description = must(document.querySelector<HTMLElement>("[data-field-description]"));
  const error = must(document.querySelector<HTMLElement>("[data-field-error]"));
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
    expect(field.reportValidity()).toBe(false);
    expect(error.hidden).toBe(false);
    control.value = "a@b.com";
    expect(field.reportValidity()).toBe(true);
    expect(error.hidden).toBe(true);
  });

  it("validates a library control through the form-control layer (required otp)", async () => {
    document.body.innerHTML = `
      <ui-field>
        <label data-field-label>Code</label>
        <ui-otp-field data-field-control name="code" length="4" required></ui-otp-field>
        <p data-field-error>Enter the code.</p>
      </ui-field>`;
    await new Promise((r) => setTimeout(r, 0));
    const field = must(document.querySelector("ui-field"));
    const otp = must(document.querySelector("ui-otp-field"));
    const error = must(document.querySelector<HTMLElement>("[data-field-error]"));

    expect(field.reportValidity()).toBe(false); // empty + required → valueMissing
    expect(error.hidden).toBe(false);
    expect(error.textContent).toBe("Please fill out this field."); // real validationMessage
    expect(otp.getAttribute("aria-invalid")).toBe("true");

    otp.value = "1234";
    expect(field.reportValidity()).toBe(true);
    expect(error.hidden).toBe(true);
    expect(otp.hasAttribute("aria-invalid")).toBe(false);
  });
});

describe("ui-field state attributes", () => {
  it("mirrors touched / focused / filled / dirty onto the host", async () => {
    const { field, control } = await mount("");
    expect(field.hasAttribute("data-filled")).toBe(false);
    expect(field.hasAttribute("data-dirty")).toBe(false);

    control.dispatchEvent(new Event("focus"));
    expect(field.hasAttribute("data-focused")).toBe(true);

    control.value = "a@b.com";
    control.dispatchEvent(new Event("input", { bubbles: true }));
    expect(field.hasAttribute("data-filled")).toBe(true);
    expect(field.hasAttribute("data-dirty")).toBe(true);

    control.dispatchEvent(new Event("blur"));
    expect(field.hasAttribute("data-focused")).toBe(false);
    expect(field.hasAttribute("data-touched")).toBe(true);
  });

  it("judges dirty against the value it was wired with", async () => {
    document.body.innerHTML = `
      <ui-field><input data-field-control value="preset" /></ui-field>`;
    await Promise.resolve();
    const field = must(document.querySelector("ui-field"));
    // Populated from markup is not the user having changed anything.
    expect(field.hasAttribute("data-dirty")).toBe(false);
  });
});

describe("ui-field custom validation", () => {
  it("publishes a synchronous rule through the control's own validity", async () => {
    const { field, control, error } = await mount("");
    field.validate = (value) => (value.endsWith("@work.com") ? null : "Use your work address.");
    control.value = "a@home.com";

    expect(field.reportValidity()).toBe(false);
    // Routed through setCustomValidity, so a real form submit sees it too.
    expect(control.validity.customError).toBe(true);
    expect(control.validationMessage).toBe("Use your work address.");
    expect(error.hidden).toBe(false);
    expect(error.textContent).toBe("Use your work address.");
    expect(field.hasAttribute("data-invalid")).toBe(true);
  });

  it("reports only the first of several messages", async () => {
    const { field, control } = await mount("");
    field.validate = () => ["Too short.", "No digits."];
    control.value = "a@b.com";
    field.reportValidity();
    expect(control.validationMessage).toBe("Too short.");
  });

  it("lets a native constraint outrank the custom rule", async () => {
    const { field, control } = await mount("required");
    const rule = vi.fn(() => "custom");
    field.validate = rule;
    control.value = ""; // valueMissing

    expect(field.reportValidity()).toBe(false);
    expect(control.validity.valueMissing).toBe(true);
    // Nothing an async check could add while a real failure is already known.
    expect(rule).not.toHaveBeenCalled();
  });

  it("clears a stale custom error so required can report again", async () => {
    const { field, control } = await mount("required");
    field.validate = (value) => (value === "bad@x.com" ? "Not that one." : null);
    control.value = "bad@x.com";
    field.reportValidity();
    expect(control.validity.customError).toBe(true);

    // Emptying the field must surface valueMissing, not the old custom error —
    // a lingering customError would keep the control invalid for the wrong reason.
    control.value = "";
    field.reportValidity();
    expect(control.validity.customError).toBe(false);
    expect(control.validity.valueMissing).toBe(true);
  });

  it("publishes neither valid nor invalid while an async check is in flight", async () => {
    const { field, control } = await mount("");
    let settle: (message: string | null) => void = () => {};
    field.validate = () => new Promise<string | null>((resolve) => (settle = resolve));
    control.value = "someone@x.com";

    field.reportValidity();
    expect(field.validating).toBe(true);
    expect(field.hasAttribute("data-valid")).toBe(false);
    expect(field.hasAttribute("data-invalid")).toBe(false);
    expect(control.hasAttribute("aria-invalid")).toBe(false);

    settle("Already taken.");
    await Promise.resolve();
    await Promise.resolve();
    expect(field.validating).toBe(false);
    expect(field.hasAttribute("data-invalid")).toBe(true);
    expect(control.validationMessage).toBe("Already taken.");
  });

  it("discards a slow result for a value the user has moved past", async () => {
    const { field, control } = await mount("");
    const pending: ((message: string | null) => void)[] = [];
    field.validate = () => new Promise<string | null>((resolve) => pending.push(resolve));

    control.value = "first@x.com";
    field.reportValidity();
    control.value = "second@x.com";
    field.reportValidity();

    must(pending[1])(null); // the newer check clears
    must(pending[0])("stale error"); // the older one answers late
    await Promise.resolve();
    await Promise.resolve();

    expect(control.validity.customError).toBe(false);
  });

  it("leaves the field clear when the check itself fails", async () => {
    const { field, control } = await mount("");
    field.validate = () => Promise.reject(new Error("network"));
    control.value = "a@b.com";

    field.reportValidity();
    await Promise.resolve();
    await Promise.resolve();
    // A failed request is not an assertion that the value is bad.
    expect(field.validating).toBe(false);
    expect(control.validity.customError).toBe(false);
  });

  it("runs on blur in blur mode", async () => {
    const { field, control } = await mount("");
    field.setAttribute("validation-mode", "blur");
    field.validate = () => "nope";
    control.value = "a@b.com";

    control.dispatchEvent(new Event("input", { bubbles: true }));
    expect(control.validity.customError).toBe(false); // not yet

    control.dispatchEvent(new Event("blur"));
    expect(control.validity.customError).toBe(true);
  });

  it("runs on every change in change mode", async () => {
    const { field, control } = await mount("");
    field.setAttribute("validation-mode", "change");
    field.validate = (value) => (value === "ok@x.com" ? null : "nope");

    control.value = "no@x.com";
    control.dispatchEvent(new Event("input", { bubbles: true }));
    expect(control.validity.customError).toBe(true);

    control.value = "ok@x.com";
    control.dispatchEvent(new Event("input", { bubbles: true }));
    expect(control.validity.customError).toBe(false);
  });
});
