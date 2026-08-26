/**
 * `ui-autocomplete` — an input with a suggestion listbox (Base UI's
 * Autocomplete). It shares the Combobox core but runs with `selectionMode:
 * none`: the **form value is the input text itself**, not a chosen item.
 * Committing a suggestion simply fills the input. The {@link AriaCombobox} core
 * owns the popup lifecycle ({@link anchor} positioning, the Popover-API top
 * layer, {@link onOutsidePress} dismissal) and the key/blur guards; navigation
 * over the matches is the shared {@link listNav} engine (wrap policy, arrows
 * only — `Home`/`End` stay with the input caret) via `aria-activedescendant`,
 * with {@link normalize} filtering.
 *
 * Markup: a `[data-autocomplete-input]`, a `<ui-autocomplete-popup>` wrapping a
 * `<ui-autocomplete-list>` (rows are injected) and an optional
 * `<ui-autocomplete-empty>`. Suggestions are supplied via the `items` property.
 */
import { AriaCombobox } from "./combobox-core.ts";
import { define } from "./define.ts";
import { type FormControl, formControl } from "./form-control.ts";
import { nextId } from "./id.ts";
import { connectLightDom } from "./lifecycle.ts";
import { listNav, type ListNav } from "./list-nav.ts";
import { normalize } from "./text.ts";

/** Detail of the `change` event dispatched when the value is committed. */
export interface AutocompleteChangeDetail {
  readonly value: string;
}

export class UIAutocomplete extends HTMLElement {
  static formAssociated = true;

