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
import { connectLightDom } from "./lifecycle.ts";
import { define } from "./define.ts";
import { scopedQuery } from "./query.ts";
import { roving, type Roving } from "./roving.ts";

export class UIToggle extends HTMLElement {
  static observedAttributes = ["pressed", "disabled"];

  /** Whether a group owns activation + tab stop — read live from the DOM so a
   * toggle inserted after the group wired is grouped from its first click. */
  get #grouped() {
    return this.closest("ui-toggle-group") !== null;
  }

  get pressed() {
    return this.hasAttribute("pressed");
  }
  set pressed(next: boolean) {
    this.toggleAttribute("pressed", next);
  }
  get value() {
    return this.getAttribute("value") ?? "";
  }
  get disabled() {
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

export class UIToggleGroup extends HTMLElement {
  #roving: Roving | null = null;
  #wired = false;

  /** `multiple` attribute → any number pressed; otherwise single-select. */
  get multiple() {
    return this.hasAttribute("multiple");
  }
  get value() {
    const pressed = this.#allToggles()
      .filter((t) => t.pressed)
      .map((t) => t.value);
    return this.multiple ? pressed : (pressed[0] ?? null);
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    // Only wire once at least one toggle exists, so a wiring pass that beats
    // the parser sees connectLightDom retry on the next light-DOM mutation
    // instead of silently claiming an empty host.
    if (this.#allToggles().length === 0) return;
    this.#wired = true;
    this.setAttribute("role", "group");

    this.#roving = roving(this, {
      items: () => this.#toggles(),
      orientation: "horizontal",
      loop: true,
      onActivate: (item) => this.#activate(item as UIToggle),
    });
    this.addEventListener("click", this.#onClick);
    this.#roving.refresh(0);
  }

  // Scoped so a nested ui-toggle-group keeps ownership of its own toggles.
  #allToggles() {
    return scopedQuery<UIToggle>(this, "ui-toggle");
  }
  #toggles() {
    return this.#allToggles().filter((t) => !t.disabled);
  }

  #activate(toggle: UIToggle) {
    if (!toggle || toggle.disabled) return;
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
    const toggle = (e.target as Element).closest("ui-toggle") as UIToggle | null;
    if (toggle?.closest("ui-toggle-group") === this) this.#activate(toggle);
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
