/**
 * `ui-autocomplete` — an input with a suggestion listbox (Base UI's
 * Autocomplete). It shares the Combobox core but runs with `selectionMode:
 * none`: the **form value is the input text itself**, not a chosen item.
 * Committing a suggestion simply fills the input. Reuses {@link anchor}
 * positioning, the Popover-API top layer, {@link onOutsidePress} dismissal, and
 * {@link normalize} filtering, with `aria-activedescendant` navigation over the
 * matches.
 *
 * Markup: a `[data-autocomplete-input]`, a `<ui-autocomplete-popup>` wrapping a
 * `<ui-autocomplete-list>` (rows are injected) and an optional
 * `<ui-autocomplete-empty>`. Suggestions are supplied via the `items` property.
 */
import { AriaCombobox } from "./combobox-core.ts";
import { nextId } from "./id.ts";
import { connectLightDom } from "./lifecycle.ts";
import { normalize } from "./text.ts";

/** Detail of the `change` event dispatched when the value is committed. */
export interface AutocompleteChangeDetail {
  readonly value: string;
}

export class UIAutocomplete extends HTMLElement {
  static formAssociated = true;

  #internals: ElementInternals | null = this.attachInternals?.() ?? null;
  #uid = nextId("ac");
  #input!: HTMLInputElement;
  #list!: HTMLElement;
  #empty: HTMLElement | null = null;
  #wired = false;
  #items: string[] = [];
  #normalizedItems: string[] = [];
  #matches: string[] = [];
  #controller: AriaCombobox | null = null;

  get form(): HTMLFormElement | null {
    return this.#internals?.form ?? null;
  }
  get name(): string | null {
    return this.getAttribute("name");
  }
  get value(): string {
    return this.#input?.value ?? "";
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
      anchorOptions: { offset: 6, padding: 8 },
      dismissWithin: () => [popup, input],
      onDismiss: () => this.#close(),
      onInput: this.#onInput,
      onKeydown: this.#onKeydown,
      onBlur: this.#onBlur,
      onOptionCommit: (index) => this.#commit(index),
    });

    this.#wired = true;
    this.#internals?.setFormValue(input.value);
  }

  disconnectedCallback() {
    this.#close();
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
    this.#internals?.setFormValue(this.#input.value);
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

  #onKeydown = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        if (this.#controller?.open && this.#matches.length) {
          e.preventDefault();
          this.#setActive((this.#controller.activeIndex + 1) % this.#matches.length);
        }
        break;
      case "ArrowUp":
        if (this.#controller?.open && this.#matches.length) {
          e.preventDefault();
          this.#setActive(
            (this.#controller.activeIndex - 1 + this.#matches.length) % this.#matches.length,
          );
        }
        break;
      case "Enter":
        if (this.#controller?.open && this.#controller.activeIndex >= 0) {
          e.preventDefault();
          this.#commit(this.#controller.activeIndex);
        }
        break;
      case "Escape":
        if (this.#controller?.open) {
          e.preventDefault();
          this.#close();
        }
        break;
    }
  };

  #onBlur = (e: FocusEvent) => {
    if (!this.contains(e.relatedTarget as Node | null)) this.#close();
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
    this.#internals?.setFormValue(label);
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

if (!customElements.get("ui-autocomplete"))
  customElements.define("ui-autocomplete", UIAutocomplete);
if (!customElements.get("ui-autocomplete-popup"))
  customElements.define("ui-autocomplete-popup", UIAutocompletePopup);
if (!customElements.get("ui-autocomplete-list"))
  customElements.define("ui-autocomplete-list", UIAutocompleteList);
if (!customElements.get("ui-autocomplete-empty"))
  customElements.define("ui-autocomplete-empty", UIAutocompleteEmpty);

declare global {
  interface HTMLElementTagNameMap {
    "ui-autocomplete": UIAutocomplete;
    "ui-autocomplete-popup": UIAutocompletePopup;
    "ui-autocomplete-list": UIAutocompleteList;
    "ui-autocomplete-empty": UIAutocompleteEmpty;
  }
}
