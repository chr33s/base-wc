/**
 * `ui-combobox` — a store-backed, **virtualized** combobox (Base UI's Combobox
 * core, `AriaCombobox`, ported to web components).
 *
 * The key inversion versus a naive listbox: the DOM is no longer the registry.
 * The full data set, the current filter result, the active index and the
 * selection all live in JS; the DOM holds a **fixed pool of ~15 recycled rows**
 * that render whichever slice of the filtered list is scrolled into view. A
 * tall spacer establishes the full scroll height so the scrollbar behaves as if
 * all N rows existed. This keeps the row count constant no matter how many
 * items there are (10,000+) or how far you scroll.
 *
 * `aria-activedescendant` references a row id we guarantee exists by scrolling
 * the active index into the window before pointing at it, and each visible row
 * carries `aria-posinset`/`aria-setsize` so assistive tech announces "row 4,213
 * of 10,000" correctly under virtualization. Keyboard navigation is the shared
 * {@link listNav} engine (wrap policy — arrows loop past the ends, like
 * autocomplete and Base UI; PageUp/PageDown clamp), with the open/close and
 * blur guards owned by the {@link AriaCombobox} core.
 *
 * The element is **form-associated** via {@link ElementInternals}: its selected
 * `value` participates in `<form>` submission and `FormData` under its `name`.
 *
 * The `multiple` attribute switches to multi-select: choosing an option toggles
 * it (the popup stays open), each pick renders a removable `<ui-combobox-chip>`
 * into a `<ui-combobox-chips>` container, a `[data-combobox-clear]` control
 * empties the selection, `value` becomes a `string[]`, and every value submits
 * under `name`.
 *
 * `columns` turns the popup into a `role="grid"` whose rows the arrows walk in
 * two dimensions; `readonly` locks the value while leaving the popup browsable;
 * and {@link createItems} maps application records into the store while keeping
 * each one attached for the `change` event to hand back.
 */
import { ComboboxOptions } from "./internal/combobox-options.ts";
import { AriaCombobox } from "./combobox-core.ts";
import { define } from "./define.ts";
import { isRTL } from "./direction.ts";
import { UIPopupElement } from "./popup.ts";
import { FormAssociatedElement, type FormControlOptions } from "./form-control.ts";
import { nextId } from "./id.ts";
import { managedDisabled } from "./native.ts";
import { onPointerMoved } from "./intent.ts";
import { listNav, type ListNav } from "./list-nav.ts";
import { clamp, numberAttribute } from "./math.ts";
import type { ChangeReason } from "./reasons.ts";
import { localeOf, normalize } from "./text.ts";

/** A single combobox option. Supplied via the `items` property, not markup. */
export interface ComboboxItem<T = unknown> {
  readonly value: string;
  readonly label: string;
  /**
   * The application record this option was derived from, when the collection
   * was built by {@link createItems}. Carried through to the `change` event so
   * a listener gets the whole record back, not just the id it stored.
   */
  readonly item?: T;
}

/**
 * Build an option collection from arbitrary application records.
 *
 * The store holds `{ value, label }` because that is what filtering, the form
 * value, the trigger text and typeahead all need *before* any row is rendered.
 * Applications rarely hold their data in that shape — they have records and
 * store a primitive id — and deriving the pair per row is too late. This maps
 * the two out once, keeping each record attached so the `change` event can hand
 * it straight back.
 *
 * ```ts
 * combobox.items = createItems(users, {
 *   getValue: (user) => user.id,
 *   getLabel: (user) => user.name,
 * });
 * ```
 */
export function createItems<T>(
  records: Iterable<T>,
  options: {
    getValue: (record: T) => string | number;
    getLabel: (record: T) => string;
  },
): ComboboxItem<T>[] {
  return Array.from(records, (record) => ({
    value: String(options.getValue(record)),
    label: options.getLabel(record),
    item: record,
  }));
}

