/**
 * `ui-search-field` — a native-first search input with a clear affordance and a
 * debounced `search` event (no Base UI counterpart; the "we're close" search
 * primitive that sits below `ui-combobox`/`ui-autocomplete`).
 *
 * **Native-first.** Author `<input type="search" name="q">` and it works with no
 * JavaScript — the browser owns typing and submission. On upgrade the component
 * generates a `[data-search-clear]` button (or adopts an authored one), reflects
 * empty/non-empty as `data-empty` on the host, clears on the button or `Escape`
 * (restoring focus), and emits a debounced bubbling `search` event with
 * `{ value }`. The `debounce` attribute sets the delay in ms (default 250; `0`
 * fires synchronously).
 */
import { define } from "./define.ts";
import { LightDomElement } from "./lifecycle.ts";
import { adoptedControl, fireNativeChange } from "./native.ts";
import { ensureButton } from "./parts.ts";

export interface SearchDetail {
  readonly value: string;
}

export class UISearchField extends LightDomElement {
  #input!: HTMLInputElement;
  #clear: HTMLElement | null = null;
  #timer = 0;

  get value() {
    return this.#input?.value ?? "";
  }
  set value(next: string) {
    if (!this.#input) return;
    this.#input.value = next;
    this.#reflect();
  }

  /** Debounce delay in ms. An absent or empty attribute carries no value — which is not the same as `0` (fire synchronously) — so it falls back to the documented 250. */
  #debounce() {
    const raw = this.getAttribute("debounce");
    if (raw == null || raw.trim() === "") return 250;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 250;
  }

  protected override wire() {
    // Adoption-scoped: an input belonging to a *nested* component inside our
    // light DOM must never be wired as ours.
    const input =
      adoptedControl<HTMLInputElement>(this, 'input[type="search"]') ??
      adoptedControl<HTMLInputElement>(this, "input");
    if (!input) return;
    this.wired = true;
    this.#input = input;
    if (!input.type) input.type = "search";

    this.#clear = ensureButton(this, {
      marker: "data-search-clear",
      label: "Clear search",
      text: "✕",
      insert: (btn) => input.after(btn),
    });
    this.#clear.addEventListener("click", this.#onClear);
    input.addEventListener("input", this.#onInput);
    input.addEventListener("keydown", this.#onKeydown);
    this.#reflect();
  }

  #reflect() {
    const empty = this.value === "";
    this.toggleAttribute("data-empty", empty);
    if (this.#clear) this.#clear.hidden = empty;
  }

  #onInput = () => {
    this.#reflect();
    const delay = this.#debounce();
    clearTimeout(this.#timer);
    if (delay === 0) this.#emit();
    else this.#timer = window.setTimeout(() => this.#emit(), delay);
  };

  #onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.value !== "") {
      e.preventDefault();
      e.stopPropagation(); // don't also bubble to a dialog/menu that listens for Escape
      this.#clearValue();
    }
  };

  #onClear = () => {
    this.#clearValue();
    this.#input.focus();
  };

  #clearValue() {
    if (this.value === "") return;
    this.#input.value = "";
    this.#reflect();
    fireNativeChange(this.#input);
    clearTimeout(this.#timer);
    this.#emit();
  }

  #emit() {
    this.dispatchEvent(
      new CustomEvent<SearchDetail>("search", { bubbles: true, detail: { value: this.value } }),
    );
  }

  disconnectedCallback() {
    clearTimeout(this.#timer);
  }
}

define("ui-search-field", UISearchField);

declare global {
  interface HTMLElementTagNameMap {
    "ui-search-field": UISearchField;
  }
}
