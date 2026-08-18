/**
 * `ui-table` — a light-DOM enhancer for native `<table>` markup.
 *
 * The table remains a real table with no JavaScript. On upgrade this component
 * adds behavioural affordances that are shared across admin/storefront surfaces:
 * sortable headers (`th[data-sort-key]`), row selection checkboxes, loading and
 * pagination state, responsive-list metadata on cells, and click delegation from
 * a row to an existing in-row primary action.
 */
import { connectLightDom } from "./lifecycle.ts";

export type UITableVariant = "auto" | "list" | "table";
export type UITableSortDirection = "ascending" | "descending";
export type UITableHeaderFormat = "base" | "numeric" | "currency";
export type UITableListSlot = "primary" | "secondary" | "kicker" | "inline" | "labeled";

export interface UITableSortDetail {
  readonly key: string;
  readonly direction: UITableSortDirection;
  readonly index: number;
}

export interface UITableSelectionDetail {
  readonly selected: number;
  readonly total: number;
  readonly values: ReadonlyArray<string>;
}

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

const SELECT_ALL = "input[type='checkbox'][data-table-select-all]";
const SELECT_ROW = "input[type='checkbox'][data-table-select-row]";
const CONTROLS = "[data-table-controls]";
const CONTROLS_ROW = "[data-table-controls-row]";
const CONTROLS_CELL = "[data-table-controls-cell]";
const FILTERS = "[data-table-filters]";
const BULK = "[data-table-bulk]";
const BULK_ITEM = "[data-table-selected-count], [data-table-bulk-action]";
const PAGINATION = "[data-table-pagination]";
const PAGINATION_ROW = "[data-table-pagination-row]";
const PAGINATION_CELL = "[data-table-pagination-cell]";
const PREVIOUS = "[data-table-previous]";
const NEXT = "[data-table-next]";

const isCheckbox = (value: Element | null): value is HTMLInputElement =>
  value instanceof HTMLInputElement && value.type === "checkbox";

const normalizeVariant = (value: string | null): UITableVariant =>
  value === "list" || value === "table" ? value : "auto";

const normalizeFormat = (value: string | null): UITableHeaderFormat =>
  value === "numeric" || value === "currency" ? value : "base";

const normalizeListSlot = (value: string | null): UITableListSlot => {
  if (
    value === "primary" ||
    value === "secondary" ||
    value === "kicker" ||
    value === "inline" ||
    value === "labeled"
  ) {
    return value;
  }
  return "labeled";
};

