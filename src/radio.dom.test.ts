// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import "./elements.ts";

const key = (target: EventTarget, k: string) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

async function mount() {
  document.body.innerHTML = `
    <ui-radio-group name="plan">
      <ui-radio value="free">Free</ui-radio>
      <ui-radio value="pro" checked>Pro</ui-radio>
      <ui-radio value="team" disabled>Team</ui-radio>
      <ui-radio value="ent">Enterprise</ui-radio>
    </ui-radio-group>`;
  await Promise.resolve();
  const group = document.querySelector("ui-radio-group")!;
  const radios = [...document.querySelectorAll("ui-radio")];
  return { group, radios };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-radio-group", () => {
  it("wires roles and reflects the pre-checked radio", async () => {
    const { group, radios } = await mount();
    expect(group.getAttribute("role")).toBe("radiogroup");
    expect(radios.every((r) => r.getAttribute("role") === "radio")).toBe(true);
    expect(radios[1].getAttribute("aria-checked")).toBe("true"); // Pro
    expect(group.value).toBe("pro");
  });

  it("puts the single roving tab stop on the checked radio", async () => {
    const { radios } = await mount();
    expect(radios[1].tabIndex).toBe(0); // Pro
    expect(radios[0].tabIndex).toBe(-1);
    expect(radios[3].tabIndex).toBe(-1);
  });

  it("selects on click and emits change", async () => {
    const { group, radios } = await mount();
    const onChange = vi.fn<(detail: { value: string }) => void>();
    group.addEventListener("change", (e) => onChange((e as CustomEvent<{ value: string }>).detail));
    radios[3].click(); // Enterprise
    expect(radios[3].getAttribute("aria-checked")).toBe("true");
    expect(radios[1].getAttribute("aria-checked")).toBe("false");
    expect(group.value).toBe("ent");
    expect(onChange.mock.calls[0][0]).toEqual({ value: "ent" });
  });

  it("moves selection with the arrow keys, skipping disabled radios", async () => {
    const { group, radios } = await mount();
    radios[1].focus(); // Pro (index 1 of DOM; enabled list is [free, pro, ent])
    key(group, "ArrowDown"); // → Enterprise (skips disabled Team)
    expect(document.activeElement).toBe(radios[3]);
    expect(radios[3].getAttribute("aria-checked")).toBe("true");
    expect(group.value).toBe("ent");
    key(group, "ArrowDown"); // wraps → Free
    expect(group.value).toBe("free");
  });

  it("selects the focused radio with Space", async () => {
    const { group, radios } = await mount();
    radios[0].focus();
    key(group, " ");
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
    expect(group.value).toBe("free");
  });

  it("selects programmatically via the value setter without emitting", async () => {
    const { group, radios } = await mount();
    const onChange = vi.fn<(e: Event) => void>();
    group.addEventListener("change", onChange);
    group.value = "ent";
    expect(radios[3].getAttribute("aria-checked")).toBe("true");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("ui-radio-group — adopts native radios (no-JS fallback)", () => {
  async function mountNative(proAttrs = "checked") {
    document.body.innerHTML = `
      <form>
        <ui-radio-group>
          <ui-radio><input type="radio" name="plan" value="free" /></ui-radio>
          <ui-radio><input type="radio" name="plan" value="pro" ${proAttrs} /></ui-radio>
          <ui-radio><input type="radio" name="plan" value="ent" /></ui-radio>
        </ui-radio-group>
      </form>`;
    await Promise.resolve();
    const form = document.querySelector("form")!;
    const group = document.querySelector<HTMLElement & { value: string | null }>("ui-radio-group")!;
    const radios = [...document.querySelectorAll("ui-radio")];
    const inputOf = (r: Element) => r.querySelector<HTMLInputElement>("input")!;
    return { form, group, radios, inputOf };
  }

  it("the native radios are the form value, with or without JS", async () => {
    const { form } = await mountNative();
    expect(new FormData(form).get("plan")).toBe("pro");
  });

  it("mirrors checked state onto data-state and leaves the radios' roles to the inputs", async () => {
    const { group, radios } = await mountNative();
    expect(group.getAttribute("role")).toBe("radiogroup");
    expect(radios[1].getAttribute("data-state")).toBe("checked");
    expect(radios[0].getAttribute("data-state")).toBe("unchecked");
    expect(radios.every((r) => r.getAttribute("role") === null)).toBe(true);
    expect(group.value).toBe("pro");
  });

  it("re-syncs every radio's data-state when the selection changes", async () => {
    const { group, radios, inputOf } = await mountNative();
    inputOf(radios[2]).click(); // select ent → native unchecks pro (which fires no event)
    expect(radios[2].getAttribute("data-state")).toBe("checked");
    expect(radios[1].getAttribute("data-state")).toBe("unchecked");
    expect(group.value).toBe("ent");
  });

  it("selects programmatically via the value setter", async () => {
    const { group, radios, inputOf } = await mountNative();
    group.value = "free";
    expect(inputOf(radios[0]).checked).toBe(true);
    expect(radios[0].getAttribute("data-state")).toBe("checked");
    expect(group.value).toBe("free");
  });
});
