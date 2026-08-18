// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ComboboxChangeDetail, ComboboxCounts, ComboboxItem } from "./combobox.ts";
import "./elements.ts";

const key = (target: EventTarget, k: string) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

const type = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

async function mount(items: ComboboxItem[]) {
  document.body.innerHTML = `
    <form id="f">
      <ui-combobox name="assignee">
        <input data-combobox-input />
        <ui-combobox-popup>
          <ui-combobox-viewport><ui-combobox-spacer></ui-combobox-spacer></ui-combobox-viewport>
          <ui-combobox-empty hidden>No matches.</ui-combobox-empty>
        </ui-combobox-popup>
      </ui-combobox>
    </form>`;
  await Promise.resolve(); // let the deferred wiring microtask run
  const cb = document.querySelector("ui-combobox")!;
  cb.items = items;
  const input = document.querySelector<HTMLInputElement>("[data-combobox-input]")!;
  const viewport = document.querySelector("ui-combobox-viewport")!;
  const spacer = document.querySelector("ui-combobox-spacer")!;
  const empty = document.querySelector("ui-combobox-empty")!;
  return { cb, input, viewport, spacer, empty };
}

const PEOPLE: ComboboxItem[] = [
  { value: "u1", label: "Ava Kim" },
  { value: "u2", label: "Liam Patel" },
  { value: "u3", label: "Noah Garcia" },
  { value: "u4", label: "Ava Nguyen" },
  { value: "u5", label: "José Silva" },
];

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ui-combobox (virtualized)", () => {
  it("wires combobox ARIA on connect", async () => {
    const { cb, input, viewport } = await mount(PEOPLE);
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("aria-controls")).toBe(viewport.id);
    expect(viewport.getAttribute("role")).toBe("listbox");
    expect(cb.name).toBe("assignee");
  });

  it("keeps the DOM row pool constant regardless of dataset size", async () => {
    const small = await mount(PEOPLE);
    const smallRows = small.cb.counts.domRows;
    const big = await mount(
      Array.from({ length: 5000 }, (_, i) => ({ value: `u${i}`, label: `Person ${i}` })),
    );
    expect(big.cb.counts.total).toBe(5000);
    // Same fixed pool for 5 items and 5,000 items — that is the virtualization.
    expect(big.cb.counts.domRows).toBe(smallRows);
    expect(document.querySelectorAll(".cb-row").length).toBe(smallRows);
  });

  it("scales the spacer to the full virtual height (36px per row)", async () => {
    const { spacer } = await mount(PEOPLE);
    expect(spacer.style.height).toBe(`${PEOPLE.length * 36}px`);
  });

  it("filters diacritic- and case-insensitively and reports counts", async () => {
    const { cb, input } = await mount(PEOPLE);
    const onFilter = vi.fn<(counts: ComboboxCounts) => void>();
    cb.addEventListener("filterchange", (e) => onFilter((e as CustomEvent<ComboboxCounts>).detail));
    type(input, "ava"); // matches "Ava Kim" + "Ava Nguyen"
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(onFilter.mock.calls.at(-1)?.[0]).toMatchObject({ matched: 2, total: 5 });

    type(input, "jose"); // matches "José Silva" via normalization
    expect(onFilter.mock.calls.at(-1)?.[0].matched).toBe(1);
  });

  it("shows the empty state when nothing matches", async () => {
    const { input, empty } = await mount(PEOPLE);
    expect(empty.hasAttribute("hidden")).toBe(true);
    type(input, "zzzzz");
    expect(empty.hasAttribute("hidden")).toBe(false);
  });

  it("selects via keyboard, emitting change and updating value", async () => {
    const { cb, input } = await mount(PEOPLE);
    const onChange = vi.fn<(detail: ComboboxChangeDetail) => void>();
    cb.addEventListener("change", (e) => onChange((e as CustomEvent<ComboboxChangeDetail>).detail));
    type(input, "liam"); // one match, auto-highlighted at index 0
    key(input, "Enter");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({ value: "u2", label: "Liam Patel" });
    expect(cb.value).toBe("u2");
    expect(input.value).toBe("Liam Patel");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("selects on row click", async () => {
    const { cb, input } = await mount(PEOPLE);
    const onChange = vi.fn<(detail: ComboboxChangeDetail) => void>();
    cb.addEventListener("change", (e) => onChange((e as CustomEvent<ComboboxChangeDetail>).detail));
    const firstRow = document.querySelector<HTMLElement>('.cb-row[data-index="0"]')!;
    firstRow.click();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(cb.value).toBe("u1");
    expect(input.value).toBe("Ava Kim");
  });

  it("preserves the typed query when the input is clicked (no filter reset)", async () => {
    const { cb, input } = await mount(PEOPLE);
    type(input, "ava"); // filters to Ava Kim + Ava Nguyen
    expect(cb.counts.matched).toBe(2);
    input.click(); // re-open for browsing must NOT wipe the active query
    expect(cb.counts.matched).toBe(2);
    expect(input.value).toBe("ava");
  });

  it("does not leak the internal input's native input/change events", async () => {
    const { cb, input } = await mount(PEOPLE);
    const nativeLeak = vi.fn<(e: Event) => void>();
    // A native `input`/`change` from the internal <input> must not escape as if
    // it were the combobox's own event.
    cb.addEventListener("input", nativeLeak);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(nativeLeak).not.toHaveBeenCalled();
  });
});

