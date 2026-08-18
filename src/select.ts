/**
 * `ui-select` — a trigger + listbox popup single-select (Base UI's Select). When
 * open, focus sits on the `role="listbox"` popup and a virtual "active" option
 * moves with the arrow keys / typeahead (`aria-activedescendant`), with `Enter`
 * committing it. The popup reuses the shared stack ({@link anchor} positioning,
 * the Popover-API top layer, {@link onOutsidePress} light-dismiss). The
 * `multiple` attribute makes it a multi-select listbox (`aria-multiselectable`):
 * options toggle without closing and `value` is a `string[]`.
 *
 * **Default (native-first).** Author a native `<select>` inside the element —
 * `<ui-select name="fruit"><select>…<option>…</select></ui-select>` (`multiple`
 * and `<optgroup>` supported) — and it works with no JavaScript: the native menu
 * opens and submits on its own. On upgrade the component
 * {@link adoptedControl | adopts} it — generates the trigger + listbox from the
 * `<option>`/`<optgroup>` markup, seeds the selection from the native value, and
 * {@link retireNative | retires} the `<select>` as the hidden submitting form
 * value (no `ElementInternals` in this mode). The native value is the source of
 * truth, so a later submit carries the enhanced choice.
 *
 * **Fallback (JS-only, richer).** Author the chrome directly — a
 * `[data-select-trigger]` (with an optional `[data-select-value]` label slot), a
 * `<ui-select-popup>`, and `<ui-select-option value>` children (optionally in
 * `<ui-select-group>` blocks labelled by a `<ui-select-group-label>`). The value
 * submits via {@link ElementInternals}. Prefer this only when options need rich
 * content a native `<option>` can't hold (icons, two-line rows) — it submits
 * nothing with scripting off. The selected option carries `data-selected` for an
 * item-indicator (check-mark) style hook.
 */
import { connectLightDom } from "./lifecycle.ts";
import { SUPPORTS_ANCHOR } from "./anchor.ts";
import { nextId } from "./id.ts";
import { adoptedControl, retireNative } from "./native.ts";
import { type Overlay, overlay } from "./overlay.ts";
import { normalize } from "./text.ts";

/** Detail of the `change` event dispatched when the selection changes. */
export interface SelectChangeDetail {
  /** The option that was just toggled/chosen. */
  readonly value: string;
  readonly label: string;
  /** All currently-selected values, in option order (single → `[value]`). */
  readonly values: string[];
}

export class UISelect extends HTMLElement {
  static formAssociated = true;

