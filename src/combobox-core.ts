/**
 * Shared ARIA, overlay and key/blur policy for editable comboboxes.
 *
 * Filtering, rendering, and selection stay in the owning component. This
 * controller owns the invariants both autocomplete and combobox must keep
 * identical: input/listbox semantics, active-descendant state, the anchored
 * popup lifecycle (via {@link overlay}, including the CSS anchor pairing),
 * light-dismiss, delegated option clicks, and the shared keyboard/blur
 * guards — Escape closes only while open, an arrow key while closed asks to
 * open (`onArrowOpen`), keydowns while open flow to `onNavigate` (typically a
 * {@link listNav} engine), and focus leaving the host closes (`onClose`).
 */
import { type AnchorOptions } from "./anchor.ts";
import { nextId } from "./id.ts";
import { type Overlay, overlay } from "./overlay.ts";

export interface AriaComboboxOptions {
  readonly input: HTMLInputElement;
  readonly popup: HTMLElement;
  readonly listbox: HTMLElement;
  readonly idPrefix: string;
  /** Focus/dismiss boundary: presses and focus inside it never close. */
  readonly host: HTMLElement;
  readonly anchorOptions?: AnchorOptions;
  readonly onInput: (event: Event) => void;
  /** Close request: Escape while open, focus left the host, outside press. */
  readonly onClose: () => void;
  /** ArrowDown/ArrowUp while closed. Omit to leave closed-state arrows alone. */
  readonly onArrowOpen?: () => void;
  /** Keydown while open (after the shared guards) — list navigation. */
  readonly onNavigate: (event: KeyboardEvent) => void;
  readonly onOptionCommit: (index: number) => void;
}

export class AriaCombobox {
  readonly #input: HTMLInputElement;
  readonly #overlay: Overlay;
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
    input.addEventListener("keydown", (event) => {
      if (!this.open) {
        // An arrow while closed is an "open for browsing" request; everything
        // else (typing, Enter submitting the form) keeps its native behavior.
        if ((event.key === "ArrowDown" || event.key === "ArrowUp") && options.onArrowOpen) {
          event.preventDefault();
          options.onArrowOpen();
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        options.onClose();
        return;
      }
      options.onNavigate(event);
    });
    // Close when focus leaves the widget entirely; moving focus between parts
    // of the host (chips, clear button) keeps it open.
    input.addEventListener("blur", (event) => {
      if (!options.host.contains(event.relatedTarget as Node | null)) options.onClose();
    });
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

    this.#overlay = overlay(popup, {
      anchor: { ref: () => input, options: options.anchorOptions, pair: options.idPrefix },
      // The host is the containment boundary: chips, clear controls and the
      // popup all live inside it, so a press there must not light-dismiss.
      dismiss: { within: () => [options.host, popup], onDismiss: options.onClose },
    });
  }

  get open() {
    return this.#overlay.open;
  }

  get activeIndex() {
    return this.#activeIndex;
  }

  /** Mark an existing option active, or pass `null` to clear the active option. */
  setActive(index: number, optionId: string | null) {
    this.#activeIndex = optionId == null ? -1 : index;
    if (optionId == null) this.#input.removeAttribute("aria-activedescendant");
    else this.#input.setAttribute("aria-activedescendant", optionId);
  }

  /** Open once. Returns whether state changed. */
  show() {
    if (!this.#overlay.show()) return false;
    this.#input.setAttribute("aria-expanded", "true");
    return true;
  }

  /** Close once and clear active-descendant state. Returns whether state changed. */
  hide() {
    if (!this.#overlay.hide()) return false;
    this.#input.setAttribute("aria-expanded", "false");
    this.setActive(-1, null);
    return true;
  }
}

function stopPropagation(event: Event) {
  event.stopPropagation();
}
