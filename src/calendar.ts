/**
 * `ui-calendar` — a month-grid date picker (the standalone calendar primitive;
 * the native-first `ui-date-field` that opens one in a popover lives in
 * `date-field.ts`).
 *
 * There is no Base UI counterpart; this follows the same headless conventions
 * (light DOM, {@link ElementInternals} form-association). It builds a
 * `role="grid"` month view (weekday column headers + day cells) and manages 2D
 * roving focus: Arrow keys move a day/week, Home/End jump to the week's edges,
 * PageUp/PageDown change month (Shift → year), and Enter/Space select. Days
 * outside `[min, max]` are disabled. It is form-associated — used standalone with
 * a `name` it submits the ISO value — and fires `change` with `{ value }` (ISO
 * `yyyy-mm-dd`, or `null` when cleared).
 *
 * `ui-calendar-popup` is the top-layer popover shell that `ui-date-field` floats
 * a calendar in (see `date-field.ts`).
 */
import { connectLightDom } from "./lifecycle.ts";
import { nextId } from "./id.ts";

interface YMD {
  y: number;
  m: number; // 0-based month
  d: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = ({ y, m, d }: YMD) => `${y}-${pad(m + 1)}-${pad(d)}`;

function parseISO(s: string | null | undefined): YMD | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  // Reject impossible dates (e.g. 2026-02-31) by round-tripping through UTC.
  const dt = new Date(Date.UTC(y, m, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m && dt.getUTCDate() === d
    ? { y, m, d }
    : null;
}

const weekday = ({ y, m, d }: YMD) => new Date(Date.UTC(y, m, d)).getUTCDay();
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
/** Shift a date by `days`, normalising month/year overflow. */
const addDays = ({ y, m, d }: YMD, days: number): YMD => {
  const dt = new Date(Date.UTC(y, m, d + days));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
};
const addMonths = ({ y, m, d }: YMD, months: number): YMD => {
  const dt = new Date(Date.UTC(y, m + months, 1));
  const ny = dt.getUTCFullYear();
  const nm = dt.getUTCMonth();
  return { y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) };
};
const today = (): YMD => {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
};

export interface CalendarChangeDetail {
  /** Selected date as ISO `yyyy-mm-dd`, or `null` when cleared. */
  readonly value: string | null;
}

export class UICalendar extends HTMLElement {
  static formAssociated = true;
  static observedAttributes = ["value", "min", "max", "disabled"];

  #internals: ElementInternals | null = this.attachInternals?.() ?? null;
  #wired = false;
  #uid = nextId("calendar");
  #selected: YMD | null = null;
  /** The day that owns the single tab stop (roving); drives the visible month. */
  #focus: YMD = today();
  #label!: HTMLElement;
  #grid!: HTMLElement;
  #wantFocus = false;
  #reflectingValue = false;

  get form(): HTMLFormElement | null {
    return this.#internals?.form ?? null;
  }
  get name(): string | null {
    return this.getAttribute("name");
  }
  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }
  get value(): string | null {
    return this.#selected ? toISO(this.#selected) : null;
  }
  set value(next: string | null) {
    this.#select(parseISO(next), false);
  }

