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
 * of 10,000" correctly under virtualization.
 *
 * The element is **form-associated** via {@link ElementInternals}: its selected
 * `value` participates in `<form>` submission and `FormData` under its `name`.
 *
 * The `multiple` attribute switches to multi-select: choosing an option toggles
 * it (the popup stays open), each pick renders a removable `<ui-combobox-chip>`
 * into a `<ui-combobox-chips>` container, a `[data-combobox-clear]` control
 * empties the selection, `value` becomes a `string[]`, and every value submits
 * under `name`.
 */
import { AriaCombobox } from "./combobox-core.ts";
import { nextId } from "./id.ts";
import { connectLightDom } from "./lifecycle.ts";
import { normalize } from "./text.ts";

/** A single combobox option. Supplied via the `items` property, not markup. */
export interface ComboboxItem {
  readonly value: string;
  readonly label: string;
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
}

const ROW_H = 36; // must match the consumer's `.cb-row` height
const OVERSCAN = 4; // rows rendered beyond each edge of the viewport

export class UICombobox extends HTMLElement {
  static formAssociated = true;

  // `attachInternals` is guarded so the element can still be constructed in
  // environments without form-association support (e.g. happy-dom under test);
  // form-value calls then become no-ops.
  #internals: ElementInternals | null = this.attachInternals?.() ?? null;
  #uid = nextId("cb");

  #input!: HTMLInputElement;
  #viewport!: HTMLElement;
  #spacer!: HTMLElement;
  #empty: HTMLElement | null = null;
  #chips: HTMLElement | null = null;
  #clear: HTMLElement | null = null;
  #wired = false;

  #rows: HTMLDivElement[] = []; // recycled row pool — the ONLY option elements
  #all: ComboboxItem[] = []; // full data set (the store)
  #normalizedLabels: string[] = []; // normalize(#all[i].label), cached for filtering
  #filtered: ComboboxItem[] = []; // current filter result
  #controller: AriaCombobox | null = null;
  #selectedValue: string | null = null; // single-select
  #selected = new Map<string, string>(); // multi-select: value → label, in order