  #internals: ElementInternals | null = this.attachInternals?.() ?? null;
  #uid = nextId("select");
  #trigger: HTMLElement | null = null;
  #valueEl: HTMLElement | null = null;
  #popup: HTMLElement | null = null;
  /** An adopted native `<select>` (progressive-enhancement mode), else `null`. */
  #native: HTMLSelectElement | null = null;
  #wired = false;
  #isOpen = false;
  #activeIndex = -1;
  #selected = new Set<string>();
  #placeholder = "";
  #overlay: Overlay | null = null;
  #typeahead = "";
  #typeaheadTimer = 0;

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
    const vals = this.#selectedInOrder();
    return this.multiple ? vals : (vals[0] ?? null);
  }
  set value(next: string | string[] | null) {
    const arr = next == null ? [] : Array.isArray(next) ? next : [next];
    this.#applySelection(new Set(this.multiple ? arr : arr.slice(0, 1)));
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    this.#adoptNative();
    this.#trigger = this.querySelector<HTMLElement>("[data-select-trigger]");
    this.#valueEl = this.querySelector<HTMLElement>("[data-select-value]");
    this.#popup = this.querySelector<HTMLElement>("ui-select-popup");
    if (!this.#trigger || !this.#popup) return;
    this.#wired = true;

    // A bare <button> defaults to type=submit; force type=button so opening the
    // listbox never submits an enclosing form.
    if (this.#trigger instanceof HTMLButtonElement && !this.#trigger.hasAttribute("type")) {
      this.#trigger.type = "button";
    }
    if (!this.#popup.id) this.#popup.id = nextId("ui-select-popup");
    this.#popup.setAttribute("role", "listbox");
    if (this.multiple) this.#popup.setAttribute("aria-multiselectable", "true");
    this.#popup.tabIndex = -1;
    this.#placeholder = this.#valueEl?.textContent?.trim() ?? "";
    this.#trigger.setAttribute("aria-haspopup", "listbox");
    this.#trigger.setAttribute("aria-expanded", "false");
    this.#trigger.setAttribute("aria-controls", this.#popup.id);
    this.#trigger.addEventListener("click", this.#onTriggerClick);
    this.#trigger.addEventListener("keydown", this.#onTriggerKeydown);
    this.#popup.addEventListener("keydown", this.#onPopupKeydown);
    this.#popup.addEventListener("click", this.#onOptionClick);

    this.#allOptions().forEach((o, i) => {
      o.setAttribute("role", "option");
      o.id = `${this.#uid}-opt-${i}`;
      o.setAttribute("aria-selected", "false");
    });

    // Label each option group from its <ui-select-group-label>.
    for (const group of this.querySelectorAll("ui-select-group")) {
      const label = group.querySelector("ui-select-group-label");
      if (label) {
        if (!label.id) label.id = nextId("ui-select-group-label");
        group.setAttribute("aria-labelledby", label.id);
      }
    }

    if (SUPPORTS_ANCHOR) {
      const name = `--select-${nextId("anchor")}`;
      this.#trigger.style.setProperty("anchor-name", name);
      this.#popup.style.setProperty("position-anchor", name);
    }

    this.#overlay = overlay(this.#popup, {
      anchor: { ref: () => this.#trigger, options: { offset: 6, padding: 8 } },
      dismiss: {
        within: () => [this.#popup, this.#trigger],
        onDismiss: () => this.#close({ restoreFocus: false }),
      },
    });

    const preselected = this.#allOptions()
      .filter((o) => o.hasAttribute("selected"))
      .map((o) => this.#valueOf(o));
    if (preselected.length) {
      this.#applySelection(new Set(this.multiple ? preselected : preselected.slice(0, 1)));
    }
  }

  disconnectedCallback() {
    this.#close({ restoreFocus: false });
  }

  /**
   * Progressive enhancement: if a native `<select>` was authored (and the
   * trigger+listbox were not), generate that chrome from its `<option>` /
   * `<optgroup>` markup, seed the selection from the native value, and retire the
   * native control to a hidden-but-submitting fallback. The native `<select>`
   * then owns the form value for the rest of this element's life.
   */
  #adoptNative() {
    const select = adoptedControl<HTMLSelectElement>(this, "select");
    if (!select || this.querySelector("[data-select-trigger]")) return;
    this.#native = select;
    if (select.multiple) this.setAttribute("multiple", "");

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.setAttribute("data-select-trigger", "");
    const valueEl = document.createElement("span");
    valueEl.setAttribute("data-select-value", "");
    valueEl.textContent = this.getAttribute("data-placeholder") ?? "";
    trigger.append(valueEl);

    // Carry the native <select>'s accessible name onto the generated trigger,
    // which would otherwise be an unnamed button.
    const ariaLabel = select.getAttribute("aria-label");
    if (ariaLabel) trigger.setAttribute("aria-label", ariaLabel);
    const labelledBy = select.getAttribute("aria-labelledby");
    if (labelledBy) trigger.setAttribute("aria-labelledby", labelledBy);
    // A wrapping <label> implicitly targets the now-retired (hidden) <select>;
    // point it at the trigger so clicking the label opens — and names — the
    // enhanced control.
    const label = this.closest("label");
    if (label && !label.htmlFor) {
      if (!trigger.id) trigger.id = nextId("ui-select-trigger");
      label.htmlFor = trigger.id;
    }

    const popup = document.createElement("ui-select-popup");
    const buildOption = (opt: HTMLOptionElement) => {
      const el = document.createElement("ui-select-option");
      el.setAttribute("value", opt.value);
      if (opt.disabled) el.setAttribute("disabled", "");
      // Seed from the native's current selection so the enhanced widget shows —
      // and submits — exactly what the native `<select>` would with no JS.
      if (opt.selected) el.setAttribute("selected", "");
      el.textContent = opt.textContent?.trim() ?? "";
      return el;
    };
    for (const child of Array.from(select.children)) {
      if (child instanceof HTMLOptGroupElement) {
        const group = document.createElement("ui-select-group");
        const label = document.createElement("ui-select-group-label");
        label.textContent = child.label;
        group.append(label);
        for (const opt of Array.from(child.children)) {
          if (opt instanceof HTMLOptionElement) group.append(buildOption(opt));
        }
        popup.append(group);
      } else if (child instanceof HTMLOptionElement) {
        popup.append(buildOption(child));
      }
    }

    // Trigger + popup after the native select; then retire it (hidden, out of the
    // a11y tree + tab order, still submitting).
    this.append(trigger, popup);
    retireNative(select);
  }

  /** Reflect the current selection onto the adopted native `<select>`. */
  #writeNativeState() {
    if (!this.#native) return;
    for (const opt of this.#native.options) opt.selected = this.#selected.has(opt.value);
  }

  #allOptions(): HTMLElement[] {
    return [...this.querySelectorAll<HTMLElement>("ui-select-option")];
  }
  #options(): HTMLElement[] {
    return this.#allOptions().filter((o) => !o.hasAttribute("disabled"));
  }

  #labelOf(option: HTMLElement): string {
    return option.textContent?.trim() ?? "";
  }
  #valueOf(option: HTMLElement): string {
    return option.getAttribute("value") ?? this.#labelOf(option);
  }
  /** Selected values in DOM order. */
  #selectedInOrder(): string[] {
    return this.#allOptions()
      .map((o) => this.#valueOf(o))
      .filter((v) => this.#selected.has(v));
  }

  #open() {
    if (this.#isOpen || !this.#popup || !this.#trigger) return;
    this.#isOpen = true;
    this.#trigger.setAttribute("aria-expanded", "true");
    this.#overlay?.show();
    this.#popup.focus();
    const options = this.#options();
    const current = options.findIndex((o) => this.#selected.has(this.#valueOf(o)));
    this.#setActive(current >= 0 ? current : 0);
  }

  #close({ restoreFocus = true }: { restoreFocus?: boolean } = {}) {
    if (!this.#isOpen || !this.#popup) return;
    this.#isOpen = false;
    this.#activeIndex = -1;
    this.#trigger?.setAttribute("aria-expanded", "false");
    this.#popup.removeAttribute("aria-activedescendant");
    this.#allOptions().forEach((o) => o.removeAttribute("data-highlighted"));
    this.#overlay?.hide();
    if (restoreFocus) this.#trigger?.focus();
  }

  #setActive(index: number) {
    const options = this.#options();
    if (options.length === 0) return;
    const i = Math.max(0, Math.min(index, options.length - 1));
    this.#activeIndex = i;
    this.#allOptions().forEach((o) => o.removeAttribute("data-highlighted"));
    const active = options[i];
    active.setAttribute("data-highlighted", "");
    // Keep the highlighted option visible in a scrollable popup (guarded —
    // scrollIntoView is absent under happy-dom).
    active.scrollIntoView?.({ block: "nearest" });
    this.#popup?.setAttribute("aria-activedescendant", active.id);
  }

  /** Reflect the given selection onto the options, form value and trigger. */
  #applySelection(next: Set<string>) {
    this.#selected = next;
    this.#allOptions().forEach((o) => {
      const sel = next.has(this.#valueOf(o));
      o.setAttribute("aria-selected", String(sel));
      o.toggleAttribute("data-selected", sel); // item-indicator hook
    });
    this.#writeNativeState();
    this.#syncFormValue();
    if (this.#valueEl) {
      const labels = this.#allOptions()
        .filter((o) => this.#selected.has(this.#valueOf(o)))
        .map((o) => this.#labelOf(o));
      this.#valueEl.textContent = labels.length ? labels.join(", ") : this.#placeholder;
    }
  }

  #syncFormValue() {
    // In native-adoption mode the retired `<select>` is the form value.
    if (this.#native || !this.#internals) return;
    const values = this.#selectedInOrder();
    const name = this.name;
    if (this.multiple && name) {
      const data = new FormData();
      for (const v of values) data.append(name, v);
      this.#internals.setFormValue(data);
    } else {
      this.#internals.setFormValue(values[0] ?? null);
    }
  }

  /** Choose the option at `index` (into the enabled list). In `multiple` mode
   * this toggles membership and stays open; otherwise it replaces + closes. */
  #activate(index: number) {
    const option = this.#options()[index];
    if (!option) return;
    const v = this.#valueOf(option);
    if (this.multiple) {
      const next = new Set(this.#selected);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      this.#applySelection(next);
    } else {
      this.#applySelection(new Set([v]));
      this.#close();
    }
    // Mirror a real <select>: a user selection fires `change` on the native
    // control (programmatic `.value =` does not — see the value setter), so
    // listeners bound to the adopted <select> are notified.
    this.#native?.dispatchEvent(new Event("change", { bubbles: true }));
    this.dispatchEvent(
      new CustomEvent<SelectChangeDetail>("change", {
        bubbles: true,
        detail: { value: v, label: this.#labelOf(option), values: this.#selectedInOrder() },
      }),
    );
  }

  #onTriggerClick = () => {
    if (this.#isOpen) this.#close();
    else this.#open();
  };

  #onTriggerKeydown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      this.#open();
    }
  };

  #onPopupKeydown = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        this.#setActive(this.#activeIndex + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        this.#setActive(this.#activeIndex - 1);
        break;
      case "Home":
        e.preventDefault();
        this.#setActive(0);
        break;
      case "End":
        e.preventDefault();
        this.#setActive(this.#options().length - 1);
        break;
      case "Enter":
        e.preventDefault();
        if (this.#activeIndex >= 0) this.#activate(this.#activeIndex);
        break;
      case " ":
        e.preventDefault();
        // Space extends a pending typeahead search (so multi-word labels are
        // reachable); it only commits when no search is in progress.
        if (this.#typeahead) this.#typeaheadTo(" ");
        else if (this.#activeIndex >= 0) this.#activate(this.#activeIndex);
        break;
      case "Escape":
        e.preventDefault();
        this.#close();
        break;
      case "Tab":
        this.#close({ restoreFocus: false });
        break;
      default:
        if (e.key.length === 1) this.#typeaheadTo(e.key);
    }
  };

  #onOptionClick = (e: MouseEvent) => {
    const option = (e.target as Element).closest("ui-select-option") as HTMLElement | null;
    if (!option || option.hasAttribute("disabled")) return;
    const index = this.#options().indexOf(option);
    if (index >= 0) this.#activate(index);
  };

  #typeaheadTo(char: string) {
    clearTimeout(this.#typeaheadTimer);
    this.#typeahead += char;
    this.#typeaheadTimer = window.setTimeout(() => (this.#typeahead = ""), 500);
    // Diacritic-/case-insensitive match, consistent with combobox/autocomplete.
    const q = normalize(this.#typeahead);
    if (!q) return;
    const options = this.#options();
    const start = this.#activeIndex + 1;
    const ordered = [...options.slice(start), ...options.slice(0, start)];
    const match = ordered.find((o) => normalize(this.#labelOf(o)).startsWith(q));
    if (match) this.#setActive(options.indexOf(match));
  }
}

export class UISelectPopup extends HTMLElement {
  connectedCallback() {
    this.setAttribute("popover", "manual");
  }
}
export class UISelectOption extends HTMLElement {
  connectedCallback() {
    this.setAttribute("role", "option");
  }
}

/** A labelled group of options (`role=group`); label wired by the root. */
export class UISelectGroup extends HTMLElement {
  connectedCallback() {
    this.setAttribute("role", "group");
  }
}

/** The label for a `<ui-select-group>` (presentational). */
export class UISelectGroupLabel extends HTMLElement {
  connectedCallback() {
    this.setAttribute("role", "presentation");
  }
}

if (!customElements.get("ui-select")) customElements.define("ui-select", UISelect);
if (!customElements.get("ui-select-popup")) customElements.define("ui-select-popup", UISelectPopup);
if (!customElements.get("ui-select-option"))
  customElements.define("ui-select-option", UISelectOption);
if (!customElements.get("ui-select-group")) customElements.define("ui-select-group", UISelectGroup);
if (!customElements.get("ui-select-group-label"))
  customElements.define("ui-select-group-label", UISelectGroupLabel);

declare global {
  interface HTMLElementTagNameMap {
    "ui-select": UISelect;
    "ui-select-popup": UISelectPopup;
    "ui-select-option": UISelectOption;
    "ui-select-group": UISelectGroup;
    "ui-select-group-label": UISelectGroupLabel;
  }
}
