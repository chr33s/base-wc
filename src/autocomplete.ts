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
import { UIPopupElement } from "./popup.ts";
import { FormAssociatedElement, type FormControlOptions } from "./form-control.ts";
import { nextId } from "./id.ts";
import { managedDisabled } from "./native.ts";
import { listNav, type ListNav } from "./list-nav.ts";
import type { ChangeReason } from "./reasons.ts";
import { localeOf, normalize } from "./text.ts";

/** Detail of the `change` event dispatched when the value is committed. */
export interface AutocompleteChangeDetail {
  readonly value: string;
  /** What caused the change — a press on a suggestion, or Enter on one. */
  readonly reason: ChangeReason;
}

/** The autocomplete host: an input whose text is the form value, with a suggestion listbox. */
export class UIAutocomplete extends FormAssociatedElement {
  protected override formControlOptions(): FormControlOptions {
    return {
      value: () => this.value, // the input text is the form value ("" = empty)
      onReset: () => this.#onFormReset(),
    };
  }
  protected override onFormDisabled(disabled: boolean) {
    this.toggleAttribute("data-disabled", disabled);
    this.#setInputDisabled?.(disabled);
  }
  static observedAttributes = ["readonly"];
  attributeChangedCallback() {
    this.#syncReadOnly();
  }
  #uid = nextId("ac");
  #input!: HTMLInputElement;
  #list!: HTMLElement;
  #empty: HTMLElement | null = null;
  /** Set the inner input's `disabled`, re-enabling only what we disabled. */
  #setInputDisabled: ((disabled: boolean) => void) | null = null;
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

  /** The input text, which is the form value (`""` before wiring). */
  get value(): string {
    return this.#input?.value ?? "";
  }
  /**
   * Locks the *value*, not the interaction: the suggestion popup still opens
   * and can be browsed, but neither typing nor committing a suggestion changes
   * the text. An author who wants the control inert wants `disabled`.
   */
  get readOnly(): boolean {
    return this.hasAttribute("readonly");
  }
  /** The suggestion pool, filtered against the input text as the user types. */
  set items(next: string[]) {
    this.#items = Array.isArray(next) ? next.slice() : [];
    // Normalize once per item set, not once per item per keystroke.
    // Wrapped, not passed by reference: `map` would hand the array index to
    // `normalize` as its `locale`.
    const locale = localeOf(this);
    this.#normalizedItems = this.#items.map((item) => normalize(item, locale));
    if (this.wired && this.#controller?.open) this.#filter(this.#input.value);
  }

  protected override initialize() {
    const input =
      this.querySelector<HTMLInputElement>("[data-autocomplete-input]") ??
      this.querySelector<HTMLInputElement>("input");
    const popup = this.querySelector<HTMLElement>("ui-autocomplete-popup");
    const list = this.querySelector<HTMLElement>("ui-autocomplete-list");
    if (!input || !popup || !list) return false;

    this.#input = input;
    this.#setInputDisabled = managedDisabled(input);
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
      onClose: (reason) => this.#close(reason),
      onArrowOpen: (reason) => this.#openForBrowsing(reason),
      onNavigate: (e) => this.#nav.handle(e),
      onOptionCommit: (index) => this.#commit(index),
    });

    this.#syncReadOnly();
    this.formControl.setValue(input.value);
    return true;
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#close();
  }

  /** `form.reset()`: the browser restores the inner input's own default value
   * during the same reset pass; re-sync the submitted text and drop any open
   * suggestion state once it has. */
  #onFormReset() {
    if (!this.wired) return;
    queueMicrotask(() => {
      this.#matches = [];
      this.#renderMatches();
      this.#close();
      this.formControl.setValue(this.#input.value);
    });
  }

  /**
   * One-way managed disable of the inner input on form-driven disabled (host
   * `disabled` attribute / disabled `<fieldset>` ancestor): re-enabling only
   * touches an input *we* disabled, never one the author disabled directly.
   */

  #filter(query: string) {
    const q = normalize(query, localeOf(this));
    this.#matches =
      q === "" ? [] : this.#items.filter((_, i) => this.#normalizedItems[i]?.includes(q));
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
    if (!active) {
      this.#controller?.setActive(-1, null);
      return;
    }
    active.setAttribute("data-highlighted", "");
    this.#controller?.setActive(index, active.id);
  }

  #onInput = () => {
    this.formControl.setValue(this.#input.value);
    const q = this.#input.value;
    if (q === "") {
      this.#matches = [];
      this.#renderMatches();
      this.#close("input-clear");
      return;
    }
    this.#filter(q);
    this.#open("input-change");
    this.#setActive(this.#matches.length ? 0 : -1);
  };

  /**
   * Open on an arrow key with the current text as the query, so a read-only
   * autocomplete — which can never type one — can still browse its suggestions.
   */
  #openForBrowsing(reason: ChangeReason) {
    this.#filter(this.#input.value);
    this.#open(reason);
    this.#setActive(this.#matches.length ? 0 : -1);
  }

  #open(reason: ChangeReason = "none") {
    this.#controller?.show(reason);
  }

  #close(reason: ChangeReason = "none") {
    this.#controller?.hide(reason);
  }

  /** Mirror `readonly` onto the host, the input and the suggestion list. */
  #syncReadOnly() {
    const readOnly = this.readOnly;
    this.toggleAttribute("data-readonly", readOnly);
    if (!this.#input) return;
    this.#input.readOnly = readOnly;
    for (const el of [this.#input, this.#list]) {
      el.toggleAttribute("data-readonly", readOnly);
      if (readOnly) el.setAttribute("aria-readonly", "true");
      else el.removeAttribute("aria-readonly");
    }
  }

  #commit(index: number) {
    const label = this.#matches[index];
    // `readonly` locks the value: browsing got the user here, committing is
    // where it stops.
    if (label == null || this.readOnly) return;
    this.#input.value = label;
    this.formControl.setValue(label);
    this.#close("item-press");
    this.dispatchEvent(
      new CustomEvent<AutocompleteChangeDetail>("change", {
        bubbles: true,
        detail: { value: label, reason: "item-press" },
      }),
    );
  }
}

/** Popup container for the suggestion list. */
export class UIAutocompletePopup extends UIPopupElement {}
/** Container the suggestion rows are injected into. */
export class UIAutocompleteList extends HTMLElement {}
/** Shown while the query matches no suggestion. */
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