/** Detail of the `filterchange` event: live counts after each filter pass. */
export interface ComboboxCounts {
  /** Total items in the store. */
  readonly total: number;
  /** Items matching the current query. */
  readonly matched: number;
  /** Actual `<div>` rows in the DOM — constant regardless of `total`. */
  readonly domRows: number;
}

/** Detail of the `change` event dispatched when the selection changes. */
export interface ComboboxChangeDetail {
  /** The option just toggled/chosen (empty `value` when the list was cleared). */
  readonly value: string;
  readonly label: string;
  /** All currently-selected values (single → `[value]` or `[]`). */
  readonly values: string[];
  /** What caused the change — a press on a row, a chip's remove, the clear. */
  readonly reason: ChangeReason;
  /** The record behind the option, when the store was built by {@link createItems}. */
  readonly item?: unknown;
}

export class UICombobox extends FormAssociatedElement {
  protected override formControlOptions(): FormControlOptions {
    return {
      // Any committed selection satisfies `required` (multi → first value).
      value: () => (this.multiple ? ([...this.#selected.keys()][0] ?? null) : this.#selectedValue),
      onReset: () => this.#onFormReset(),
    };
  }
  protected override onFormDisabled(disabled: boolean) {
    this.toggleAttribute("data-disabled", disabled);
    this.#setInputDisabled?.(disabled);
  }
  #uid = nextId("cb");

  #input!: HTMLInputElement;
  #viewport!: HTMLElement;
  #empty: HTMLElement | null = null;
  #chips: HTMLElement | null = null;
  #clear: HTMLElement | null = null;
  /** Set the inner input's `disabled`, re-enabling only what we disabled. */
  #setInputDisabled: ((disabled: boolean) => void) | null = null;

  #options: ComboboxOptions | null = null;
  #all: ComboboxItem[] = []; // full data set (the store)
  #normalizedLabels: string[] = []; // normalize(#all[i].label), cached for filtering
  #byValue = new Map<string, ComboboxItem>(); // value → item, cached for lookups
  #filtered: ComboboxItem[] = []; // current filter result
  #controller: AriaCombobox | null = null;
  // Shared listbox keyboard engine over the virtual rows. POLICY: the combobox
  // wraps past the ends (like autocomplete and Base UI); paging clamps.
  #nav: ListNav = listNav({
    count: () => this.#filtered.length,
    activeIndex: () => this.#controller?.activeIndex ?? -1,
    onActive: (i) => this.#setActive(i),
    loop: true,
    onCommit: (i) => this.#selectIndex(i),
    page: () => this.#options?.pageSize ?? 1,
  });
  #selectedValue: string | null = null; // single-select
  #selected = new Map<string, string>(); // multi-select: value → label, in order

  static observedAttributes = ["readonly", "columns"];
  attributeChangedCallback(name: string) {
    if (name === "columns") this.#renderWindow();
    else this.#syncReadOnly();
  }

  /**
   * Cells per row. `1` (the default) is an ordinary one-column listbox; more
   * turns the popup into a `role="grid"` whose rows the arrow keys walk in two
   * dimensions — the shape an emoji or swatch picker wants. Virtualization is
   * unchanged: the pool now recycles *rows*, so a 10,000-item grid still holds a
   * constant number of elements.
   */
  get columns() {
    return Math.max(1, Math.trunc(numberAttribute(this, "columns", 1)));
  }
  get #grid() {
    return this.columns > 1;
  }

