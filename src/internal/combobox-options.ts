/** Private DOM renderer for the combobox's fixed pool of list/grid options. */
import { clamp } from "../math.ts";

interface Option {
  readonly value: string;
  readonly label: string;
}
interface RenderOptions {
  columns: number;
  activeIndex: number;
  isSelected: (value: string) => boolean;
}
const ROW_H = 36;
const OVERSCAN = 4;

export class ComboboxOptions {
  #rows: HTMLDivElement[] = [];
  #cells: HTMLDivElement[][] = [];
  #rowH = ROW_H;
  #columns = 1;
  #input: HTMLInputElement;
  #viewport: HTMLElement;
  #spacer: HTMLElement;
  #optionId: (index: number) => string;

  constructor(
    input: HTMLInputElement,
    viewport: HTMLElement,
    spacer: HTMLElement,
    optionId: (index: number) => string,
  ) {
    this.#input = input;
    this.#viewport = viewport;
    this.#spacer = spacer;
    this.#optionId = optionId;
    spacer.setAttribute("role", "presentation");
  }

  get rowCount() {
    return this.#rows.length;
  }
  get pageSize() {
    return Math.max(1, Math.floor(this.#viewport.clientHeight / this.#rowH) - 1);
  }
  get #grid() {
    return this.#columns > 1;
  }

  /** Called after showing the popup, when consumer CSS can be measured. */
  measure() {
    this.#ensurePool();
    this.#rowH = this.#rows[0]?.offsetHeight || ROW_H;
    this.#ensurePool();
  }

  scrollTo(index: number) {
    const top = Math.floor(index / this.#columns) * this.#rowH;
    const bottom = top + this.#rowH;
    const viewport = this.#viewport;
    if (top < viewport.scrollTop) viewport.scrollTop = top;
    else if (bottom > viewport.scrollTop + viewport.clientHeight)
      viewport.scrollTop = bottom - viewport.clientHeight;
  }

  #shape = "";

  #ensurePool() {
    const visible = this.#viewport.clientHeight
      ? Math.ceil(this.#viewport.clientHeight / this.#rowH)
      : 9;
    const needed = visible + OVERSCAN * 2;
    const grid = this.#grid;
    const columns = this.#columns;
    for (let i = this.#rows.length; i < needed; i++) {
      const row = document.createElement("div");
      row.className = "cb-row";
      // In a grid the pooled element is the row and its cells hold the options;
      // in a list the pooled element *is* the option.
      row.setAttribute("role", grid ? "row" : "option");
      row.hidden = true;
      if (grid) {
        const cells: HTMLDivElement[] = [];
        for (let c = 0; c < columns; c++) {
          const cell = document.createElement("div");
          cell.className = "cb-cell";
          // `option` is not an allowed child of `row`; a grid's selectable unit
          // is the `gridcell`, which carries `aria-selected` just the same.
          cell.setAttribute("role", "gridcell");
          cell.hidden = true;
          row.appendChild(cell);
          cells.push(cell);
        }
        this.#cells.push(cells);
      }
      this.#spacer.appendChild(row);
      this.#rows.push(row);
    }
  }

  render(items: readonly Option[], options: RenderOptions) {
    if (options.columns !== this.#columns) {
      this.#columns = options.columns;
      this.#spacer.textContent = "";
      this.#rows = [];
      this.#cells = [];
    }
    this.#ensurePool();
    // Container semantics and spacer height only change with the shape of the
    // list, not on every scroll-driven render.
    const shape = `${this.#columns}:${items.length}`;
    if (shape !== this.#shape) {
      this.#shape = shape;
      this.#spacer.style.height = `${Math.ceil(items.length / this.#columns) * this.#rowH}px`;
      this.#viewport.setAttribute("role", this.#grid ? "grid" : "listbox");
      this.#input.setAttribute("aria-haspopup", this.#grid ? "grid" : "listbox");
      if (this.#grid) {
        this.#viewport.setAttribute("aria-colcount", String(this.#columns));
        this.#viewport.setAttribute(
          "aria-rowcount",
          String(Math.ceil(items.length / this.#columns)),
        );
      } else {
        this.#viewport.removeAttribute("aria-colcount");
        this.#viewport.removeAttribute("aria-rowcount");
      }
    }
    const total = items.length;
    const columns = this.#columns;
    const rowCount = Math.ceil(total / columns);
    const scrollTop = this.#viewport.scrollTop;
    const maxFirst = Math.max(0, rowCount - this.#rows.length);
    const first = clamp(Math.floor(scrollTop / this.#rowH) - OVERSCAN, 0, maxFirst);
    const active = options.activeIndex;

    for (let p = 0; p < this.#rows.length; p++) {
      const row = this.#rows[p];
      const rowIndex = first + p;
      if (rowIndex >= rowCount) {
        row.hidden = true;
        this.#clearSlot(row);
        for (const cell of this.#cells[p] ?? []) {
          cell.hidden = true;
          this.#clearSlot(cell);
        }
        continue;
      }
      row.hidden = false;
      row.style.transform = `translateY(${rowIndex * this.#rowH}px)`;

      if (!this.#grid) {
        this.#fillSlot(row, rowIndex, items, active, options.isSelected);
        continue;
      }
      row.setAttribute("aria-rowindex", String(rowIndex + 1));
      const cells = this.#cells[p] ?? [];
      for (let c = 0; c < cells.length; c++) {
        const cell = cells[c];
        const index = rowIndex * columns + c;
        if (index >= total) {
          // The last row of a grid is usually short; its spare cells leave the
          // accessibility tree rather than announcing themselves as empty ones.
          cell.hidden = true;
          this.#clearSlot(cell);
          continue;
        }
        cell.hidden = false;
        cell.setAttribute("aria-colindex", String(c + 1));
        this.#fillSlot(cell, index, items, active, options.isSelected);
      }
    }
  }

  /** Render item `index` into a pooled option or grid cell. */
  #fillSlot(
    el: HTMLElement,
    index: number,
    items: readonly Option[],
    active: number,
    isSelected: (value: string) => boolean,
  ) {
    const item = items[index];
    el.textContent = item.label;
    el.id = this.#optionId(index);
    el.dataset.index = String(index);
    el.setAttribute("aria-posinset", String(index + 1)); // virtualization a11y:
    el.setAttribute("aria-setsize", String(items.length)); // "row 4,213 of 10,000"
    el.setAttribute("aria-selected", String(isSelected(item.value)));
    el.toggleAttribute("data-highlighted", index === active);
  }

  /** Retire a pooled element so nothing addresses the item it used to hold. */
  #clearSlot(el: HTMLElement) {
    el.removeAttribute("id");
    el.removeAttribute("data-index");
  }
}
