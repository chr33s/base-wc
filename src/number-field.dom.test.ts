// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";

const key = (target: EventTarget, k: string) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

async function mount(attrs = 'value="3" min="0" max="10" step="1"') {
  document.body.innerHTML = `
    <ui-number-field name="qty" ${attrs}>
      <button data-number-decrement>−</button>
      <input data-number-input />
      <button data-number-increment>+</button>
    </ui-number-field>`;
  await Promise.resolve();
  const field = document.querySelector("ui-number-field")!;
  const input = document.querySelector<HTMLInputElement>("[data-number-input]")!;
  const inc = document.querySelector<HTMLButtonElement>("[data-number-increment]")!;
  const dec = document.querySelector<HTMLButtonElement>("[data-number-decrement]")!;
  return { field, input, inc, dec };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-number-field", () => {
  it("wires spinbutton ARIA and the initial value", async () => {
    const { field, input } = await mount();
    expect(input.getAttribute("role")).toBe("spinbutton");
    expect(input.getAttribute("aria-valuemin")).toBe("0");
    expect(input.getAttribute("aria-valuemax")).toBe("10");
    expect(input.getAttribute("aria-valuenow")).toBe("3");
    expect(field.value).toBe(3);
  });

  it("steps with the increment/decrement buttons", async () => {
    const { field, inc, dec } = await mount();
    inc.click();
    expect(field.value).toBe(4);
    dec.click();
    dec.click();
    expect(field.value).toBe(2);
  });

  it("steps with the keyboard, including Page/Home/End", async () => {
    const { field, input } = await mount();
    key(input, "ArrowUp");
    expect(field.value).toBe(4);
    key(input, "ArrowDown");
    expect(field.value).toBe(3);
    key(input, "PageUp"); // +largeStep (10) → clamped to max 10
    expect(field.value).toBe(10);
    key(input, "Home");
    expect(field.value).toBe(0);
    key(input, "End");
    expect(field.value).toBe(10);
  });

  it("clamps and snaps to step on commit", async () => {
    const { field } = await mount('value="0" min="0" max="100" step="5"');
    field.value = 7; // snaps to 5
    expect(field.value).toBe(5);
    field.value = 999; // clamps to 100
    expect(field.value).toBe(100);
  });

  it("commits free-form typing on blur", async () => {
    const { field, input } = await mount('value="0" min="0" max="100" step="1"');
    input.value = "42";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("blur"));
    expect(field.value).toBe(42);
    expect(input.getAttribute("aria-valuenow")).toBe("42");
  });

  it("disables the step buttons at the bounds", async () => {
    const { inc, dec } = await mount('value="10" min="0" max="10" step="1"');
    expect(inc.hasAttribute("disabled")).toBe(true); // at max
    expect(dec.hasAttribute("disabled")).toBe(false);
  });
});

describe("ui-number-field — adopts a native type=number input (no-JS fallback)", () => {
  async function mount(attrs = 'value="3" min="0" max="10" step="1"') {
    document.body.innerHTML = `
      <form>
        <ui-number-field>
          <button data-number-decrement>−</button>
          <input type="number" name="qty" ${attrs} />
          <button data-number-increment>+</button>
        </ui-number-field>
      </form>`;
    await Promise.resolve();
    const form = document.querySelector("form")!;
    const field = document.querySelector("ui-number-field")!;
    const input = document.querySelector<HTMLInputElement>("input")!;
    const inc = document.querySelector<HTMLButtonElement>("[data-number-increment]")!;
    const dec = document.querySelector<HTMLButtonElement>("[data-number-decrement]")!;
    return { form, field, input, inc, dec };
  }

  it("the native input is the form value, with or without JS", async () => {
    const { form, field } = await mount();
    expect(new FormData(form).get("qty")).toBe("3");
    expect(field.value).toBe(3);
  });

  it("leaves the native input's role/keyboard to the browser", async () => {
    const { input } = await mount();
    expect(input.getAttribute("role")).toBe(null); // native type=number is a spinbutton
  });

  it("steps via the custom buttons using native stepUp/stepDown", async () => {
    const { field, input, inc, dec } = await mount();
    inc.click();
    expect(input.value).toBe("4");
    expect(field.value).toBe(4);
    dec.click();
    dec.click();
    expect(field.value).toBe(2);
  });

  it("disables the step buttons at the bounds", async () => {
    const { inc, dec } = await mount('value="10" min="0" max="10" step="1"');
    expect(inc.hasAttribute("disabled")).toBe(true); // at max
    expect(dec.hasAttribute("disabled")).toBe(false);
  });

  it("preserves a `disabled` authored on the native input", async () => {
    const { field, input, inc, dec } = await mount('value="3" min="0" max="10" disabled');
    expect(input.disabled).toBe(true); // not clobbered by the (absent) host attr
    expect(field.disabled).toBe(true);
    expect(inc.hasAttribute("disabled")).toBe(true);
    expect(dec.hasAttribute("disabled")).toBe(true);
  });
});

describe("ui-number-field — scrub area", () => {
  async function mount() {
    document.body.innerHTML = `
      <ui-number-field name="qty" value="10" min="0" max="100" step="1" scrub-sensitivity="8">
        <span data-number-scrub>⇔</span>
        <input data-number-input />
      </ui-number-field>`;
    await Promise.resolve();
    const field = document.querySelector("ui-number-field")!;
    const scrub = document.querySelector<HTMLElement>("[data-number-scrub]")!;
    return { field, scrub };
  }

  const move = (dx: number) => {
    const e = new Event("pointermove", { bubbles: true });
    Object.defineProperty(e, "movementX", { value: dx });
    window.dispatchEvent(e);
  };

  it("changes the value by dragging horizontally (right = up) and flags data-scrubbing", async () => {
    const { field, scrub } = await mount();
    scrub.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
    expect(scrub.hasAttribute("data-scrubbing")).toBe(true);
    move(8); // +1 step → 11
    expect(field.value).toBe(11);
    move(-16); // −2 steps → 9
    expect(field.value).toBe(9);
    window.dispatchEvent(new Event("pointerup"));
    expect(scrub.hasAttribute("data-scrubbing")).toBe(false);
  });

  it("accumulates sub-step movement until a full step is reached", async () => {
    const { field } = await mount();
    const scrub = document.querySelector<HTMLElement>("[data-number-scrub]")!;
    scrub.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
    move(5); // not enough for a step (needs 8)
    expect(field.value).toBe(10);
    move(5); // total 10 → one step
    expect(field.value).toBe(11);
    window.dispatchEvent(new Event("pointerup"));
  });

  it("stops responding after pointerup", async () => {
    const { field, scrub } = await mount();
    scrub.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
    window.dispatchEvent(new Event("pointerup"));
    move(80); // ignored — no longer scrubbing
    expect(field.value).toBe(10);
  });
});
