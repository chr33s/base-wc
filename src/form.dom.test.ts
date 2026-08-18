// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import "./elements.ts";

async function mount() {
  document.body.innerHTML = `
    <ui-form>
      <form>
        <p data-form-error-summary hidden></p>
        <ui-field>
          <label data-field-label>Name</label>
          <input id="name" data-field-control required />
          <p data-field-error>Required.</p>
        </ui-field>
        <ui-field>
          <label data-field-label>Email</label>
          <input id="email" data-field-control type="email" value="a@b.com" />
          <p data-field-error>Invalid.</p>
        </ui-field>
        <button type="submit">Submit</button>
      </form>
    </ui-form>`;
  await Promise.resolve();
  const uiForm = document.querySelector("ui-form")!;
  const form = document.querySelector("form")!;
  const name = document.querySelector<HTMLInputElement>("#name")!;
  const summary = document.querySelector<HTMLElement>("[data-form-error-summary]")!;
  return { uiForm, form, name, summary };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-form", () => {
  it("blocks submit when a field is invalid and focuses the first one", async () => {
    const { uiForm, form, name, summary } = await mount();
    const onInvalid = vi.fn<(e: Event) => void>();
    uiForm.addEventListener("form-invalid", onInvalid);
    const event = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(name);
    expect(summary.hidden).toBe(false);
    expect(onInvalid).toHaveBeenCalledTimes(1);
    expect(name.getAttribute("aria-invalid")).toBe("true");
  });

  it("allows submit and emits form-valid once all fields pass", async () => {
    const { uiForm, form, name, summary } = await mount();
    const onValid = vi.fn<(e: Event) => void>();
    uiForm.addEventListener("form-valid", onValid);
    name.value = "Ada"; // now the required field is satisfied
    const event = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(onValid).toHaveBeenCalledTimes(1);
    expect(summary.hidden).toBe(true);
  });
});
