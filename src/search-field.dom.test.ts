// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test";
import "./elements.ts";

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.innerHTML = "";
});

async function mount(attrs = 'debounce="0"') {
  document.body.innerHTML = `<ui-search-field ${attrs}><input type="search" name="q" /></ui-search-field>`;
  await flush();
  const el = document.querySelector("ui-search-field")!;
  const input = document.querySelector<HTMLInputElement>("input")!;
  const clear = el.querySelector<HTMLButtonElement>("[data-search-clear]")!;
  return { el, input, clear };
}

describe("ui-search-field", () => {
  it("generates a clear button, hidden while empty", async () => {
    const { el, clear } = await mount();
    expect(clear).toBeTruthy();
    expect(clear.hidden).toBe(true);
    expect(el.hasAttribute("data-empty")).toBe(true);
  });

  it("typing emits a search event and reveals the clear button", async () => {
    const { el, input, clear } = await mount();
    let value = "";
    el.addEventListener("search", (e) => (value = (e as CustomEvent).detail.value));
    input.value = "shoes";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(value).toBe("shoes");
    expect(clear.hidden).toBe(false);
    expect(el.hasAttribute("data-empty")).toBe(false);
  });

  it("the clear button empties the field and emits an empty search", async () => {
    const { el, input, clear } = await mount();
    input.value = "shoes";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    let value = "unset";
    el.addEventListener("search", (e) => (value = (e as CustomEvent).detail.value));
    clear.click();
    expect(input.value).toBe("");
    expect(value).toBe("");
    expect(clear.hidden).toBe(true);
  });

  it("Escape clears a non-empty field", async () => {
    const { input } = await mount();
    input.value = "shoes";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(input.value).toBe("");
  });

  it("debounces the search event when debounce > 0", async () => {
    document.body.innerHTML = `<ui-search-field debounce="30"><input type="search" /></ui-search-field>`;
    await flush();
    const el = document.querySelector("ui-search-field")!;
    const input = document.querySelector<HTMLInputElement>("input")!;
    let count = 0;
    el.addEventListener("search", () => count++);
    input.value = "a";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.value = "ab";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(count).toBe(0); // still within the debounce window
    await new Promise((r) => setTimeout(r, 60));
    expect(count).toBe(1); // only the trailing edge fires
  });
});
