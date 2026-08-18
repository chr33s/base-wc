/**
 * `ui-date-field` — a native-first date field that opens a `<ui-calendar>` in a
 * popover (the companion to the standalone {@link UICalendar} in `calendar.ts`).
 *
 * Author `<input type="date" name="due">` and it works with no JavaScript. On
 * upgrade it generates a trigger button and a `<ui-calendar>` inside a
 * `<ui-calendar-popup>`; picking a day writes the ISO value back to the input
 * (mirroring `min`/`max`/`value`) and fires the native change, so a later submit
 * carries the choice. The native input stays the form value.
 */
import { connectLightDom } from "./lifecycle.ts";
import { SUPPORTS_ANCHOR } from "./anchor.ts";
import { type CalendarChangeDetail, UICalendar, UICalendarPopup } from "./calendar.ts";
import { nextId } from "./id.ts";
import { adoptedControl, fireNativeChange } from "./native.ts";
import { type Overlay, overlay } from "./overlay.ts";

export class UIDateField extends HTMLElement {
  #wired = false;
  #input!: HTMLInputElement;
  #trigger!: HTMLElement;
  #popup!: UICalendarPopup;
  #calendar!: UICalendar;
  #overlay: Overlay | null = null;
  #isOpen = false;

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    const input = adoptedControl<HTMLInputElement>(this, 'input[type="date"]');
    if (!input) return;
    this.#wired = true;
    this.#input = input;

    this.#trigger = this.querySelector<HTMLElement>("[data-date-trigger]") ?? this.#buildTrigger();
    // `new UICalendar()` / `new UICalendarPopup()` (rather than createElement)
    // keeps a value import of `calendar.ts`, so `ui-calendar`/`ui-calendar-popup`
    // are registered even when only `ui-date-field` is imported.
    this.#calendar = new UICalendar();
    this.#syncCalendarBounds();
    this.#popup = new UICalendarPopup();
    this.#popup.append(this.#calendar);
    this.append(this.#popup);

    if (this.#popup.id === "") this.#popup.id = nextId("ui-calendar-popup");
    this.#trigger.setAttribute("aria-haspopup", "dialog");
    this.#trigger.setAttribute("aria-expanded", "false");
    this.#trigger.setAttribute("aria-controls", this.#popup.id);
    this.#trigger.addEventListener("click", this.#onTriggerClick);

    // Keep the picker in step when the native input changes (typing, form reset).
    this.#input.addEventListener("change", () => {
      if (!this.#isOpen) this.#calendar.value = this.#input.value || null;
    });
    this.#calendar.addEventListener("change", this.#onPick as EventListener);

    if (SUPPORTS_ANCHOR) {
      const name = `--date-${nextId("anchor")}`;
      this.#trigger.style.setProperty("anchor-name", name);
      this.#popup.style.setProperty("position-anchor", name);
    }
    this.#overlay = overlay(this.#popup, {
      anchor: { ref: () => this.#trigger, options: { offset: 6, padding: 8 } },
      dismiss: {
        within: () => [this.#popup, this.#trigger],
        onDismiss: () => this.#close(false),
      },
    });
  }

  #buildTrigger() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-date-trigger", "");
    btn.setAttribute("aria-label", "Choose date");
    btn.textContent = "📅";
    this.#input.after(btn);
    return btn;
  }

  #syncCalendarBounds() {
    for (const attr of ["min", "max"] as const) {
      const v = this.#input.getAttribute(attr);
      if (v) this.#calendar.setAttribute(attr, v);
    }
    this.#calendar.value = this.#input.value || null;
  }

  #onTriggerClick = () => (this.#isOpen ? this.#close(true) : this.#open());

  #open() {
    if (this.#isOpen) return;
    this.#isOpen = true;
    this.#calendar.value = this.#input.value || null;
    this.#trigger.setAttribute("aria-expanded", "true");
    this.#overlay?.show();
    this.#calendar.querySelector<HTMLButtonElement>("[tabindex='0']")?.focus();
  }

  #close(restoreFocus: boolean) {
    if (!this.#isOpen) return;
    this.#isOpen = false;
    this.#trigger.setAttribute("aria-expanded", "false");
    this.#overlay?.hide();
    if (restoreFocus) this.#trigger.focus();
  }

  #onPick = (e: CustomEvent<CalendarChangeDetail>) => {
    e.stopPropagation(); // the field's public change is the native input's, below
    this.#input.value = e.detail.value ?? "";
    fireNativeChange(this.#input);
    this.#close(true);
  };

  disconnectedCallback() {
    this.#close(false);
  }
}

if (!customElements.get("ui-date-field")) customElements.define("ui-date-field", UIDateField);

declare global {
  interface HTMLElementTagNameMap {
    "ui-date-field": UIDateField;
  }
}
