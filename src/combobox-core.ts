/**
 * Shared ARIA and overlay state for editable comboboxes.
 *
 * Filtering, keyboard policy, rendering, and selection stay in the owning
 * component. This controller owns the invariants both autocomplete and
 * combobox must keep identical: input/listbox semantics, active-descendant
 * state, anchored popup lifecycle, light-dismiss, and delegated option clicks.
 */
import { type AnchorOptions, SUPPORTS_ANCHOR } from "./anchor.ts";
import { nextId } from "./id.ts";
import { type Overlay, overlay } from "./overlay.ts";

export interface AriaComboboxOptions {
  readonly input: HTMLInputElement;
  readonly popup: HTMLElement;
  readonly listbox: HTMLElement;
  readonly idPrefix: string;
  readonly anchorOptions?: AnchorOptions;
  readonly dismissWithin: () => (Element | null | undefined)[];
  readonly onDismiss: () => void;
  readonly onInput: (event: Event) => void;
  readonly onKeydown: (event: KeyboardEvent) => void;
  readonly onBlur: (event: FocusEvent) => void;
  readonly onOptionCommit: (index: number) => void;
}

export class AriaCombobox {
  readonly #input: HTMLInputElement;
  readonly #overlay: Overlay;
  #open = false;
  #activeIndex = -1;

  constructor(options: AriaComboboxOptions) {
    const { input, popup, listbox } = options;
    this.#input = input;

    if (!listbox.id) listbox.id = nextId(`${options.idPrefix}-listbox`);
    listbox.setAttribute("role", "listbox");
    for (const [name, value] of Object.entries({
      role: "combobox",
      "aria-autocomplete": "list",
      "aria-haspopup": "listbox",
      "aria-expanded": "false",
      "aria-controls": listbox.id,
      autocomplete: "off",
      autocapitalize: "none",
      spellcheck: "false",
    })) {
      input.setAttribute(name, value);
    }

    input.addEventListener("input", options.onInput);
    input.addEventListener("keydown", options.onKeydown);
    input.addEventListener("blur", options.onBlur);
    // The host emits its own semantic events; native events from the internal
    // input would otherwise escape with an incompatible shape.
    input.addEventListener("input", stopPropagation);
    input.addEventListener("change", stopPropagation);

    listbox.addEventListener("click", (event) => {
      const row = (event.target as Element).closest<HTMLElement>("[data-index]");
      if (row) options.onOptionCommit(Number(row.dataset.index));
    });
    // Preserve input focus while still allowing the synthesized click used by
    // touch input to commit the option.
    listbox.addEventListener("mousedown", (event) => {
      if ((event.target as Element).closest("[data-index]")) event.preventDefault();
    });

    if (SUPPORTS_ANCHOR) {
      const name = `--${options.idPrefix}-${nextId("anchor")}`;
      input.style.setProperty("anchor-name", name);
      popup.style.setProperty("position-anchor", name);
    }

    this.#overlay = overlay(popup, {
      anchor: { ref: () => input, options: options.anchorOptions },
      dismiss: { within: options.dismissWithin, onDismiss: options.onDismiss },
    });
  }

  get open(): boolean {
    return this.#open;
  }

  get activeIndex(): number {
    return this.#activeIndex;
  }

  /** Mark an existing option active, or pass `null` to clear the active option. */
  setActive(index: number, optionId: string | null): void {
    this.#activeIndex = optionId == null ? -1 : index;
    if (optionId == null) this.#input.removeAttribute("aria-activedescendant");
    else this.#input.setAttribute("aria-activedescendant", optionId);
  }

  /** Open once. Returns whether state changed. */
  show(): boolean {
    if (this.#open) return false;
    this.#open = true;
    this.#input.setAttribute("aria-expanded", "true");
    this.#overlay.show();
    return true;
  }

  /** Close once and clear active-descendant state. Returns whether state changed. */
  hide(): boolean {
    if (!this.#open) return false;
    this.#open = false;
    this.#input.setAttribute("aria-expanded", "false");
    this.setActive(-1, null);
    this.#overlay.hide();
    return true;
  }
}

function stopPropagation(event: Event): void {
  event.stopPropagation();
}
