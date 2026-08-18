// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import "./elements.ts";

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.innerHTML = "";
});

async function mount(attrs = 'removable value="blue"') {
  document.body.innerHTML = `<ui-chip ${attrs}>Blue</ui-chip>`;
  await flush();
  return document.querySelector("ui-chip")!;
}

describe("ui-chip", () => {
  it("is open on connect and, when removable, generates a keyboard-reachable remove button", async () => {
    const el = await mount();
    expect(el.getAttribute("data-state")).toBe("open");
    expect(el.getAttribute("tabindex")).toBe("0");
    expect(el.querySelector("[data-chip-remove]")).toBeTruthy();
  });

  it("clicking remove fires `remove` with the value and removes the host", async () => {
    const el = await mount();
    let value: string | null = "unset";
    el.addEventListener("remove", (e) => (value = (e as CustomEvent).detail.value));
    el.querySelector<HTMLButtonElement>("[data-chip-remove]")!.click();
    expect(value).toBe("blue");
    expect(document.querySelector("ui-chip")).toBe(null); // removed (no CSS exit)
  });

  it("fires remove only once while dismissal is pending", async () => {
    const el = await mount();
    const onRemove = vi.fn<(e: Event) => void>();
    el.addEventListener("remove", onRemove);
    const btn = el.querySelector<HTMLButtonElement>("[data-chip-remove]")!;

    btn.click();
    el.dismiss();

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("Delete/Backspace on the focused chip removes it", async () => {
    const el = await mount();
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
    expect(document.querySelector("ui-chip")).toBe(null);
  });

  it("a disabled chip does not remove", async () => {
    const el = await mount("removable disabled");
    el.querySelector<HTMLButtonElement>("[data-chip-remove]")!.click();
    expect(document.querySelector("ui-chip")).toBeTruthy();
  });

  it("a non-removable chip is inert (no button, not focusable)", async () => {
    const el = await mount("value=x");
    expect(el.querySelector("[data-chip-remove]")).toBe(null);
    expect(el.hasAttribute("tabindex")).toBe(false);
  });
});
