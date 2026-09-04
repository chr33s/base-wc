// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ComboboxChangeDetail, ComboboxCounts, ComboboxItem } from "./combobox.ts";
import { createItems } from "./combobox.ts";
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

  it("wraps arrow navigation past the ends (matches autocomplete / Base UI)", async () => {
    const { input } = await mount(PEOPLE);
    input.click(); // open for browsing, first row active
    expect(input.getAttribute("aria-activedescendant")).toMatch(/-opt-0$/);
    key(input, "ArrowUp"); // wraps to the last row
    expect(input.getAttribute("aria-activedescendant")).toMatch(/-opt-4$/);
    key(input, "ArrowDown"); // wraps back to the first
    expect(input.getAttribute("aria-activedescendant")).toMatch(/-opt-0$/);
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

describe("ui-combobox — form integration (reset / disabled / required)", () => {
  it("formResetCallback clears the selection and input", async () => {
    const { cb, input } = await mount(PEOPLE);
    type(input, "liam");
    key(input, "Enter"); // commit "Liam Patel"
    expect(cb.value).toBe("u2");
    expect(input.value).toBe("Liam Patel");
    cb.formResetCallback();
    expect(cb.value).toBe(null);
    expect(input.value).toBe("");
  });

  it("reports valueMissing while required with no selection", async () => {
    const { cb, input } = await mount(PEOPLE);
    cb.setAttribute("required", "");
    expect(cb.validity.valueMissing).toBe(true);
    expect(cb.checkValidity()).toBe(false);
    type(input, "liam");
    key(input, "Enter");
    expect(cb.validity.valid).toBe(true);
    expect(cb.checkValidity()).toBe(true);
  });

  it("formDisabledCallback manages the inner input one-way", async () => {
    const { cb, input } = await mount(PEOPLE);
    cb.formDisabledCallback(true);
    expect(input.disabled).toBe(true);
    expect(cb.hasAttribute("data-disabled")).toBe(true);
    cb.formDisabledCallback(false);
    expect(input.disabled).toBe(false); // we disabled it, so we re-enable it
    expect(cb.hasAttribute("data-disabled")).toBe(false);
  });

  it("formDisabledCallback never re-enables an author-disabled input", async () => {
    const { cb, input } = await mount(PEOPLE);
    input.disabled = true; // the author disabled it directly
    cb.formDisabledCallback(true);
    cb.formDisabledCallback(false);
    expect(input.disabled).toBe(true); // left alone
  });
});

describe("ui-combobox — hover highlighting", () => {
  it("ignores a pointermove that reports the same coordinates as the last one", async () => {
    const { input } = await mount(PEOPLE);
    input.click(); // open for browsing
    const row = (i: number) => document.querySelector<HTMLElement>(`.cb-row[data-index="${i}"]`)!;
    row(2).dispatchEvent(
      new MouseEvent("pointermove", { clientX: 10, clientY: 40, bubbles: true }),
    );
    expect(row(2).hasAttribute("data-highlighted")).toBe(true);

    key(input, "ArrowDown"); // keyboard moves the highlight on
    expect(row(3).hasAttribute("data-highlighted")).toBe(true);

    // Scrolling the list under a *stationary* cursor makes Safari emit a
    // pointermove at unchanged coordinates. Acting on it would yank the
    // highlight back to whatever row slid under the mouse.
    row(2).dispatchEvent(
      new MouseEvent("pointermove", { clientX: 10, clientY: 40, bubbles: true }),
    );
    expect(row(3).hasAttribute("data-highlighted")).toBe(true);
    expect(row(2).hasAttribute("data-highlighted")).toBe(false);

    // A genuine move still highlights.
    row(2).dispatchEvent(
      new MouseEvent("pointermove", { clientX: 11, clientY: 40, bubbles: true }),
    );
    expect(row(2).hasAttribute("data-highlighted")).toBe(true);
  });
});

describe("ui-combobox — locale-aware filtering", () => {
  afterEach(() => document.documentElement.removeAttribute("lang"));

  it("folds the query with the document language", async () => {
    document.documentElement.setAttribute("lang", "tr");
    const { input, cb } = await mount([
      { value: "1", label: "Isparta" },
      { value: "2", label: "İzmir" },
    ]);
    type(input, "i");
    // Turkish lowercases `I` to the dotless `ı`, so a query of `i` matches
    // İzmir and not Isparta — the reverse of the Unicode default rules.
    expect(cb.counts.matched).toBe(1);
    expect(document.querySelector<HTMLElement>('.cb-row[data-index="0"]')!.textContent).toContain(
      "İzmir",
    );
  });
});

describe("ui-combobox createItems", () => {
  it("maps application records to options and hands the record back", async () => {
    const users = [
      { id: 1, name: "Ava" },
      { id: 2, name: "Liam" },
    ];
    const items = createItems(users, { getValue: (u) => u.id, getLabel: (u) => u.name });
    // Ids become strings — a form value is always text.
    expect(items).toEqual([
      { value: "1", label: "Ava", item: users[0] },
      { value: "2", label: "Liam", item: users[1] },
    ]);

    const { cb, input } = await mount(items);
    const onChange = vi.fn();
    cb.addEventListener("change", (e) => onChange((e as CustomEvent<ComboboxChangeDetail>).detail));
    input.click();
    key(input, "Enter");

    expect(onChange.mock.calls[0][0].item).toBe(users[0]);
    expect(cb.value).toBe("1");
  });
});

describe("ui-combobox readonly", () => {
  it("opens and browses but refuses to commit", async () => {
    const { cb, input } = await mount(PEOPLE);
    cb.setAttribute("readonly", "");

    expect(cb.hasAttribute("data-readonly")).toBe(true);
    expect(input.readOnly).toBe(true);
    expect(input.getAttribute("aria-readonly")).toBe("true");

    input.click(); // still opens
    expect(input.getAttribute("aria-expanded")).toBe("true");
    key(input, "ArrowDown"); // still highlights
    expect(input.getAttribute("aria-activedescendant")).toBeTruthy();

    key(input, "Enter"); // …but the value is locked
    expect(cb.value).toBe(null);
  });

  it("refuses the clear control while readonly", async () => {
    document.body.innerHTML = `
      <ui-combobox multiple readonly>
        <input data-combobox-input />
        <ui-combobox-chips></ui-combobox-chips>
        <button data-combobox-clear type="button">Clear</button>
        <ui-combobox-popup>
          <ui-combobox-viewport><ui-combobox-spacer></ui-combobox-spacer></ui-combobox-viewport>
        </ui-combobox-popup>
      </ui-combobox>`;
    await Promise.resolve();
    const cb = document.querySelector("ui-combobox")!;
    cb.items = PEOPLE;
    cb.value = ["u1"];

    document.querySelector<HTMLButtonElement>("[data-combobox-clear]")!.click();
    expect(cb.value).toEqual(["u1"]);
  });
});

describe("ui-combobox change reasons", () => {
  it("names what caused each change", async () => {
    const { cb, input } = await mount(PEOPLE);
    const reasons: string[] = [];
    cb.addEventListener("change", (e) =>
      reasons.push((e as CustomEvent<ComboboxChangeDetail>).detail.reason),
    );

    input.click();
    key(input, "Enter");
    expect(reasons).toEqual(["item-press"]);
  });
});

describe("ui-combobox grid mode", () => {
  async function grid(columns: number, items = PEOPLE) {
    document.body.innerHTML = `
      <ui-combobox columns="${columns}">
        <input data-combobox-input />
        <ui-combobox-popup>
          <ui-combobox-viewport><ui-combobox-spacer></ui-combobox-spacer></ui-combobox-viewport>
        </ui-combobox-popup>
      </ui-combobox>`;
    await Promise.resolve();
    const cb = document.querySelector("ui-combobox")!;
    cb.items = items;
    const input = document.querySelector<HTMLInputElement>("[data-combobox-input]")!;
    const viewport = document.querySelector("ui-combobox-viewport")!;
    return { cb, input, viewport };
  }

  it("announces the popup as a grid with its column count", async () => {
    const { input, viewport } = await grid(3);
    expect(viewport.getAttribute("role")).toBe("grid");
    expect(viewport.getAttribute("aria-colcount")).toBe("3");
    expect(input.getAttribute("aria-haspopup")).toBe("grid");
    // 5 people over 3 columns is 2 rows.
    expect(viewport.getAttribute("aria-rowcount")).toBe("2");
  });

  it("recycles rows of gridcells rather than bare options", async () => {
    const { input, viewport } = await grid(3);
    input.click();
    const rows = [...viewport.querySelectorAll('[role="row"]')];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].getAttribute("aria-rowindex")).toBe("1");

    const cells = [...rows[0].querySelectorAll<HTMLElement>('[role="gridcell"]')];
    expect(cells).toHaveLength(3);
    expect(cells.map((c) => c.textContent)).toEqual(["Ava Kim", "Liam Patel", "Noah Garcia"]);
    expect(cells[1].getAttribute("aria-colindex")).toBe("2");
  });

  it("hides the spare cells of a short last row", async () => {
    const { input, viewport } = await grid(3);
    input.click();
    const rows = [...viewport.querySelectorAll<HTMLElement>('[role="row"]')];
    const lastCells = [...rows[1].querySelectorAll<HTMLElement>('[role="gridcell"]')];
    // 5 items over 3 columns leaves the second row holding two.
    expect(lastCells.map((c) => c.hidden)).toEqual([false, false, true]);
    expect(lastCells[2].hasAttribute("data-index")).toBe(false);
  });

  it("walks the grid in two dimensions", async () => {
    const { cb, input } = await grid(3);
    input.click(); // opens with the first cell active
    const activeIndex = () => {
      const id = input.getAttribute("aria-activedescendant")!;
      return Number(document.getElementById(id)!.dataset.index);
    };
    expect(activeIndex()).toBe(0);

    key(input, "ArrowRight");
    expect(activeIndex()).toBe(1);
    key(input, "ArrowDown"); // one row down, same column
    expect(activeIndex()).toBe(4);
    key(input, "ArrowUp");
    expect(activeIndex()).toBe(1);
    expect(cb.value).toBe(null); // navigation alone commits nothing
  });

  it("wraps within the row and skips a column the last row does not reach", async () => {
    const { input } = await grid(3);
    input.click();
    const activeIndex = () => {
      const id = input.getAttribute("aria-activedescendant")!;
      return Number(document.getElementById(id)!.dataset.index);
    };

    key(input, "ArrowLeft"); // wraps to the end of row 0
    expect(activeIndex()).toBe(2);
    // Column 2 has no cell in the short second row, so Down wraps back to row 0.
    key(input, "ArrowDown");
    expect(activeIndex()).toBe(2);
  });
});