  #formControl: FormControl = formControl(this, {
    value: () => this.value, // the input text is the form value ("" = empty)
    onReset: () => this.#onFormReset(),
    onFormDisabled: (disabled) => this.#applyFormDisabled(disabled),
  });
  #uid = nextId("ac");
  #input!: HTMLInputElement;
  #list!: HTMLElement;
  #empty: HTMLElement | null = null;
  #wired = false;
  /** Whether *we* disabled the inner input (so we may re-enable it later). */
  #managedDisabled = false;
  #items: string[] = [];
  #normalizedItems: string[] = [];
  #matches: string[] = [];
  #controller: AriaCombobox | null = null;
  // Shared listbox keyboard engine (wrap policy). Home/End stay with the input
  // caret, so only the arrows navigate the matches.
  #nav: ListNav = listNav({
    count: () => this.#matches.length,
    activeIndex: () => this.#controller?.activeIndex ?? -1,
    onActive: (i) => this.#setActive(i),
    loop: true,
    onCommit: (i) => this.#commit(i),
    homeEnd: false,
  });

  get form() {
    return this.#formControl.form;
  }
  get name() {
    return this.getAttribute("name");
  }
  get value() {
    return this.#input?.value ?? "";
  }
  get validity() {
    return this.#formControl.validity;
  }
  get validationMessage() {
    return this.#formControl.validationMessage;
  }
  checkValidity() {
    return this.#formControl.checkValidity();
  }
  reportValidity() {
    return this.#formControl.reportValidity();
  }
  formResetCallback() {
    this.#formControl.handleReset();
  }
  formDisabledCallback(disabled: boolean) {
    this.#formControl.handleDisabled(disabled);
  }
  set items(next: string[]) {
    this.#items = Array.isArray(next) ? next.slice() : [];
    // Normalize once per item set, not once per item per keystroke.
    this.#normalizedItems = this.#items.map(normalize);
    if (this.#wired && this.#controller?.open) this.#filter(this.#input.value);
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    const input =
      this.querySelector<HTMLInputElement>("[data-autocomplete-input]") ??
      this.querySelector<HTMLInputElement>("input");
    const popup = this.querySelector<HTMLElement>("ui-autocomplete-popup");
    const list = this.querySelector<HTMLElement>("ui-autocomplete-list");
    if (!input || !popup || !list) return;

    this.#input = input;
    this.#list = list;
    this.#empty = this.querySelector<HTMLElement>("ui-autocomplete-empty");
    this.#controller = new AriaCombobox({
      input,
      popup,
      listbox: list,
      idPrefix: "ac",
      host: this,
      anchorOptions: { offset: 6, padding: 8 },
      onInput: this.#onInput,
      onClose: () => this.#close(),
      onNavigate: (e) => this.#nav.handle(e),
      onOptionCommit: (index) => this.#commit(index),
    });

    this.#wired = true;
    this.#formControl.setValue(input.value);
  }

  disconnectedCallback() {
    this.#close();
  }

  /** `form.reset()`: the browser restores the inner input's own default value
   * during the same reset pass; re-sync the submitted text and drop any open
   * suggestion state once it has. */
  #onFormReset() {
    if (!this.#wired) return;
    queueMicrotask(() => {
      this.#matches = [];
      this.#renderMatches();
      this.#close();
      this.#formControl.setValue(this.#input.value);
    });
  }

  /**
   * One-way managed disable of the inner input on form-driven disabled (host
   * `disabled` attribute / disabled `<fieldset>` ancestor): re-enabling only
   * touches an input *we* disabled, never one the author disabled directly.
   */
  #applyFormDisabled(disabled: boolean) {
    this.toggleAttribute("data-disabled", disabled);
    if (!this.#wired) return;
    if (disabled) {
      if (!this.#input.disabled) {
        this.#input.disabled = true;
        this.#managedDisabled = true;
      }
    } else if (this.#managedDisabled) {
      this.#input.disabled = false;
      this.#managedDisabled = false;
    }
  }

  #filter(query: string) {
    const q = normalize(query);
    this.#matches =
      q === "" ? [] : this.#items.filter((_, i) => this.#normalizedItems[i].includes(q));
    this.#renderMatches();
    this.#empty?.toggleAttribute("hidden", !(q !== "" && this.#matches.length === 0));
  }

  #renderMatches() {
    this.#list.textContent = "";
    this.#matches.forEach((label, i) => {
      const row = document.createElement("div");
      row.className = "ac-row";
      row.setAttribute("role", "option");
      row.id = `${this.#uid}-opt-${i}`;
      row.dataset.index = String(i);
      row.setAttribute("aria-selected", "false");
      row.textContent = label;
      this.#list.appendChild(row);
    });
  }

  #setActive(index: number) {
    const rows = [...this.#list.querySelectorAll<HTMLElement>("[data-index]")];
    rows.forEach((r) => r.removeAttribute("data-highlighted"));
    if (index < 0 || index >= rows.length) {
      this.#controller?.setActive(-1, null);
      return;
    }
    const active = rows[index];
    active.setAttribute("data-highlighted", "");
    this.#controller?.setActive(index, active.id);
  }

  #onInput = () => {
    this.#formControl.setValue(this.#input.value);
    const q = this.#input.value;
    if (q === "") {
      this.#matches = [];
      this.#renderMatches();
      this.#close();
      return;
    }
    this.#filter(q);
    this.#open();
    this.#setActive(this.#matches.length ? 0 : -1);
  };

  #open() {
    this.#controller?.show();
  }

  #close() {
    this.#controller?.hide();
  }

  #commit(index: number) {
    const label = this.#matches[index];
    if (label == null) return;
    this.#input.value = label;
    this.#formControl.setValue(label);
    this.#close();
    this.dispatchEvent(
      new CustomEvent<AutocompleteChangeDetail>("change", {
        bubbles: true,
        detail: { value: label },
      }),
    );
  }
}

export class UIAutocompletePopup extends HTMLElement {
  connectedCallback() {
    this.setAttribute("popover", "manual");
  }
}
export class UIAutocompleteList extends HTMLElement {}
export class UIAutocompleteEmpty extends HTMLElement {}

define("ui-autocomplete", UIAutocomplete);
define("ui-autocomplete-popup", UIAutocompletePopup);
define("ui-autocomplete-list", UIAutocompleteList);
define("ui-autocomplete-empty", UIAutocompleteEmpty);

declare global {
  interface HTMLElementTagNameMap {
    "ui-autocomplete": UIAutocomplete;
    "ui-autocomplete-popup": UIAutocompletePopup;
    "ui-autocomplete-list": UIAutocompleteList;
    "ui-autocomplete-empty": UIAutocompleteEmpty;
  }
}