const numberValue = (text: string): number => {
  const parsed = Number(text.replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export class UITable extends HTMLElement {
  static observedAttributes = [
    "variant",
    "loading",
    "paginate",
    "has-previous-page",
    "has-next-page",
  ];

  #wired = false;
  #table: HTMLTableElement | null = null;
  #generatedPagination: HTMLElement | null = null;
  #mutation: MutationObserver | null = null;

  get variant(): UITableVariant {
    return normalizeVariant(this.getAttribute("variant"));
  }
  set variant(next: UITableVariant) {
    this.setAttribute("variant", next);
  }

  get loading(): boolean {
    return this.hasAttribute("loading");
  }
  set loading(next: boolean) {
    this.toggleAttribute("loading", next);
  }

  get paginate(): boolean {
    return this.hasAttribute("paginate");
  }
  set paginate(next: boolean) {
    this.toggleAttribute("paginate", next);
  }

  get hasPreviousPage(): boolean {
    return this.hasAttribute("has-previous-page");
  }
  set hasPreviousPage(next: boolean) {
    this.toggleAttribute("has-previous-page", next);
  }

  get hasNextPage(): boolean {
    return this.hasAttribute("has-next-page");
  }
  set hasNextPage(next: boolean) {
    this.toggleAttribute("has-next-page", next);
  }

  get selectedValues(): ReadonlyArray<string> {
    return this.#rowBoxes()
      .filter((box) => box.checked)
      .map((box) => box.value);
  }

  connectedCallback() {
    this.addEventListener("click", this.#onClick);
    this.addEventListener("change", this.#onChange);
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  disconnectedCallback() {
    this.removeEventListener("click", this.#onClick);
    this.removeEventListener("change", this.#onChange);
    this.#mutation?.disconnect();
    this.#mutation = null;
    this.#wired = false;
  }

  attributeChangedCallback() {
    this.#sync();
  }

  /** Re-read table headers/rows after the consumer changes table structure. */
  refresh() {
    this.#mutation?.disconnect();
    this.#table = this.querySelector("table");
    this.#ensureControls();
    this.#annotateCells();
    this.#syncSelection(false);
    this.#sync();
    this.#observe();
  }

  #wire() {
    this.#wired = true;
    this.refresh();
    this.#mutation = new MutationObserver(() => this.refresh());
    this.#observe();
  }

  #observe() {
    if (this.#mutation && this.#table) {
      this.#mutation.observe(this.#table, { childList: true, subtree: true });
    }
  }

  #sync() {
    this.dataset.variant = this.variant;
    this.toggleAttribute("data-loading", this.loading);
    this.setAttribute("aria-busy", String(this.loading));
    if (this.#wired) this.#syncPagination();
  }

  #headers(): HTMLTableCellElement[] {
    const row = this.#headerRow();
    return row ? this.#cells(row) : [];
  }

  #headerRow(): HTMLTableRowElement | null {
    const thead = this.#table?.tHead;
    if (!thead) return null;
    return (
      Array.from(thead.querySelectorAll<HTMLTableRowElement>("tr")).find(
        (row) => !row.hasAttribute("data-table-controls-row"),
      ) ?? null
    );
  }

  #bodyRows(): HTMLTableRowElement[] {
    return this.#table?.tBodies[0]
      ? Array.from(this.#table.tBodies[0].querySelectorAll<HTMLTableRowElement>("tr"))
      : [];
  }

  #cells(row: Element): HTMLTableCellElement[] {
    return Array.from(row.children).filter(
      (child): child is HTMLTableCellElement => child instanceof HTMLTableCellElement,
    );
  }

  #columnCount(): number {
    const headerCount = this.#headers().length;
    if (headerCount > 0) return headerCount;
    return Math.max(1, ...this.#bodyRows().map((row) => this.#cells(row).length));
  }

  #rowBoxes(): HTMLInputElement[] {
    return [...this.querySelectorAll<HTMLInputElement>(SELECT_ROW)];
  }

  #selectAll(): HTMLInputElement | null {
    return this.querySelector<HTMLInputElement>(SELECT_ALL);
  }

  #ensureControls() {
    if (!this.#table) return;
    const filters = this.#movableControls(FILTERS);
    const bulk = this.#movableControls(BULK);
    const looseBulk = this.#movableControls(BULK_ITEM).filter((item) => !item.closest(BULK));
    const existing = this.#table.querySelector<HTMLElement>(CONTROLS);
    if (!existing && filters.length === 0 && bulk.length === 0 && looseBulk.length === 0) return;

    const controls = this.#controlsContainer();
    for (const item of filters) controls.append(item);
    for (const item of bulk) controls.append(item);
    if (looseBulk.length > 0) {
      let group = controls.querySelector<HTMLElement>(BULK);
      if (!group) {
        group = document.createElement("div");
        group.setAttribute("data-table-bulk", "");
        controls.append(group);
      }
      for (const item of looseBulk) group.append(item);
    }
  }

  #movableControls(selector: string): HTMLElement[] {
    return Array.from(this.querySelectorAll<HTMLElement>(selector)).filter(
      (item) => !item.closest(CONTROLS),
    );
  }

  #controlsContainer(): HTMLElement {
    const table = this.#table!;
    const thead = table.tHead ?? table.createTHead();
    let row = thead.querySelector<HTMLTableRowElement>(CONTROLS_ROW);
    if (!row) {
      row = document.createElement("tr");
      row.setAttribute("data-table-controls-row", "");
      thead.insertBefore(row, thead.firstElementChild);
    }

    let cell = row.querySelector<HTMLTableCellElement>(CONTROLS_CELL);
    if (!cell) {
      cell = document.createElement("td");
      cell.setAttribute("data-table-controls-cell", "");
      row.append(cell);
    }
    cell.colSpan = this.#columnCount();

    let controls = cell.querySelector<HTMLElement>(CONTROLS);
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
    this.#table
      ?.querySelector<HTMLTableCellElement>(CONTROLS_CELL)
      ?.setAttribute("colspan", String(this.#columnCount()));
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
    return normalizeFormat(header.getAttribute("data-format") ?? header.getAttribute("format"));
  }

  #headerListSlot(header: Element): UITableListSlot {
    return normalizeListSlot(header.getAttribute("data-list-slot"));
  }

  #sort(header: HTMLTableCellElement) {
    const tbody = this.#table?.tBodies[0];
    const headers = this.#headers();
    const index = headers.indexOf(header);
    const key = header.getAttribute("data-sort-key");
    if (!tbody || !key || index < 0) return;

    const direction: UITableSortDirection =
      header.getAttribute("aria-sort") === "ascending" ? "descending" : "ascending";
    const format = this.#headerFormat(header);
    const cellText = (row: HTMLTableRowElement) =>
      this.#cells(row)[index]?.textContent?.trim() ?? "";
    const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr")).sort((a, b) => {
      const av = cellText(a);
      const bv = cellText(b);
      const compared =
        format === "numeric" || format === "currency"
          ? numberValue(av) - numberValue(bv)
          : av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
      return direction === "ascending" ? compared : -compared;
    });

    this.#mutation?.disconnect();
    for (const item of headers) {
      if (item.hasAttribute("data-sort-key")) item.setAttribute("aria-sort", "none");
      else item.removeAttribute("aria-sort");
    }
    header.setAttribute("aria-sort", direction);
    for (const row of rows) tbody.appendChild(row);
    this.#observe();

    this.dispatchEvent(
      new CustomEvent<UITableSortDetail>("sort", {
        bubbles: true,
        detail: { key, direction, index },
      }),
    );
  }

  #syncSelection(emit: boolean) {
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

    if (emit) {
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
    // Bracket the structural mutations so building/removing pagination in the
    // observed subtree does not self-trigger a redundant refresh() (as #sort does).
    this.#mutation?.disconnect();
    try {
      let pagination = this.querySelector<HTMLElement>(PAGINATION);
      if (!this.paginate) {
        const row = this.#generatedPagination?.closest(PAGINATION_ROW);
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
        pagination.querySelector(PREVIOUS),
        !this.hasPreviousPage || this.loading,
      );
      this.#setControlDisabled(pagination.querySelector(NEXT), !this.hasNextPage || this.loading);
    } finally {
      this.#observe();
    }
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

  #paginationCell(pagination: HTMLElement): HTMLTableCellElement | null {
    const existing = pagination.closest("tfoot th, tfoot td");
    if (existing instanceof HTMLTableCellElement && this.#table?.contains(existing)) {
      existing.colSpan = this.#columnCount();
      return existing;
    }

    if (!this.#table) return null;
    const tfoot = this.#table.tFoot ?? this.#table.createTFoot();
    let row = tfoot.querySelector<HTMLTableRowElement>(PAGINATION_ROW);
    if (!row) {
      row = document.createElement("tr");
      row.setAttribute("data-table-pagination-row", "");
      tfoot.append(row);
    }
    let cell = row.querySelector<HTMLTableCellElement>(PAGINATION_CELL);
    if (!cell) {
      cell = document.createElement("td");
      cell.setAttribute("data-table-pagination-cell", "");
      row.append(cell);
    }
    cell.colSpan = this.#columnCount();
    return cell;
  }

  #setControlDisabled(control: Element | null, disabled: boolean) {
    if (!control) return;
    control.setAttribute("aria-disabled", String(disabled));
    if (control instanceof HTMLButtonElement || control instanceof HTMLInputElement) {
      control.disabled = disabled;
    }
  }

  #page(direction: "previous" | "next") {
    const disabled =
      direction === "previous"
        ? !this.hasPreviousPage || this.loading
        : !this.hasNextPage || this.loading;
    if (disabled) return;
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
    if (event.target.closest(PREVIOUS)) return this.#page("previous");
    if (event.target.closest(NEXT)) return this.#page("next");

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
    if (target.matches(SELECT_ALL) && isCheckbox(target)) {
      for (const box of this.#rowBoxes()) this.#setBox(box, target.checked);
      this.#syncSelection(true);
      return;
    }
    if (target.matches(SELECT_ROW)) this.#syncSelection(true);
  };
}

if (!customElements.get("ui-table")) customElements.define("ui-table", UITable);

declare global {
  interface HTMLElementTagNameMap {
    "ui-table": UITable;
  }
}
