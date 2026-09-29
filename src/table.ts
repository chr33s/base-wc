/**
 * `ui-table` — a light-DOM enhancer for native `<table>` markup.
 *
 * The table remains a real table with no JavaScript. On upgrade this component
 * adds behavioural affordances that are shared across admin/storefront surfaces:
 * sortable headers (`th[data-sort-key]`), row selection checkboxes, loading and
 * pagination state, responsive-list metadata on cells, and click delegation from
 * a row to an existing in-row primary action.
 */
import { LightDomElement } from "./lifecycle.ts";
import { define } from "./define.ts";
import type { ChangeNotification } from "./reasons.ts";

/** Layout mode: a responsive `list`, a classic `table`, or `auto` to let CSS decide. */
export type UITableVariant = "auto" | "list" | "table";
/** Value of `aria-sort` on a sorted column. */
export type UITableSortDirection = "ascending" | "descending";
/** How a column's cells are formatted and sorted (`numeric`/`currency` sort by number). */
export type UITableHeaderFormat = "base" | "numeric" | "currency";
/** Placement of a cell within a row when the table renders as a list. */
export type UITableListSlot = "primary" | "secondary" | "kicker" | "inline" | "labeled";

/** Detail of the bubbling `sort` event. */
export interface UITableSortDetail {
  readonly key: string;
  readonly direction: UITableSortDirection;
  readonly index: number;
}

/** Detail of the bubbling `selectionchange` event. */
export interface UITableSelectionDetail {
  readonly selected: number;
  readonly total: number;
  readonly values: ReadonlyArray<string>;
}

/** Detail of the bubbling `previouspage` / `nextpage` events. */
export interface UITablePageDetail {
  readonly direction: "previous" | "next";
}

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "[role='button']",
  "[role='link']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** Selectors for the `data-table-*` hooks this enhancer reads and generates. */
const SELECTOR = {
  selectAll: "input[type='checkbox'][data-table-select-all]",
  selectRow: "input[type='checkbox'][data-table-select-row]",
  controls: "[data-table-controls]",
  controlsRow: "[data-table-controls-row]",
  controlsCell: "[data-table-controls-cell]",
  filters: "[data-table-filters]",
  bulk: "[data-table-bulk]",
  bulkItem: "[data-table-selected-count], [data-table-bulk-action]",
  pagination: "[data-table-pagination]",
  paginationRow: "[data-table-pagination-row]",
  paginationCell: "[data-table-pagination-cell]",
  previous: "[data-table-previous]",
  next: "[data-table-next]",
} as const;

const isCheckbox = (value: Element | null): value is HTMLInputElement =>
  value instanceof HTMLInputElement && value.type === "checkbox";

/** Narrow an attribute value to one of `allowed`, else `fallback`. */
function oneOf<const T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

