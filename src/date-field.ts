/**
 * `ui-date-field` — a native-first date field that opens a `<ui-calendar>` in a
 * popover (the companion to the standalone {@link UICalendar} in `calendar.ts`).
 *
 * Author `<input type="date" name="due">` and it works with no JavaScript. On
 * upgrade it adopts an authored `[data-date-trigger]` button (or generates one)
 * and a `<ui-calendar>` inside a `<ui-calendar-popup>` — the trigger/popup/
 * anchoring/dismiss dance is the shared {@link popoverField} — and picking a
 * day writes the ISO value back to the input (mirroring `min`/`max`/`value`)
 * and fires the native change, so a later submit carries the choice. The
 * native input stays the visible, submitting form value.
 */
import { define } from "./define.ts";
import { LightDomElement } from "./lifecycle.ts";
import { type CalendarChangeDetail, UICalendar, UICalendarPopup } from "./calendar.ts";
import { adoptedControl, fireNativeChange } from "./native.ts";
import { type PopoverField, popoverField } from "./popover-field.ts";

export class UIDateField extends LightDomElement {
  #input!: HTMLInputElement;
  #field: PopoverField | null = null;

  protected override wire() {
    const input = adoptedControl<HTMLInputElement>(this, 'input[type="date"]');
    if (!input) return;
    this.wired = true;
    this.#input = input;

    // `new UICalendar()` / `new UICalendarPopup()` (rather than createElement)
    // keeps a value import of `calendar.ts`, so `ui-calendar`/`ui-calendar-popup`
    // are registered even when only `ui-date-field` is imported.
    const calendar = new UICalendar();
    for (const attr of ["min", "max"] as const) {
      const v = input.getAttribute(attr);
      if (v) calendar.setAttribute(attr, v);
    }
    calendar.value = input.value || null;
    const popup = new UICalendarPopup();
    popup.append(calendar);

    this.#field = popoverField(this, {
      input,
      prefix: "date",
      trigger: { marker: "data-date-trigger", label: "Choose date", text: "📅" },
      build: () => ({ popup, widget: calendar }),
      onOpen: () => {
        calendar.value = input.value || null;
      },
      initialFocus: () => calendar.querySelector<HTMLButtonElement>("[tabindex='0']"),
    });

    // Keep the picker in step when the native input changes (typing, form reset).
    input.addEventListener("change", () => {
      if (!this.#field?.open) calendar.value = input.value || null;
    });
    calendar.addEventListener("change", this.#onPick as EventListener);
  }

  #onPick = (e: CustomEvent<CalendarChangeDetail>) => {
    e.stopPropagation(); // the field's public change is the native input's, below
    this.#input.value = e.detail.value ?? "";
    fireNativeChange(this.#input);
    this.#field?.close(true);
  };

  disconnectedCallback() {
    this.#field?.close(false);
  }
}

define("ui-date-field", UIDateField);

declare global {
  interface HTMLElementTagNameMap {
    "ui-date-field": UIDateField;
  }
}
