/**
 * `ui-checkbox` / `ui-checkbox-group` — checkboxes (Base UI's Checkbox + Checkbox
 * Group).
 *
 * `ui-checkbox` is a **pure enhancer of a native checkbox**: author
 * `<ui-checkbox><input type="checkbox" name="tos" /></ui-checkbox>` and it works
 * with no JavaScript (the checkbox toggles and submits on its own). On upgrade
 * the component adopts that input and mirrors its checked / indeterminate /
 * disabled state onto the `data-state` / `data-disabled` hooks, while the
 * **browser owns focus, keyboard, and submission**. The adoption, getters and
 * mirroring live in the shared {@link NativeCheckboxElement} base (`ui-switch`
 * is the same enhancer with switch semantics); this class only adds
 * `indeterminate`.
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
import { define } from "./define.ts";
import { NativeCheckboxElement } from "./form-control.ts";
import { LightDomElement } from "./lifecycle.ts";

export class UICheckbox extends NativeCheckboxElement {
  get indeterminate() {
    return this.input?.indeterminate ?? false;
  }
  set indeterminate(next: boolean) {
    if (!this.input) return;
    this.input.indeterminate = next;
    this.sync();
  }

  protected override stateOf(input: HTMLInputElement) {
    return input.indeterminate ? "indeterminate" : input.checked ? "checked" : "unchecked";
  }
}

export class UICheckboxGroup extends LightDomElement {
  #master: UICheckbox | null = null;

  protected override initialize() {
    this.setAttribute("role", "group");
    this.#master = this.querySelector<UICheckbox>("ui-checkbox[data-checkbox-all]");
    this.addEventListener("change", this.#onChange);
    this.#syncMaster();
    return true;
  }

  /** Child checkboxes (everything except the "select all" master). */
  #items() {
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

define("ui-checkbox", UICheckbox);
define("ui-checkbox-group", UICheckboxGroup);

declare global {
  interface HTMLElementTagNameMap {
    "ui-checkbox": UICheckbox;
    "ui-checkbox-group": UICheckboxGroup;
  }
}