const numberValue = (text: string) => {
  const parsed = Number(text.replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Light-DOM enhancer adding sorting, selection, pagination and list metadata to a native `<table>`. */
export class UITable extends LightDomElement {
  static observedAttributes = [
    "variant",
    "loading",
    "paginate",
    "has-previous-page",
    "has-next-page",
  ];

  #table: HTMLTableElement | null = null;
  #generatedPagination: HTMLElement | null = null;
  #mutation: MutationObserver | null = null;

  /** Layout mode from the `variant` attribute (`auto` by default). */
  get variant(): UITableVariant {
    return oneOf(this.getAttribute("variant"), ["auto", "list", "table"], "auto");
  }
  set variant(next: UITableVariant) {
    this.setAttribute("variant", next);
  }

  /** Whether the table is busy (`loading` attribute); sets `aria-busy` and disables paging. */
  get loading(): boolean {
    return this.hasAttribute("loading");
  }
  set loading(next: boolean) {
    this.toggleAttribute("loading", next);
  }

  /** Whether pagination controls are shown. */
  get paginate(): boolean {
    return this.hasAttribute("paginate");
  }
  set paginate(next: boolean) {
    this.toggleAttribute("paginate", next);
  }

  /** Whether a previous page exists (enables the previous control). */
  get hasPreviousPage(): boolean {
    return this.hasAttribute("has-previous-page");
  }
  set hasPreviousPage(next: boolean) {
    this.toggleAttribute("has-previous-page", next);
  }

  /** Whether a next page exists (enables the next control). */
  get hasNextPage(): boolean {
    return this.hasAttribute("has-next-page");
  }
  set hasNextPage(next: boolean) {
    this.toggleAttribute("has-next-page", next);
  }

  /** Values of the checked row-selection boxes, in DOM order. */
  get selectedValues(): string[] {
    return this.#rowBoxes()
      .filter((box) => box.checked)
      .map((box) => box.value);
  }

  attributeChangedCallback() {
    this.#sync();
  }

  /** Re-read table headers/rows after the consumer changes table structure. */
  refresh(): void {
    this.#withObserverPaused(() => {
      this.#table = this.querySelector("table");
      this.#ensureControls();
      this.#annotateCells();
      this.#syncSelection("silent");
      this.#sync();
    });
  }

  protected override initialize() {
    return this.querySelector("table") !== null;
  }

  protected override connectResources() {
    this.addEventListener("click", this.#onClick);
    this.addEventListener("change", this.#onChange);
    this.refresh();
    this.#mutation = new MutationObserver(() => this.refresh());
    this.#observe();
    return () => {
      this.removeEventListener("click", this.#onClick);
      this.removeEventListener("change", this.#onChange);
      this.#mutation?.disconnect();
      this.#mutation = null;
    };
  }

  #observe() {
    // With no table yet (or after it was replaced while detached), watch the
    // host so a table that arrives later is picked up.
    this.#mutation?.observe(this.#table ?? this, { childList: true, subtree: true });
  }

  /**
   * Run `fn` with the structural MutationObserver paused, so our own DOM edits
   * (sorting rows, generating controls/pagination) do not self-trigger a
   * redundant `refresh()`.
   */
  #withObserverPaused(fn: () => void) {
    this.#mutation?.disconnect();
    try {
      fn();
    } finally {
      this.#observe();
    }
  }

  #sync() {
    this.dataset.variant = this.variant;
    this.toggleAttribute("data-loading", this.loading);
    this.setAttribute("aria-busy", String(this.loading));
    if (this.wired) this.#syncPagination();
  }

  #headers() {
    const row = this.#headerRow();
    return row ? this.#cells(row) : [];
  }

  #headerRow() {
    const thead = this.#table?.tHead;
    if (!thead) return null;
    return (
      Array.from(thead.querySelectorAll<HTMLTableRowElement>("tr")).find(
        (row) => !row.hasAttribute("data-table-controls-row"),
      ) ?? null
    );
  }

  #bodyRows() {
    return this.#table?.tBodies[0]
      ? Array.from(this.#table.tBodies[0].querySelectorAll<HTMLTableRowElement>("tr"))
      : [];
  }

  #cells(row: Element) {
    return Array.from(row.children).filter(
      (child): child is HTMLTableCellElement => child instanceof HTMLTableCellElement,
    );
  }

  #columnCount() {
    const headerCount = this.#headers().length;
    if (headerCount > 0) return headerCount;
    return Math.max(1, ...this.#bodyRows().map((row) => this.#cells(row).length));
  }

  /** Stretch a generated controls/pagination cell across every data column. */
  #spanAllColumns(cell: HTMLTableCellElement | null | undefined) {
    if (cell) cell.colSpan = this.#columnCount();
  }

  #rowBoxes() {
    return [...this.querySelectorAll<HTMLInputElement>(SELECTOR.selectRow)];
  }

  #selectAll() {
    return this.querySelector<HTMLInputElement>(SELECTOR.selectAll);
  }

  #ensureControls() {
    if (!this.#table) return;
    const filters = this.#movableControls(SELECTOR.filters);
    const bulk = this.#movableControls(SELECTOR.bulk);
    const looseBulk = this.#movableControls(SELECTOR.bulkItem).filter(
      (item) => !item.closest(SELECTOR.bulk),
    );
    const existing = this.#table.querySelector<HTMLElement>(SELECTOR.controls);
    if (!existing && filters.length === 0 && bulk.length === 0 && looseBulk.length === 0) return;

    const controls = this.#controlsContainer(this.#table);
    for (const item of filters) controls.append(item);
    for (const item of bulk) controls.append(item);
    if (looseBulk.length > 0) {
      let group = controls.querySelector<HTMLElement>(SELECTOR.bulk);
      if (!group) {
        group = document.createElement("div");
        group.setAttribute("data-table-bulk", "");
        controls.append(group);
      }
      for (const item of looseBulk) group.append(item);
    }
  }

  #movableControls(selector: string) {
    return Array.from(this.querySelectorAll<HTMLElement>(selector)).filter(
      (item) => !item.closest(SELECTOR.controls),
    );
  }

  #controlsContainer(table: HTMLTableElement) {
    const thead = table.tHead ?? table.createTHead();
    let row = thead.querySelector<HTMLTableRowElement>(SELECTOR.controlsRow);
    if (!row) {
      row = document.createElement("tr");
      row.setAttribute("data-table-controls-row", "");
      thead.insertBefore(row, thead.firstElementChild);
    }

    let cell = row.querySelector<HTMLTableCellElement>(SELECTOR.controlsCell);
    if (!cell) {
      cell = document.createElement("td");
      cell.setAttribute("data-table-controls-cell", "");
      row.append(cell);
    }
    this.#spanAllColumns(cell);

    let controls = cell.querySelector<HTMLElement>(SELECTOR.controls);
    if (!controls) {
      controls = document.createElement("div");
      controls.setAttribute("data-table-controls", "");
      cell.append(controls);
    }
    return controls;
  }

  #annotateCells() {
    const headers = this.#headers();
    this.#headerRow()?.setAttribute("data-table-header-row", "");
    this.#spanAllColumns(this.#table?.querySelector<HTMLTableCellElement>(SELECTOR.controlsCell));
    headers.forEach((header) => {
      const sortable = header.hasAttribute("data-sort-key");
      header.toggleAttribute("data-sortable", sortable);
      header.dataset.format = this.#headerFormat(header);
      if (sortable) {
        if (!header.hasAttribute("aria-sort")) header.setAttribute("aria-sort", "none");
        this.#ensureSortButton(header);
      }
    });

    for (const row of this.#bodyRows()) {
      row.setAttribute("data-table-row", "");
      const cells = this.#cells(row);
      for (const [index, cell] of cells.entries()) {
        const header = headers[index];
        if (!header) continue;
        const label = header.textContent?.trim() ?? "";
        if (label) cell.dataset.label = label;
        cell.dataset.listSlot = this.#headerListSlot(header);
        cell.dataset.format = this.#headerFormat(header);
      }
    }
  }

  /** Wrap a sortable header's content in a real button so it exposes activatable button semantics while the `th` keeps `aria-sort`. */
  #ensureSortButton(header: HTMLTableCellElement) {
    if (header.querySelector("button[data-table-sort]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-table-sort", "");
    while (header.firstChild) button.append(header.firstChild);
    header.append(button);
  }

  #headerFormat(header: Element): UITableHeaderFormat {
    return oneOf(
      header.getAttribute("data-format") ?? header.getAttribute("format"),
      ["base", "numeric", "currency"],
      "base",
    );
  }

  #headerListSlot(header: Element): UITableListSlot {
    return oneOf(
      header.getAttribute("data-list-slot"),
      ["primary", "secondary", "kicker", "inline", "labeled"],
      "labeled",
    );
  }

  #sort(header: HTMLTableCellElement) {
    const tbody = this.#table?.tBodies[0];
    const headers = this.#headers();
    const index = headers.indexOf(header);
    const key = header.getAttribute("data-sort-key");
    if (!tbody || !key || index < 0) return;

    const direction: UITableSortDirection =
      header.getAttribute("aria-sort") === "ascending" ? "descending" : "ascending";
    const numeric = this.#headerFormat(header) !== "base";
    // Derive each row's sort key once. Reading it inside the comparator instead
    // would re-filter the row's children twice per comparison — O(n log n) array
    // builds — and re-derive the collation options on every text compare.
    const collator = numeric
      ? null
      : new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    const keyed = Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr"), (row) => {
      const text = this.#cells(row)[index]?.textContent?.trim() ?? "";
      return { row, text, number: numeric ? numberValue(text) : 0 };
    });
    const sign = direction === "ascending" ? 1 : -1;
    keyed.sort(
      (a, b) => sign * (collator ? collator.compare(a.text, b.text) : a.number - b.number),
    );

    this.#withObserverPaused(() => {
      for (const item of headers) {
        if (item.hasAttribute("data-sort-key")) item.setAttribute("aria-sort", "none");
        else item.removeAttribute("aria-sort");
      }
      header.setAttribute("aria-sort", direction);
      for (const { row } of keyed) tbody.appendChild(row);
    });

    this.dispatchEvent(
      new CustomEvent<UITableSortDetail>("sort", {
        bubbles: true,
        detail: { key, direction, index },
      }),
    );
  }

  #syncSelection(notify: ChangeNotification) {
    const boxes = this.#rowBoxes();
    const selected = boxes.filter((box) => box.checked);
    const selectAll = this.#selectAll();
    if (selectAll) {
      this.#setBox(
        selectAll,
        selected.length > 0 && selected.length === boxes.length,
        selected.length > 0 && selected.length < boxes.length,
      );
      selectAll.disabled = boxes.length === 0;
    }

    this.toggleAttribute("data-selected", selected.length > 0);
    this.setAttribute("data-selected-count", String(selected.length));
    for (const count of this.querySelectorAll<HTMLElement>("[data-table-selected-count]")) {
      if (!count.hasAttribute("role")) count.setAttribute("role", "status");
      count.hidden = selected.length === 0;
      count.textContent = selected.length ? `${selected.length} selected` : "";
    }
    for (const action of this.querySelectorAll<HTMLButtonElement>(
      "button[data-table-bulk-action]",
    )) {
      action.disabled = selected.length === 0;
    }

    if (notify === "emit") {
      this.dispatchEvent(
        new CustomEvent<UITableSelectionDetail>("selectionchange", {
          bubbles: true,
          detail: {
            selected: selected.length,
            total: boxes.length,
            values: selected.map((box) => box.value),
          },
        }),
      );
    }
  }

  #setBox(box: HTMLInputElement, checked: boolean, indeterminate = false) {
    box.checked = checked;
    box.indeterminate = indeterminate;
    box.dispatchEvent(new Event("input", { bubbles: true }));
  }

  #syncPagination() {
    if (!this.#table) return;
    this.#withObserverPaused(() => {
      let pagination = this.querySelector<HTMLElement>(SELECTOR.pagination);
      if (!this.paginate) {
        const row = this.#generatedPagination?.closest(SELECTOR.paginationRow);
        this.#generatedPagination?.remove();
        this.#generatedPagination = null;
        row?.remove();
        pagination?.setAttribute("hidden", "");
        return;
      }

      if (!pagination) {
        pagination = this.#buildPagination();
        this.#generatedPagination = pagination;
      }
      const cell = this.#paginationCell(pagination);
      if (cell && pagination.parentElement !== cell) cell.append(pagination);
      pagination.removeAttribute("hidden");
      this.#setControlDisabled(
        pagination.querySelector(SELECTOR.previous),
        this.#pageDisabled("previous"),
      );
      this.#setControlDisabled(pagination.querySelector(SELECTOR.next), this.#pageDisabled("next"));
    });
  }

  #buildPagination() {
    const pagination = document.createElement("nav");
    pagination.setAttribute("data-table-pagination", "");
    pagination.setAttribute("aria-label", "Pagination");

    const previous = document.createElement("button");
    previous.type = "button";
    previous.setAttribute("data-table-previous", "");
    previous.textContent = "Previous";

    const next = document.createElement("button");
    next.type = "button";
    next.setAttribute("data-table-next", "");
    next.textContent = "Next";

    pagination.append(previous, next);
    return pagination;
  }

  #paginationCell(pagination: HTMLElement) {
    const existing = pagination.closest("tfoot th, tfoot td");
    if (existing instanceof HTMLTableCellElement && this.#table?.contains(existing)) {
      this.#spanAllColumns(existing);
      return existing;
    }

    if (!this.#table) return null;
    const tfoot = this.#table.tFoot ?? this.#table.createTFoot();
    let row = tfoot.querySelector<HTMLTableRowElement>(SELECTOR.paginationRow);
    if (!row) {
      row = document.createElement("tr");
      row.setAttribute("data-table-pagination-row", "");
      tfoot.append(row);
    }
    let cell = row.querySelector<HTMLTableCellElement>(SELECTOR.paginationCell);
    if (!cell) {
      cell = document.createElement("td");
      cell.setAttribute("data-table-pagination-cell", "");
      row.append(cell);
    }
    this.#spanAllColumns(cell);
    return cell;
  }

  #setControlDisabled(control: Element | null, disabled: boolean) {
    if (!control) return;
    control.setAttribute("aria-disabled", String(disabled));
    if (control instanceof HTMLButtonElement || control instanceof HTMLInputElement) {
      control.disabled = disabled;
    }
  }

  /** Whether paging in `direction` is currently unavailable — the one predicate
   * behind both the rendered button state and the `#page` event guard. */
  #pageDisabled(direction: "previous" | "next") {
    return (direction === "previous" ? !this.hasPreviousPage : !this.hasNextPage) || this.loading;
  }

  #page(direction: "previous" | "next") {
    if (this.#pageDisabled(direction)) return;
    this.dispatchEvent(
      new CustomEvent<UITablePageDetail>(direction === "previous" ? "previouspage" : "nextpage", {
        bubbles: true,
        detail: { direction },
      }),
    );
  }

  #delegateRowClick(target: Element) {
    if (target.closest(INTERACTIVE_SELECTOR)) return;
    const row = target.closest("tbody tr");
    const id = row?.getAttribute("click-delegate");
    if (!row || !id) return;
    const delegate = row.querySelector(`#${CSS.escape(id)}`);
    if (delegate instanceof HTMLElement) delegate.click();
  }

  #onClick = (event: Event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest(SELECTOR.previous)) return this.#page("previous");
    if (event.target.closest(SELECTOR.next)) return this.#page("next");

    const header = event.target.closest("th[data-sort-key]");
    if (header instanceof HTMLTableCellElement && this.contains(header)) {
      this.#sort(header);
      return;
    }
    this.#delegateRowClick(event.target);
  };

  #onChange = (event: Event) => {
    if (!(event.target instanceof Element)) return;
    const target = event.target;
    if (target.matches(SELECTOR.selectAll) && isCheckbox(target)) {
      for (const box of this.#rowBoxes()) this.#setBox(box, target.checked);
      this.#syncSelection("emit");
      return;
    }
    if (target.matches(SELECTOR.selectRow)) this.#syncSelection("emit");
  };
}

define("ui-table", UITable);

declare global {
  interface HTMLElementTagNameMap {
    "ui-table": UITable;
  }
}
