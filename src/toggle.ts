/**
 * `ui-toggle` / `ui-toggle-group` — pressable toggle buttons (Base UI's Toggle
 * and Toggle Group). A standalone `ui-toggle` is an `aria-pressed` button that
 * flips on click / Space / Enter and carries no form value. Inside a
 * `ui-toggle-group` the group takes over: it manages a single roving tab stop
 * (via {@link roving}), coordinates `single` vs `multiple` selection, and
 * exposes the pressed `value`(s). The toggles defer their own activation to the
 * group so a keypress is never handled twice.
 */
import { connectLightDom } from "./lifecycle.ts";
import { roving, type Roving } from "./roving.ts";

export class UIToggle extends HTMLElement {
  static observedAttributes = ["pressed", "disabled"];

  #grouped = false;

  get pressed(): boolean {
    return this.hasAttribute("pressed");
  }
  set pressed(next: boolean) {
    this.toggleAttribute("pressed", next);
  }
  get value(): string {
    return this.getAttribute("value") ?? "";
  }
  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }

  /** Called by a `ui-toggle-group` to take ownership of activation + tab stop. */
  setGrouped(grouped: boolean) {
    this.#grouped = grouped;
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
  get multiple(): boolean {
    return this.hasAttribute("multiple");
  }
  get value(): string | string[] | null {
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
    this.#wired = true;
    this.setAttribute("role", "group");
    this.#allToggles().forEach((t) => t.setGrouped(true));

    this.#roving = roving(this, {
      items: () => this.#toggles(),
      orientation: "horizontal",
      loop: true,
      onActivate: (item) => this.#activate(item as UIToggle),
    });
    this.addEventListener("click", this.#onClick);
    this.#roving.refresh(0);
  }

  #allToggles(): UIToggle[] {
    return [...this.querySelectorAll<UIToggle>("ui-toggle")];
  }
  #toggles(): UIToggle[] {
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
    if (toggle) this.#activate(toggle);
  };
}

if (!customElements.get("ui-toggle")) customElements.define("ui-toggle", UIToggle);
if (!customElements.get("ui-toggle-group")) customElements.define("ui-toggle-group", UIToggleGroup);

declare global {
  interface HTMLElementTagNameMap {
    "ui-toggle": UIToggle;
    "ui-toggle-group": UIToggleGroup;
  }
}