describe("ui-combobox — multiple (chips)", () => {
  async function mount() {
    document.body.innerHTML = `
      <form id="f">
        <ui-combobox name="tags" multiple>
          <ui-combobox-chips></ui-combobox-chips>
          <input data-combobox-input />
          <button data-combobox-clear type="button">Clear</button>
          <ui-combobox-popup>
            <ui-combobox-viewport><ui-combobox-spacer></ui-combobox-spacer></ui-combobox-viewport>
            <ui-combobox-empty hidden>No matches.</ui-combobox-empty>
          </ui-combobox-popup>
        </ui-combobox>
      </form>`;
    await Promise.resolve();
    const cb = document.querySelector("ui-combobox")!;
    cb.items = PEOPLE;
    const input = document.querySelector<HTMLInputElement>("[data-combobox-input]")!;
    const chips = document.querySelector("ui-combobox-chips")!;
    const clear = document.querySelector<HTMLButtonElement>("[data-combobox-clear]")!;
    const popup = document.querySelector("ui-combobox-popup")!;
    const row = (i: number) => document.querySelector<HTMLElement>(`.cb-row[data-index="${i}"]`)!;
    return { cb, input, chips, clear, popup, row };
  }

  const chipValues = (chips: Element) =>
    [...chips.querySelectorAll("ui-combobox-chip")].map((c) => c.getAttribute("data-value"));

  it("marks the listbox multiselectable", async () => {
    const { cb } = await mount();
    expect(cb.querySelector("ui-combobox-viewport")!.getAttribute("aria-multiselectable")).toBe(
      "true",
    );
  });

  it("toggles selections into chips, reports an array, and stays open", async () => {
    const { cb, input, chips, popup, row } = await mount();
    const onChange = vi.fn<(d: ComboboxChangeDetail) => void>();
    cb.addEventListener("change", (e) => onChange((e as CustomEvent<ComboboxChangeDetail>).detail));
    input.click(); // open browsing
    row(0).click(); // Ava Kim (u1)
    expect(cb.value).toEqual(["u1"]);
    expect(chipValues(chips)).toEqual(["u1"]);
    expect(popup.hasAttribute("data-open")).toBe(true); // stays open
    expect(input.value).toBe(""); // input cleared for the next pick
    row(1).click(); // Liam Patel (u2)
    expect(cb.value).toEqual(["u1", "u2"]);
    expect(chipValues(chips)).toEqual(["u1", "u2"]);
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ value: "u2", values: ["u1", "u2"] });
  });

  it("deselects when the same option is chosen again", async () => {
    const { cb, input, row } = await mount();
    input.click();
    row(0).click(); // select u1
    expect(cb.value).toEqual(["u1"]);
    row(0).click(); // filter reset → index 0 is u1 again → toggle off
    expect(cb.value).toEqual([]);
  });

  it("removes a selection via the chip remove button", async () => {
    const { cb, input, chips, row } = await mount();
    input.click();
    row(0).click();
    row(1).click();
    const removeU1 = chips.querySelector<HTMLButtonElement>(
      'ui-combobox-chip[data-value="u1"] [data-combobox-chip-remove]',
    )!;
    removeU1.click();
    expect(cb.value).toEqual(["u2"]);
    expect(chipValues(chips)).toEqual(["u2"]);
  });

  it("clears every selection via [data-combobox-clear]", async () => {
    const { cb, input, chips, clear, row } = await mount();
    input.click();
    row(0).click();
    row(1).click();
    clear.click();
    expect(cb.value).toEqual([]);
    expect(chipValues(chips)).toEqual([]);
  });

  it("accepts an array via the value setter and renders chips", async () => {
    const { cb, chips } = await mount();
    cb.value = ["u3", "u5"];
    expect(cb.value).toEqual(["u3", "u5"]);
    expect(chipValues(chips)).toEqual(["u3", "u5"]);
  });
});