  get form(): HTMLFormElement | null {
    return this.#internals?.form ?? null;
  }
  get name(): string | null {
    return this.getAttribute("name");
  }
  /** Multi-select mode — options toggle without closing; `value` is an array. */
  get multiple(): boolean {
    return this.hasAttribute("multiple");
  }
  get value(): string | string[] | null {
    return this.multiple ? [...this.#selected.keys()] : this.#selectedValue;
  }
  set value(next: string | string[] | null) {
    if (this.multiple) {
      const arr = Array.isArray(next) ? next : next == null ? [] : [next];
      this.#selected = new Map(arr.map((v) => [v, this.#labelFor(v)]));
      this.#renderChips();
    } else {
      const v = Array.isArray(next) ? (next[0] ?? null) : next;
      const item = v == null ? null : (this.#all.find((it) => it.value === v) ?? null);
      this.#selectedValue = item?.value ?? null;
      if (this.#wired) this.#input.value = this.#selectedLabel;
    }
    this.#syncFormValue();
    if (this.#controller?.open) this.#renderWindow();
  }
  get counts(): ComboboxCounts {
    return { total: this.#all.length, matched: this.#filtered.length, domRows: this.#rows.length };
  }

  #labelFor(value: string): string {
    return this.#all.find((it) => it.value === value)?.label ?? value;
  }
  // Single source of truth: the committed single-select label is always derived
  // from #selectedValue, so it can't drift from the store.
  get #selectedLabel(): string {
    return this.#selectedValue == null ? "" : this.#labelFor(this.#selectedValue);
  }
  #isSelected(value: string): boolean {
    return this.multiple ? this.#selected.has(value) : value === this.#selectedValue;
  }

  /** The store. Set as a property — there may be tens of thousands of items. */
  set items(arr: ComboboxItem[]) {
    this.#all = Array.isArray(arr) ? arr : [];
    // Normalize once per item set, not once per item per keystroke.
    this.#normalizedLabels = this.#all.map((it) => normalize(it.label));
    if (this.#wired) this.#applyFilter("");
  }

  #optId(index: number): string {
    return `${this.#uid}-opt-${index}`;
  }

  connectedCallback() {
    // Defer wiring to a microtask so the light-DOM children (input, popup,
    // viewport, spacer) have finished parsing/upgrading — a custom element's
    // `connectedCallback` can run before its children are inserted.
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    const input =
      this.querySelector<HTMLInputElement>("[data-combobox-input]") ??
      this.querySelector<HTMLInputElement>("input");
    const popup = this.querySelector<HTMLElement>("ui-combobox-popup");
    const viewport = this.querySelector<HTMLElement>("ui-combobox-viewport");
    const spacer = this.querySelector<HTMLElement>("ui-combobox-spacer");
    if (!input || !popup || !viewport || !spacer) return; // markup incomplete

    this.#input = input;
    this.#viewport = viewport;
    this.#spacer = spacer;
    this.#empty = this.querySelector<HTMLElement>("ui-combobox-empty");
    this.#chips = this.querySelector<HTMLElement>("ui-combobox-chips");
    this.#clear = this.querySelector<HTMLElement>("[data-combobox-clear]");
    input.addEventListener("click", () => this.#openForBrowsing());

    if (this.multiple) viewport.setAttribute("aria-multiselectable", "true");
    spacer.setAttribute("role", "presentation");
    this.#ensurePool();

    // Chip removal (delegated — chips are recycled) and the clear control.
    this.#chips?.addEventListener("click", this.#onChipClick);
    this.#clear?.addEventListener("click", this.#onClear);
    this.#renderChips();

    // Row interactions are delegated — rows are recycled, so we read data-index.
    viewport.addEventListener("scroll", this.#renderWindow, { passive: true });
    viewport.addEventListener("pointermove", (e) => {
      const row = (e.target as Element).closest("[data-index]") as HTMLElement | null;
      if (row) this.#setActive(Number(row.dataset.index), { scroll: false });
    });

    this.#controller = new AriaCombobox({
      input,
      popup,
      listbox: viewport,
      idPrefix: "cb",
      // The viewport owns its own scroll height, so don't constrain it.
      anchorOptions: { offset: 6, padding: 8, constrainHeight: false },
      // Chips and clear are part of the widget and must not light-dismiss it.
      dismissWithin: () => [popup, input, this.#chips, this.#clear],
      onDismiss: () => this.#close({ revert: true }),
      onInput: this.#onInput,
      onKeydown: this.#onKeydown,
      onBlur: this.#onBlur,
      onOptionCommit: (index) => this.#selectIndex(index),
    });

    this.#wired = true;
    if (this.#all.length) this.#applyFilter("");
  }

  disconnectedCallback() {
    this.#close();
  }

  // ---- recycled DOM pool ------------------------------------------------
  // Grow the pool to cover the current viewport height plus overscan. Built
  // once at wire time (when the popup is `display:none`, clientHeight is 0 so we
  // fall back to a nominal 9 visible rows) and re-run on open once the popup has
  // real layout — a taller popup than the fallback then gets enough rows to fill
  // it instead of leaving its lower rows permanently unrendered.
  #ensurePool() {
    const visible = this.#viewport.clientHeight
      ? Math.ceil(this.#viewport.clientHeight / ROW_H)
      : 9;
    const needed = visible + OVERSCAN * 2;
    for (let i = this.#rows.length; i < needed; i++) {
      const row = document.createElement("div");
      row.className = "cb-row";
      row.setAttribute("role", "option");
      row.hidden = true;
      this.#spacer.appendChild(row);
      this.#rows.push(row);
    }
  }

  // ---- store operations -------------------------------------------------
  #applyFilter(query: string) {
    const q = normalize(query);
    this.#filtered =
      q === "" ? this.#all : this.#all.filter((_, i) => this.#normalizedLabels[i].includes(q));
    this.#spacer.style.height = `${this.#filtered.length * ROW_H}px`; // full virtual height
    this.#viewport.scrollTop = 0;
    this.#empty?.toggleAttribute("hidden", this.#filtered.length > 0);
    this.#renderWindow();
    this.dispatchEvent(
      new CustomEvent<ComboboxCounts>("filterchange", { bubbles: true, detail: this.counts }),
    );
  }

  /** Project the currently-scrolled slice of #filtered onto the fixed pool. */
  #renderWindow = () => {
    const total = this.#filtered.length;
    const scrollTop = this.#viewport.scrollTop;
    const maxFirst = Math.max(0, total - this.#rows.length);
    const first = Math.max(0, Math.min(Math.floor(scrollTop / ROW_H) - OVERSCAN, maxFirst));
    for (let p = 0; p < this.#rows.length; p++) {
      const row = this.#rows[p];
      const index = first + p;
      if (index >= total) {
        row.hidden = true;
        row.removeAttribute("id");
        row.removeAttribute("data-index");
        continue;
      }
      const item = this.#filtered[index];
      row.hidden = false;
      row.style.transform = `translateY(${index * ROW_H}px)`;
      row.textContent = item.label;
      row.id = this.#optId(index);
      row.dataset.index = String(index);
      row.setAttribute("aria-posinset", String(index + 1)); // virtualization a11y:
      row.setAttribute("aria-setsize", String(total)); // "row 4,213 of 10,000"
      row.setAttribute("aria-selected", String(this.#isSelected(item.value)));
      row.toggleAttribute("data-highlighted", index === this.#controller?.activeIndex);
    }
  };

  // ---- active option (must be in the window to own an id) ---------------
  #setActive(index: number, { scroll = true }: { scroll?: boolean } = {}) {
    const total = this.#filtered.length;
    if (total === 0) {
      this.#controller?.setActive(-1, null);
      return;
    }
    index = Math.max(0, Math.min(index, total - 1));
    this.#controller?.setActive(index, this.#optId(index));
    if (scroll) {
      const top = index * ROW_H;
      const bottom = top + ROW_H;
      const vh = this.#viewport.clientHeight;
      if (top < this.#viewport.scrollTop) this.#viewport.scrollTop = top;
      else if (bottom > this.#viewport.scrollTop + vh) this.#viewport.scrollTop = bottom - vh;
    }
    this.#renderWindow(); // now the active row is in the pool…
  }

  // ---- keyboard ---------------------------------------------------------
  #onInput = () => {
    this.#open();
    this.#applyFilter(this.#input.value);
    this.#setActive(0); // autoHighlight first match
  };

  #onKeydown = (e: KeyboardEvent) => {
    const page = Math.max(1, Math.floor(this.#viewport.clientHeight / ROW_H) - 1);
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (this.#controller?.open) this.#setActive(this.#controller.activeIndex + 1);
        else this.#openForBrowsing();
        break;
      case "ArrowUp":
        e.preventDefault();
        if (this.#controller?.open) this.#setActive(this.#controller.activeIndex - 1);
        else this.#openForBrowsing();
        break;
      case "PageDown":
        if (this.#controller?.open) {
          e.preventDefault();
          this.#setActive(this.#controller.activeIndex + page);
        }
        break;
      case "PageUp":
        if (this.#controller?.open) {
          e.preventDefault();
          this.#setActive(this.#controller.activeIndex - page);
        }
        break;
      case "Home":
        if (this.#controller?.open) {
          e.preventDefault();
          this.#setActive(0);
        }
        break;
      case "End":
        if (this.#controller?.open) {
          e.preventDefault();
          this.#setActive(this.#filtered.length - 1);
        }
        break;
      case "Enter":
        if (this.#controller?.open && this.#controller.activeIndex >= 0) {
          e.preventDefault();
          this.#selectIndex(this.#controller.activeIndex);
        }
        break;
      case "Escape":
        if (this.#controller?.open) {
          e.preventDefault();
          this.#close({ revert: true });
        }
        break;
    }
  };

  #onBlur = (e: FocusEvent) => {
    if (!this.contains(e.relatedTarget as Node | null)) this.#close({ revert: true });
  };

  // ---- open / close -----------------------------------------------------
  #open() {
    if (!this.#controller?.show()) return;
    // The popup now has real layout — grow the row pool to fill its height.
    this.#ensurePool();
  }

  #openForBrowsing() {
    this.#open();
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

  #close({ revert = false }: { revert?: boolean } = {}) {
    if (!this.#controller?.hide()) return;
    // Restore the committed text; in multi-select the selection lives in chips,
    // so the input just clears.
    if (revert) this.#input.value = this.multiple ? "" : this.#selectedLabel;
  }

  // ---- selection --------------------------------------------------------
  #selectIndex(index: number) {
    const item = this.#filtered[index];
    if (!item) return;
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
      this.#emitChange(item.value, item.label);
      return;
    }
    this.#selectedValue = item.value;
    this.#input.value = item.label;
    this.#syncFormValue();
    this.#close();
    this.#emitChange(item.value, item.label);
  }

  #emitChange(value: string, label: string) {
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
        },
      }),
    );
  }

