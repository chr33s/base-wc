/**
 * `ui-checkbox` / `ui-checkbox-group` — checkboxes (Base UI's Checkbox + Checkbox
 * Group).
 *
 * `ui-checkbox` is a **pure enhancer of a native checkbox**: author
 * `<ui-checkbox><input type="checkbox" name="tos" /></ui-checkbox>` and it works
 * with no JavaScript (the checkbox toggles and submits on its own). On upgrade
 * the component {@link adoptedControl | adopts} that input and mirrors its
 * checked / indeterminate / disabled state onto the `data-state` / `data-disabled`
 * hooks, while the **browser owns focus, keyboard, and submission**. There is no
 * self-rendered / `ElementInternals` fallback: the native input is the control.
 *
 * `ui-checkbox-group` registers its child checkboxes and derives a parent
 * "select all" checkbox's state (checked / unchecked / indeterminate) from them,
 * and pushing the parent sets every child. The group is a JS-only enhancement
 * over the native children.
 *
 * Renders in **light DOM**: overlay the input on the visual box and render the
 * tick off the state hooks — `ui-checkbox:has(input:checked)`,
 * `ui-checkbox[data-state="checked"]` — so a bare
 * `<ui-checkbox><input type="checkbox" /></ui-checkbox>` needs no extra child.
 */
import { connectLightDom } from "./lifecycle.ts";
import { adoptedControl } from "./native.ts";

export class UICheckbox extends HTMLElement {
  /** The adopted native checkbox — the interactive control + form value. */
  #native: HTMLInputElement | null = null;
  #wired = false;

  get form(): HTMLFormElement | null {
    return this.#native?.form ?? null;
  }
  get name(): string | null {
    return this.#native?.name ?? null;
  }
  get value(): string {
    return this.#native?.value || "on";
  }
  get checked(): boolean {
    return this.#native?.checked ?? false;
  }
  set checked(next: boolean) {
    if (!this.#native) return;
    this.#native.checked = next;
    this.#sync();
  }
  get indeterminate(): boolean {
    return this.#native?.indeterminate ?? false;
  }
  set indeterminate(next: boolean) {
    if (!this.#native) return;
    this.#native.indeterminate = next;
    this.#sync();
  }
  get disabled(): boolean {
    return this.#native?.disabled ?? false;
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    this.#native = adoptedControl<HTMLInputElement>(this, 'input[type="checkbox"]');
    if (!this.#native) return;
    this.#wired = true;
    // `change` covers user toggles; `input` lets a host that mutates the control
    // programmatically (e.g. a "select all" driving row boxes) signal the change
    // with `dispatchEvent(new Event("input"))` — the property setters fire no
    // event, and `indeterminate` has none at all.
    this.#native.addEventListener("change", this.#sync);
    this.#native.addEventListener("input", this.#sync);
    this.#sync();
  }

  /** Mirror the native control's state onto the CSS state hooks. */
  #sync = () => {
    if (!this.#native) return;
    this.setAttribute(
      "data-state",
      this.#native.indeterminate ? "indeterminate" : this.#native.checked ? "checked" : "unchecked",
    );
    this.toggleAttribute("data-disabled", this.#native.disabled);
  };
}

export class UICheckboxGroup extends HTMLElement {
  #wired = false;
  #master: UICheckbox | null = null;

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
    this.#master = this.querySelector<UICheckbox>("ui-checkbox[data-checkbox-all]");
    this.addEventListener("change", this.#onChange);
    this.#syncMaster();
  }

  /** Child checkboxes (everything except the "select all" master). */
  #items(): UICheckbox[] {
    return [...this.querySelectorAll<UICheckbox>("ui-checkbox")].filter((c) => c !== this.#master);
  }

  #onChange = (e: Event) => {
    // A native checkbox's `change` fires on the inner `<input>`; resolve it to the
    // enclosing `<ui-checkbox>` host before comparing against the master.
    const host = (e.target as Element).closest?.("ui-checkbox") as UICheckbox | null;
    if (this.#master && host === this.#master) {
      // Master toggled → drive every enabled child to the master's new state.
      const next = this.#master.checked;
      for (const child of this.#items()) {
        if (child.disabled) continue;
        child.indeterminate = false;
        child.checked = next;
      }
    } else {
      this.#syncMaster();
    }
  };

  /** Derive the master's checked/indeterminate from the children. */
  #syncMaster() {
    if (!this.#master) return;
    const items = this.#items().filter((c) => !c.disabled);
    const checked = items.filter((c) => c.checked).length;
    if (checked === 0) {
      this.#master.indeterminate = false;
      this.#master.checked = false;
    } else if (checked === items.length) {
      this.#master.indeterminate = false;
      this.#master.checked = true;
    } else {
      // Partial selection. Normalize `checked` to false as well as setting
      // `indeterminate` so that clicking the master always resolves the same way
      // — a native indeterminate checkbox toggles from its underlying `checked`,
      // so a stale `checked=true` would make the click *clear* the selection
      // instead of selecting all.
      this.#master.checked = false;
      this.#master.indeterminate = true;
    }
  }
}

if (!customElements.get("ui-checkbox")) customElements.define("ui-checkbox", UICheckbox);
if (!customElements.get("ui-checkbox-group"))
  customElements.define("ui-checkbox-group", UICheckboxGroup);

declare global {
  interface HTMLElementTagNameMap {
    "ui-checkbox": UICheckbox;
    "ui-checkbox-group": UICheckboxGroup;
  }
}