  /** Multi-select mode — options toggle without closing; `value` is an array. */
  get multiple() {
    return this.hasAttribute("multiple");
  }
  /**
   * Locks the *value*, not the interaction. Per WAI-ARIA an `aria-readonly`
   * widget is "not editable, but is otherwise operable": the popup still opens,
   * arrows and the highlight still move, and only committing a choice — a row
   * press, Enter, a chip's remove, the clear control — is refused. The input
   * itself becomes `readonly`, so there is no filtering to do either. An author
   * who wants the control inert wants `disabled`.
   */
  get readOnly() {
    return this.hasAttribute("readonly");
  }
  get value() {
    return this.multiple ? [...this.#selected.keys()] : this.#selectedValue;
  }
  set value(next: string | string[] | null) {
    if (this.multiple) {
      const arr = Array.isArray(next) ? next : next == null ? [] : [next];
      this.#selected = new Map(arr.map((v) => [v, this.#labelFor(v)]));
      this.#renderChips();
    } else {
      const v = Array.isArray(next) ? (next[0] ?? null) : next;
      const item = v == null ? null : (this.#byValue.get(v) ?? null);
      this.#selectedValue = item?.value ?? null;
      if (this.wired) this.#input.value = this.#selectedLabel;
    }
    this.#syncFormValue();
    if (this.#controller?.open) this.#renderWindow();
  }
  get counts() {
    return {
      total: this.#all.length,
      matched: this.#filtered.length,
      domRows: this.#options?.rowCount ?? 0,
    };
  }

  #labelFor(value: string) {
    return this.#byValue.get(value)?.label ?? value;
  }
  // Single source of truth: the committed single-select label is always derived
  // from #selectedValue, so it can't drift from the store.
  get #selectedLabel() {
    return this.#selectedValue == null ? "" : this.#labelFor(this.#selectedValue);
  }
  #isSelected(value: string) {
    return this.multiple ? this.#selected.has(value) : value === this.#selectedValue;
  }

  /** The store. Set as a property — there may be tens of thousands of items. */
  set items(arr: ComboboxItem[]) {
    this.#all = Array.isArray(arr) ? arr : [];
    // Both derived indexes are built once per item set, not once per read: the
    // normalized labels the filter scans (rather than normalizing every item on
    // every keystroke), and the value → item map every label lookup goes
    // through (rather than a linear scan of a store documented to hold 10,000+).
    const locale = localeOf(this);
    this.#normalizedLabels = this.#all.map((it) => normalize(it.label, locale));
    this.#byValue = new Map(this.#all.map((it) => [it.value, it]));
    if (this.wired) this.#applyFilter("");
  }

