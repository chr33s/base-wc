// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { AutocompleteChangeDetail } from "./autocomplete.ts";
import "./elements.ts";

const key = (target: EventTarget, k: string) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

const type = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

const CITIES = ["London", "Los Angeles", "Lisbon", "Berlin", "Paris"];

async function mount() {
  document.body.innerHTML = `
    <ui-autocomplete name="city">
      <input data-autocomplete-input />
      <ui-autocomplete-popup>
        <ui-autocomplete-list></ui-autocomplete-list>
        <ui-autocomplete-empty hidden>No matches</ui-autocomplete-empty>
      </ui-autocomplete-popup>
    </ui-autocomplete>`;
  await Promise.resolve();
  const ac = document.querySelector("ui-autocomplete")!;
  ac.items = CITIES;
  const input = document.querySelector<HTMLInputElement>("[data-autocomplete-input]")!;
  const list = document.querySelector("ui-autocomplete-list")!;
  const empty = document.querySelector("ui-autocomplete-empty")!;
  return { ac, input, list, empty };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-autocomplete", () => {
  it("wires combobox ARIA on connect", async () => {
    const { input, list } = await mount();
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("aria-controls")).toBe(list.id);
  });

  it("renders filtered suggestions and opens as you type", async () => {
    const { input, list } = await mount();
    type(input, "l");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    // London, Los Angeles, Lisbon, Berlin (all contain "l")
    const labels = [...list.querySelectorAll("[data-index]")].map((r) => r.textContent);
    expect(labels).toEqual(["London", "Los Angeles", "Lisbon", "Berlin"]);
  });

  it("keeps the form value equal to the typed text (selectionMode: none)", async () => {
    const { ac, input } = await mount();
    type(input, "lis");
    expect(ac.value).toBe("lis"); // value is the input text, not a selection
  });

  it("shows the empty state when nothing matches", async () => {
    const { input, empty } = await mount();
    type(input, "zzz");
    expect(empty.hasAttribute("hidden")).toBe(false);
  });

  it("commits a suggestion into the input via keyboard", async () => {
    const { ac, input } = await mount();
    const onChange = vi.fn<(detail: AutocompleteChangeDetail) => void>();
    ac.addEventListener("change", (e) =>
      onChange((e as CustomEvent<AutocompleteChangeDetail>).detail),
    );
    type(input, "lis"); // → Lisbon (auto-highlighted)
    key(input, "Enter");
    expect(input.value).toBe("Lisbon");
    expect(ac.value).toBe("Lisbon");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(onChange.mock.calls[0][0]).toEqual({ value: "Lisbon" });
  });

  it("commits a suggestion on click", async () => {
    const { input, list } = await mount();
    type(input, "l");
    const row = list.querySelector<HTMLElement>('[data-index="2"]')!; // Lisbon
    row.click();
    expect(input.value).toBe("Lisbon");
  });

  it("closes and clears suggestions when emptied", async () => {
    const { input, list } = await mount();
    type(input, "l");
    type(input, "");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(list.querySelectorAll("[data-index]").length).toBe(0);
  });
});
