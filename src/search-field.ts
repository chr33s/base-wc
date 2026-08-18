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
import { connectLightDom } from "./lifecycle.ts";
import { fireNativeChange } from "./native.ts";

export interface SearchDetail {
  readonly value: string;
}

export class UISearchField extends HTMLElement {
  #wired = false;
  #input!: HTMLInputElement;
  #clear: HTMLElement | null = null;
  #timer = 0;

  get value(): string {
    return this.#input?.value ?? "";
  }
  set value(next: string) {
    if (!this.#input) return;
    this.#input.value = next;
    this.#reflect();
  }

  #debounce(): number {
    const raw = Number(this.getAttribute("debounce"));
    return Number.isFinite(raw) && raw >= 0 ? raw : 250;
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
      this.querySelector<HTMLInputElement>('input[type="search"]') ??
      this.querySelector<HTMLInputElement>("input");
    if (!input) return;
    this.#wired = true;
    this.#input = input;
    if (!input.type) input.type = "search";

    this.#clear = this.querySelector<HTMLElement>("[data-search-clear]") ?? this.#buildClear();
    this.#clear.addEventListener("click", this.#onClear);
    input.addEventListener("input", this.#onInput);
    input.addEventListener("keydown", this.#onKeydown);
    this.#reflect();
  }

  #buildClear() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-search-clear", "");
    btn.setAttribute("aria-label", "Clear search");
    btn.textContent = "✕";
    this.#input.after(btn);
    return btn;
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

if (!customElements.get("ui-search-field")) customElements.define("ui-search-field", UISearchField);

declare global {
  interface HTMLElementTagNameMap {
    "ui-search-field": UISearchField;
  }
}