  #optId(index: number) {
    return `${this.#uid}-opt-${index}`;
  }

  override connectedCallback() {
    // Defer wiring to a microtask so the light-DOM children (input, popup,
    // viewport, spacer) have finished parsing/upgrading — a custom element's
    // `connectedCallback` can run before its children are inserted.
    super.connectedCallback();
  }

  protected override initialize() {
    const input =
      this.querySelector<HTMLInputElement>("[data-combobox-input]") ??
      this.querySelector<HTMLInputElement>("input");
    const popup = this.querySelector<HTMLElement>("ui-combobox-popup");
    const viewport = this.querySelector<HTMLElement>("ui-combobox-viewport");
    const spacer = this.querySelector<HTMLElement>("ui-combobox-spacer");
    if (!input || !popup || !viewport || !spacer) return false; // markup incomplete

    this.#input = input;
    this.#setInputDisabled = managedDisabled(input);
    this.#viewport = viewport;
    this.#options = new ComboboxOptions(input, viewport, spacer, (index) => this.#optId(index));
    this.#empty = this.querySelector<HTMLElement>("ui-combobox-empty");
    this.#chips = this.querySelector<HTMLElement>("ui-combobox-chips");
    this.#clear = this.querySelector<HTMLElement>("[data-combobox-clear]");
    input.addEventListener("click", () => this.#openForBrowsing("input-press"));

    if (this.multiple) viewport.setAttribute("aria-multiselectable", "true");
    this.#renderWindow();

    // Chip removal (delegated — chips are recycled) and the clear control.
    this.#chips?.addEventListener("click", this.#onChipClick);
    this.#clear?.addEventListener("click", this.#onClear);
    this.#renderChips();

    // Row interactions are delegated — rows are recycled, so we read data-index.
    viewport.addEventListener("scroll", this.#renderWindow, { passive: true });
    // Hover highlights the row under the pointer — but only when the pointer
    // actually moved, or scrolling the list would yank the highlight away from
    // the item the keyboard just navigated to (see {@link onPointerMoved}).
    onPointerMoved(viewport, (e) => {
      const row = (e.target as Element).closest("[data-index]") as HTMLElement | null;
      if (row) this.#setActive(Number(row.dataset.index), { scroll: false });
    });

    this.#controller = new AriaCombobox({
      input,
      popup,
      listbox: viewport,
      idPrefix: "cb",
      // The host is the dismiss/blur boundary, so chips and the clear control
      // are part of the widget and never light-dismiss it.
      host: this,
      // The viewport owns its own scroll height, so don't constrain it.
      anchorOptions: { offset: 6, padding: 8, constrainHeight: false },
      onInput: this.#onInput,
      onClose: (reason) => this.#close({ revert: true, reason }),
      onArrowOpen: (reason) => this.#openForBrowsing(reason),
      listboxRole: this.#grid ? "grid" : "listbox",
      onNavigate: (e) => this.#navigate(e),
      onOptionCommit: (index) => this.#selectIndex(index),
    });

    this.#syncReadOnly();
    if (this.#all.length) this.#applyFilter("");
    return true;
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#close();
  }

  // ---- store operations -------------------------------------------------
  #applyFilter(query: string) {
    const q = normalize(query, localeOf(this));
    this.#filtered =
      q === "" ? this.#all : this.#all.filter((_, i) => this.#normalizedLabels[i].includes(q));
    this.#viewport.scrollTop = 0;
    this.#empty?.toggleAttribute("hidden", this.#filtered.length > 0);
    this.#renderWindow();
    this.dispatchEvent(
      new CustomEvent<ComboboxCounts>("filterchange", { bubbles: true, detail: this.counts }),
    );
  }

  #renderWindow = () => {
    this.#options?.render(this.#filtered, {
      columns: this.columns,
      activeIndex: this.#controller?.activeIndex ?? -1,
      isSelected: (value) => this.#isSelected(value),
    });
  };

  // ---- active option (must be in the window to own an id) ---------------
  #setActive(index: number, { scroll = true }: { scroll?: boolean } = {}) {
    const total = this.#filtered.length;
    if (total === 0) {
      this.#controller?.setActive(-1, null);
      return;
    }
    index = clamp(index, 0, total - 1);
    this.#controller?.setActive(index, this.#optId(index));
    if (scroll) this.#options?.scrollTo(index);
    this.#renderWindow(); // now the active row is in the pool…
  }

  /**
   * Keyboard navigation. In a grid the arrows are two-dimensional — horizontal
   * moves one cell along the row, vertical one row down the column — and both
   * wrap, matching the list's own loop policy. Everything else (Enter, paging,
   * `Home`/`End`, typeahead) stays with the shared engine, which reads the flat
   * index the grid is projected from.
   */
  #navigate(event: KeyboardEvent) {
    if (this.#grid && this.#navigateGrid(event)) return;
    this.#nav.handle(event);
  }

  #navigateGrid(event: KeyboardEvent) {
    const total = this.#filtered.length;
    if (total === 0) return false;
    const columns = this.columns;
    const rows = Math.ceil(total / columns);
    const current = Math.max(0, this.#controller?.activeIndex ?? -1);
    const row = Math.floor(current / columns);
    const column = current % columns;
    const rtl = isRTL(this);
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const backward = rtl ? "ArrowRight" : "ArrowLeft";

    let target: number;
    if (event.key === forward || event.key === backward) {
      const delta = event.key === forward ? 1 : -1;
      // Wrap within the row, over however many cells this row actually has —
      // the last row of a grid is usually short.
      const width = Math.min(columns, total - row * columns);
      target = row * columns + ((column + delta + width) % width);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const delta = event.key === "ArrowDown" ? 1 : -1;
      // Wrap within the column, skipping past a short last row rather than
      // landing on a cell that holds nothing.
      let next = row;
      for (let step = 0; step < rows; step++) {
        next = (next + delta + rows) % rows;
        if (next * columns + column < total) break;
      }
      target = next * columns + column;
    } else {
      return false;
    }

    event.preventDefault();
    this.#setActive(target);
    return true;
  }

  // ---- input ------------------------------------------------------------
  #onInput = () => {
    this.#open("input-change");
    this.#applyFilter(this.#input.value);
    this.#setActive(0); // autoHighlight first match
  };

  // ---- open / close -----------------------------------------------------
  #open(reason: ChangeReason = "none") {
    if (!this.#controller?.show(reason)) return;
    this.#options?.measure();
    this.#renderWindow();
  }

  #openForBrowsing(reason: ChangeReason = "none") {
    this.#open(reason);
    // Preserve an in-progress query: only reset to the full list when the input
    // is empty or still shows the committed selection's label. Filtering by
    // whatever is typed keeps the list in sync with the visible text.
    const query =
      !this.multiple && this.#input.value === this.#selectedLabel ? "" : this.#input.value;
    this.#applyFilter(query);
    // Highlight the committed option when browsing the full list (single mode).
    const sel =
      !this.multiple && query === ""
        ? this.#filtered.findIndex((it) => it.value === this.#selectedValue)
        : 0;
    this.#setActive(sel >= 0 ? sel : 0);
  }

  #close({ revert = false, reason = "none" }: { revert?: boolean; reason?: ChangeReason } = {}) {
    if (!this.#controller?.hide(reason)) return;
    // Restore the committed text; in multi-select the selection lives in chips,
    // so the input just clears.
    if (revert) this.#input.value = this.multiple ? "" : this.#selectedLabel;
  }

  // ---- selection --------------------------------------------------------
  #selectIndex(index: number) {
    const item = this.#filtered[index];
    // `readonly` locks the value: browsing got the user here, committing is
    // where it stops.
    if (!item || this.readOnly) return;
    if (this.multiple) {
      // Toggle membership and keep the popup open for more picks; the input
      // clears so the next keystroke starts a fresh filter.
      if (this.#selected.has(item.value)) this.#selected.delete(item.value);
      else this.#selected.set(item.value, item.label);
      this.#renderChips();
      this.#syncFormValue();
      this.#input.value = "";
      this.#applyFilter("");
      const at = this.#filtered.indexOf(item);
      this.#setActive(at >= 0 ? at : 0);
      this.#input.focus();
      this.#emitChange(item.value, item.label, "item-press", item.item);
      return;
    }
    this.#selectedValue = item.value;
    this.#input.value = item.label;
    this.#syncFormValue();
    this.#close({ reason: "item-press" });
    this.#emitChange(item.value, item.label, "item-press", item.item);
  }

  #emitChange(value: string, label: string, reason: ChangeReason, item?: unknown) {
    this.dispatchEvent(
      new CustomEvent<ComboboxChangeDetail>("change", {
        bubbles: true,
        detail: {
          value,
          label,
          values: this.multiple
            ? [...this.#selected.keys()]
            : this.#selectedValue
              ? [this.#selectedValue]
              : [],
          reason,
          item,
        },
      }),
    );
  }

  /**
   * Mirror `readonly` onto the host, the input and the listbox. The input's own
   * `readOnly` is what actually stops typing; the rest is the styling and
   * assistive-tech half of the same state.
   */
  #syncReadOnly() {
    const readOnly = this.readOnly;
    this.toggleAttribute("data-readonly", readOnly);
    // Reflected on the host from the first attribute change, but the inner
    // parts only exist once `wire` has found them.
    if (!this.#input) return;
    this.#input.readOnly = readOnly;
    for (const el of [this.#input, this.#viewport]) {
      el.toggleAttribute("data-readonly", readOnly);
      if (readOnly) el.setAttribute("aria-readonly", "true");
      else el.removeAttribute("aria-readonly");
    }
  }

  #syncFormValue() {
    if (this.multiple) {
      const name = this.name;
      if (!name) {
        this.formControl.setValue(null);
        return;
      }
      const data = new FormData();
      for (const v of this.#selected.keys()) data.append(name, v);
      this.formControl.setValue(data);
    } else {
      this.formControl.setValue(this.#selectedValue);
    }
  }

  /** `form.reset()`: clear the selection and input (there is no markup preset —
   * items arrive via the `items` property, so the default is empty). */
  #onFormReset() {
    this.#selected.clear();
    this.#selectedValue = null;
    if (this.wired) {
      this.#renderChips();
      this.#input.value = "";
      if (this.#controller?.open) this.#renderWindow();
    }
    this.#syncFormValue();
  }

  /**
   * One-way managed disable of the inner input on form-driven disabled (host
   * `disabled` attribute / disabled `<fieldset>` ancestor): re-enabling only
   * touches an input *we* disabled, never one the author disabled directly.
   */

  // ---- chips (multi-select) ---------------------------------------------
  #renderChips() {
    const chips = this.#chips;
    if (!chips) return;
    chips.textContent = "";
    for (const [value, label] of this.#selected) {
      const chip = document.createElement("ui-combobox-chip");
      chip.dataset.value = value;
      const text = document.createElement("span");
      text.textContent = label;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.setAttribute("data-combobox-chip-remove", "");
      remove.setAttribute("aria-label", `Remove ${label}`);
      chip.appendChild(text);
      chip.appendChild(remove);
      chips.appendChild(chip);
    }
  }

  #onChipClick = (e: MouseEvent) => {
    const btn = (e.target as Element).closest("[data-combobox-chip-remove]");
    if (!btn || this.readOnly) return;
    const chip = btn.closest("ui-combobox-chip") as HTMLElement | null;
    const value = chip?.dataset.value;
    if (value == null || !this.#selected.has(value)) return;
    const label = this.#selected.get(value) ?? "";
    this.#selected.delete(value);
    this.#renderChips();
    this.#syncFormValue();
    if (this.#controller?.open) this.#renderWindow();
    this.#input.focus();
    this.#emitChange(value, label, "chip-remove-press");
  };

  #onClear = () => {
    if (this.readOnly) return;
    if (this.multiple) {
      this.#selected.clear();
      this.#renderChips();
    } else {
      this.#selectedValue = null;
    }
    this.#input.value = "";
    this.#syncFormValue();
    if (this.#controller?.open) this.#applyFilter("");
    this.#input.focus();
    this.#emitChange("", "", "clear-press");
  };
}

export class UIComboboxPopup extends UIPopupElement {}
export class UIComboboxViewport extends HTMLElement {}
export class UIComboboxSpacer extends HTMLElement {}
export class UIComboboxEmpty extends HTMLElement {}
/** Container the combobox renders selected-value chips into (multi-select). */
export class UIComboboxChips extends HTMLElement {}
/** One selected-value chip (rendered by the combobox). */
export class UIComboboxChip extends HTMLElement {}

define("ui-combobox", UICombobox);
define("ui-combobox-popup", UIComboboxPopup);
define("ui-combobox-viewport", UIComboboxViewport);
define("ui-combobox-spacer", UIComboboxSpacer);
define("ui-combobox-empty", UIComboboxEmpty);
define("ui-combobox-chips", UIComboboxChips);
define("ui-combobox-chip", UIComboboxChip);

declare global {
  interface HTMLElementTagNameMap {
    "ui-combobox": UICombobox;
    "ui-combobox-popup": UIComboboxPopup;
    "ui-combobox-viewport": UIComboboxViewport;
    "ui-combobox-spacer": UIComboboxSpacer;
    "ui-combobox-empty": UIComboboxEmpty;
    "ui-combobox-chips": UIComboboxChips;
    "ui-combobox-chip": UIComboboxChip;
  }
}