  #min(): YMD | null {
    return parseISO(this.getAttribute("min"));
  }
  #max(): YMD | null {
    return parseISO(this.getAttribute("max"));
  }
  #locale(): string | undefined {
    return this.getAttribute("locale") ?? undefined;
  }
  #firstDayOfWeek(): number {
    return (Number(this.getAttribute("first-day-of-week")) || 0) % 7;
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  attributeChangedCallback(name: string) {
    if (!this.#wired || this.#reflectingValue) return;
    if (name === "value") {
      this.#select(parseISO(this.getAttribute("value")), false, false);
      return;
    }
    this.#render();
  }

  #wire() {
    this.#wired = true;
    this.#selected = parseISO(this.getAttribute("value"));
    this.#focus = this.#selected ?? this.#clampToRange(today());
    if (this.#selected) this.#internals?.setFormValue(toISO(this.#selected));

    const header = document.createElement("div");
    header.setAttribute("data-calendar-header", "");
    const prev = this.#navButton("prev", "Previous month", "‹");
    this.#label = document.createElement("div");
    this.#label.setAttribute("data-calendar-label", "");
    this.#label.setAttribute("aria-live", "polite");
    this.#label.id = `${this.#uid}-label`;
    const next = this.#navButton("next", "Next month", "›");
    header.append(prev, this.#label, next);

    this.#grid = document.createElement("div");
    this.#grid.setAttribute("role", "grid");
    this.#grid.setAttribute("data-calendar-grid", "");
    this.#grid.setAttribute("aria-labelledby", this.#label.id);
    this.#grid.addEventListener("click", this.#onGridClick);
    this.#grid.addEventListener("keydown", this.#onGridKeydown);

    this.append(header, this.#grid);
    this.#render();
  }

  #navButton(dir: "prev" | "next", label: string, glyph: string) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute(`data-calendar-${dir}`, "");
    btn.setAttribute("aria-label", label);
    btn.textContent = glyph;
    btn.addEventListener("click", () => this.#shiftMonth(dir === "next" ? 1 : -1));
    return btn;
  }

  #clampToRange(date: YMD): YMD {
    const min = this.#min();
    const max = this.#max();
    if (min && toISO(date) < toISO(min)) return min;
    if (max && toISO(date) > toISO(max)) return max;
    return date;
  }

  #isDisabled(date: YMD): boolean {
    const min = this.#min();
    const max = this.#max();
    const iso = toISO(date);
    return (min != null && iso < toISO(min)) || (max != null && iso > toISO(max));
  }

  /** Rebuild the weekday header row + day cells for the focused month. */
  #render() {
    if (!this.#wired) return;
    this.#label.textContent = new Intl.DateTimeFormat(this.#locale(), {
      month: "long",
      year: "numeric",
    }).format(new Date(Date.UTC(this.#focus.y, this.#focus.m, 1)));

    this.#grid.textContent = "";
    const fdow = this.#firstDayOfWeek();
    const dayNames = new Intl.DateTimeFormat(this.#locale(), { weekday: "short" });

    const head = document.createElement("div");
    head.setAttribute("role", "row");
    head.setAttribute("data-calendar-weekdays", "");
    for (let i = 0; i < 7; i++) {
      const dow = (fdow + i) % 7;
      const cell = document.createElement("div");
      cell.setAttribute("role", "columnheader");
      // 2021-08-01 is a Sunday — index weekday names off a known week.
      cell.textContent = dayNames.format(new Date(Date.UTC(2021, 7, 1 + dow)));
      head.append(cell);
    }
    this.#grid.append(head);

    const { y, m } = this.#focus;
    const total = daysInMonth(y, m);
    const lead = (weekday({ y, m, d: 1 }) - fdow + 7) % 7;
    const selectedIso = this.#selected ? toISO(this.#selected) : null;
    const focusIso = toISO(this.#focus);
    const todayIso = toISO(today());

    let row = this.#newRow();
    for (let i = 0; i < lead; i++) row.append(this.#emptyCell());
    for (let d = 1; d <= total; d++) {
      if ((lead + d - 1) % 7 === 0 && d !== 1) {
        this.#grid.append(row);
        row = this.#newRow();
      }
      const date = { y, m, d };
      const iso = toISO(date);
      const cell = document.createElement("div");
      cell.setAttribute("role", "gridcell");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-calendar-day", iso);
      btn.textContent = String(d);
      const disabled = this.#isDisabled(date);
      btn.disabled = disabled || this.disabled;
      btn.tabIndex = iso === focusIso ? 0 : -1;
      if (iso === selectedIso) {
        btn.setAttribute("aria-selected", "true");
        btn.setAttribute("data-selected", "");
      }
      if (iso === todayIso) btn.setAttribute("data-today", "");
      cell.append(btn);
      row.append(cell);
    }
    const trail = (7 - ((lead + total) % 7)) % 7;
    for (let i = 0; i < trail; i++) row.append(this.#emptyCell());
    this.#grid.append(row);

    if (this.#wantFocus) {
      this.#wantFocus = false;
      this.#grid.querySelector<HTMLButtonElement>(`[data-calendar-day="${focusIso}"]`)?.focus();
    }
  }

  #newRow() {
    const row = document.createElement("div");
    row.setAttribute("role", "row");
    return row;
  }
  #emptyCell() {
    const cell = document.createElement("div");
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("data-calendar-empty", "");
    return cell;
  }

  #shiftMonth(months: number) {
    this.#focus = this.#clampToRange(addMonths(this.#focus, months));
    this.#render();
  }

  /** Move roving focus by `days`, following into an adjacent month as needed. */
  #moveFocus(days: number, byMonth = false) {
    const next = byMonth ? addMonths(this.#focus, days) : addDays(this.#focus, days);
    if (this.#isDisabled(next)) return;
    this.#focus = next;
    this.#wantFocus = true;
    this.#render();
  }

  #select(date: YMD | null, emit: boolean, reflectValue = true) {
    this.#selected = date;
    if (date) {
      this.#focus = date;
      this.#internals?.setFormValue(toISO(date));
      if (reflectValue && this.getAttribute("value") !== toISO(date)) {
        this.#reflectingValue = true;
        try {
          this.setAttribute("value", toISO(date));
        } finally {
          this.#reflectingValue = false;
        }
      }
    } else {
      this.#internals?.setFormValue(null);
      if (reflectValue && this.hasAttribute("value")) {
        this.#reflectingValue = true;
        try {
          this.removeAttribute("value");
        } finally {
          this.#reflectingValue = false;
        }
      }
    }
    if (this.#wired) this.#render();
    if (emit) {
      this.dispatchEvent(
        new CustomEvent<CalendarChangeDetail>("change", {
          bubbles: true,
          detail: { value: date ? toISO(date) : null },
        }),
      );
    }
  }

  #onGridClick = (e: MouseEvent) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>("[data-calendar-day]");
    if (!btn || btn.disabled) return;
    this.#select(parseISO(btn.getAttribute("data-calendar-day")), true);
  };

  #onGridKeydown = (e: KeyboardEvent) => {
    if (this.disabled) return;
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        this.#moveFocus(-1);
        break;
      case "ArrowRight":
        e.preventDefault();
        this.#moveFocus(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        this.#moveFocus(-7);
        break;
      case "ArrowDown":
        e.preventDefault();
        this.#moveFocus(7);
        break;
      case "Home":
        e.preventDefault();
        this.#moveFocus(-((weekday(this.#focus) - this.#firstDayOfWeek() + 7) % 7));
        break;
      case "End":
        e.preventDefault();
        this.#moveFocus(6 - ((weekday(this.#focus) - this.#firstDayOfWeek() + 7) % 7));
        break;
      case "PageUp":
        e.preventDefault();
        this.#moveFocus(e.shiftKey ? -12 : -1, true);
        break;
      case "PageDown":
        e.preventDefault();
        this.#moveFocus(e.shiftKey ? 12 : 1, true);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (!this.#isDisabled(this.#focus)) this.#select(this.#focus, true);
        break;
    }
  };
}

/** The popover shell around a `<ui-calendar>` (top layer, like other popups). */
export class UICalendarPopup extends HTMLElement {
  connectedCallback() {
    this.setAttribute("popover", "manual");
  }
}

if (!customElements.get("ui-calendar")) customElements.define("ui-calendar", UICalendar);
if (!customElements.get("ui-calendar-popup"))
  customElements.define("ui-calendar-popup", UICalendarPopup);

declare global {
  interface HTMLElementTagNameMap {
    "ui-calendar": UICalendar;
    "ui-calendar-popup": UICalendarPopup;
  }
}