  #syncFormValue() {
    if (!this.#internals) return;
    if (this.multiple) {
      const name = this.name;
      if (!name) {
        this.#internals.setFormValue(null);
        return;
      }
      const data = new FormData();
      for (const v of this.#selected.keys()) data.append(name, v);
      this.#internals.setFormValue(data);
    } else {
      this.#internals.setFormValue(this.#selectedValue);
    }
  }

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
    if (!btn) return;
    const chip = btn.closest("ui-combobox-chip") as HTMLElement | null;
    const value = chip?.dataset.value;
    if (value == null || !this.#selected.has(value)) return;
    const label = this.#selected.get(value) ?? "";
    this.#selected.delete(value);
    this.#renderChips();
    this.#syncFormValue();
    if (this.#controller?.open) this.#renderWindow();
    this.#input.focus();
    this.#emitChange(value, label);
  };

  #onClear = () => {
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
    this.#emitChange("", "");
  };
}

export class UIComboboxPopup extends HTMLElement {
  connectedCallback() {
    this.setAttribute("popover", "manual");
  }
}
export class UIComboboxViewport extends HTMLElement {}
export class UIComboboxSpacer extends HTMLElement {}
export class UIComboboxEmpty extends HTMLElement {}
/** Container the combobox renders selected-value chips into (multi-select). */
export class UIComboboxChips extends HTMLElement {}
/** One selected-value chip (rendered by the combobox). */
export class UIComboboxChip extends HTMLElement {}

if (!customElements.get("ui-combobox")) customElements.define("ui-combobox", UICombobox);
if (!customElements.get("ui-combobox-popup"))
  customElements.define("ui-combobox-popup", UIComboboxPopup);
if (!customElements.get("ui-combobox-viewport"))
  customElements.define("ui-combobox-viewport", UIComboboxViewport);
if (!customElements.get("ui-combobox-spacer"))
  customElements.define("ui-combobox-spacer", UIComboboxSpacer);
if (!customElements.get("ui-combobox-empty"))
  customElements.define("ui-combobox-empty", UIComboboxEmpty);
if (!customElements.get("ui-combobox-chips"))
  customElements.define("ui-combobox-chips", UIComboboxChips);
if (!customElements.get("ui-combobox-chip"))
  customElements.define("ui-combobox-chip", UIComboboxChip);

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
