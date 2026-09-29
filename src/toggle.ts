/**
 * `ui-toggle` / `ui-toggle-group` — pressable toggle buttons (Base UI's Toggle
 * and Toggle Group). A standalone `ui-toggle` is an `aria-pressed` button that
 * flips on click / Space / Enter and carries no form value. Inside a
 * `ui-toggle-group` the group takes over: it manages a single roving tab stop
 * (via {@link roving}), coordinates `single` vs `multiple` selection, and
 * exposes the pressed `value`(s). A toggle detects its group live from DOM
 * ancestry, so it defers activation to the group from the moment it is inserted
 * — a keypress or click is never handled twice.
 */
import { define } from "./define.ts";
import { closestFrom } from "./internal/closest.ts";
import { scopedQuery } from "./query.ts";
import { RovingElement, type RovingOptions } from "./roving.ts";

/** Pressable `aria-pressed` button; standalone it flips itself, grouped its {@link UIToggleGroup} owns it. */
export class UIToggle extends HTMLElement {
  static observedAttributes = ["pressed", "disabled"];

  /** Whether a group owns activation + tab stop — read live from the DOM so a
   * toggle inserted after the group wired is grouped from its first click. */
  get #grouped() {
    return this.closest("ui-toggle-group") !== null;
  }

  /** Whether the toggle is on (the `pressed` attribute). */
  get pressed(): boolean {
    return this.hasAttribute("pressed");
  }
  set pressed(next: boolean) {
    this.toggleAttribute("pressed", next);
  }
  /** Identifier reported in the group's `value` (the `value` attribute). */
  get value(): string {
    return this.getAttribute("value") ?? "";
  }
  /** Whether the toggle is disabled. */
  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }

  connectedCallback() {
    this.setAttribute("role", "button");
    this.addEventListener("click", this.#onClick);
    this.addEventListener("keydown", this.#onKeydown);
    this.#sync();
  }

  attributeChangedCallback() {
    this.#sync();
  }

  #sync() {
    this.setAttribute("aria-pressed", String(this.pressed));
    this.setAttribute("aria-disabled", String(this.disabled));
    this.setAttribute("data-state", this.pressed ? "on" : "off");
    if (!this.#grouped) this.tabIndex = this.disabled ? -1 : 0;
  }

  #toggle() {
    if (this.disabled || this.#grouped) return; // grouped: the group owns it
    this.pressed = !this.pressed;
    this.dispatchEvent(
      new CustomEvent("change", { bubbles: true, detail: { pressed: this.pressed } }),
    );
  }

  #onClick = () => this.#toggle();

  #onKeydown = (e: KeyboardEvent) => {
    if (this.#grouped) return; // the group's roving handles keys
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      this.#toggle();
    }
  };
}

/** Coordinates a set of {@link UIToggle}s: roving focus plus single or `multiple` selection. */
export class UIToggleGroup extends RovingElement {
  /** `multiple` attribute → any number pressed; otherwise single-select. */
  get multiple(): boolean {
    return this.hasAttribute("multiple");
  }
  /** Pressed toggle values: an array in `multiple` mode, else the single value or `null`. */
  get value(): string | string[] | null {
    const pressed = this.#allToggles()
      .filter((t) => t.pressed)
      .map((t) => t.value);
    return this.multiple ? pressed : (pressed[0] ?? null);
  }

  protected override initialize() {
    // Only wire once at least one toggle exists, so a wiring pass that beats
    // the parser sees connectLightDom retry on the next light-DOM mutation
    // instead of silently claiming an empty host.
    if (this.#allToggles().length === 0) return false;
    this.setAttribute("role", "group");

    this.attachRoving();
    this.addEventListener("click", this.#onClick);
    this.roving?.refresh(0);
    return true;
  }

  protected override rovingOptions(): RovingOptions {
    return {
      items: () => this.#toggles(),
      orientation: "horizontal",
      loop: true,
      onActivate: (item) => {
        if (item instanceof UIToggle) this.#activate(item);
      },
    };
  }

  // Scoped so a nested ui-toggle-group keeps ownership of its own toggles.
  #allToggles() {
    return scopedQuery<UIToggle>(this, "ui-toggle");
  }
  #toggles() {
    return this.#allToggles().filter((t) => !t.disabled);
  }

  #activate(toggle: UIToggle) {
    if (toggle.disabled) return;
    if (this.multiple) {
      toggle.pressed = !toggle.pressed;
    } else {
      const wasPressed = toggle.pressed;
      this.#allToggles().forEach((t) => {
        t.pressed = false;
      });
      toggle.pressed = !wasPressed; // single mode still allows deselect
    }
    this.dispatchEvent(new CustomEvent("change", { bubbles: true, detail: { value: this.value } }));
  }

  #onClick = (e: MouseEvent) => {
    const toggle = closestFrom(e, "ui-toggle");
    if (toggle instanceof UIToggle && toggle.closest("ui-toggle-group") === this)
      this.#activate(toggle);
  };
}

define("ui-toggle", UIToggle);
define("ui-toggle-group", UIToggleGroup);

declare global {
  interface HTMLElementTagNameMap {
    "ui-toggle": UIToggle;
    "ui-toggle-group": UIToggleGroup;
  }
}
