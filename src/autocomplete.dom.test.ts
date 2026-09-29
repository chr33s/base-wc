// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { AutocompleteChangeDetail } from "./autocomplete.ts";
import "./elements.ts";
import { key, must } from "./test-utils.ts";

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
  const ac = must(document.querySelector("ui-autocomplete"));
  ac.items = CITIES;
  const input = must(document.querySelector<HTMLInputElement>("[data-autocomplete-input]"));
  const list = must(document.querySelector("ui-autocomplete-list"));
  const empty = must(document.querySelector("ui-autocomplete-empty"));
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
    expect(onChange.mock.calls[0]?.[0]).toEqual({ value: "Lisbon", reason: "item-press" });
  });

  it("commits a suggestion on click", async () => {
    const { input, list } = await mount();
    type(input, "l");
    const row = must(list.querySelector<HTMLElement>('[data-index="2"]')); // Lisbon
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

describe("ui-autocomplete — form integration (reset / disabled / required)", () => {
  it("formResetCallback re-syncs after the browser restores the input", async () => {
    const { ac, input } = await mount();
    type(input, "lis"); // suggestions open
    expect(input.getAttribute("aria-expanded")).toBe("true");
    // Emulate `form.reset()`: the browser restores the inner input's default
    // value, then invokes the host's formResetCallback.
    input.value = "";
    ac.formResetCallback();
    await Promise.resolve(); // the re-sync waits for the reset pass to finish
    expect(ac.value).toBe("");
    expect(input.getAttribute("aria-expanded")).toBe("false"); // suggestions dropped
  });

  it("reports valueMissing while required and empty", async () => {
    const { ac, input } = await mount();
    ac.setAttribute("required", "");
    expect(ac.validity.valueMissing).toBe(true);
    expect(ac.checkValidity()).toBe(false);
    type(input, "Lisbon");
    expect(ac.validity.valid).toBe(true);
    expect(ac.checkValidity()).toBe(true);
  });

  it("formDisabledCallback manages the inner input one-way", async () => {
    const { ac, input } = await mount();
    ac.formDisabledCallback(true);
    expect(input.disabled).toBe(true);
    expect(ac.hasAttribute("data-disabled")).toBe(true);
    ac.formDisabledCallback(false);
    expect(input.disabled).toBe(false);
    expect(ac.hasAttribute("data-disabled")).toBe(false);
  });
});

describe("ui-autocomplete readonly", () => {
  it("browses suggestions but never rewrites the text", async () => {
    const { ac, input } = await mount();
    ac.setAttribute("readonly", "");

    expect(ac.hasAttribute("data-readonly")).toBe(true);
    expect(input.readOnly).toBe(true);

    // An arrow opens for browsing, since typing a query is impossible here.
    key(input, "ArrowDown");
    expect(input.getAttribute("aria-expanded")).toBe("true");

    key(input, "Enter");
    expect(input.value).toBe("");
  });
});
