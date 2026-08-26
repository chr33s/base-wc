/**
 * `ui-switch` — an on/off toggle (Base UI's Switch).
 *
 * A **pure enhancer of a native checkbox**: author `<ui-switch><input
 * type="checkbox" name="notify" /></ui-switch>` and it works with no JavaScript
 * (the checkbox toggles and submits on its own). On upgrade the component
 * adopts that input — while the **browser owns focus, keyboard, and
 * submission**. The adoption, getters, `input`/`change` re-sync, and
 * `data-state` / `data-disabled` mirroring live in the shared
 * {@link NativeCheckboxElement} base (a switch is `ui-checkbox` + switch
 * semantics); this class only announces `role="switch"` and mirrors
 * `aria-checked`.
 *
 * Renders in **light DOM** (no shadow root, so no `::part`). Overlay the input on
 * the visual switch and style a thumb off the state hooks — with or without JS —
 * e.g. `ui-switch:has(input:checked) .thumb`, `ui-switch[data-state="checked"]
 * .thumb`.
 */
import { define } from "./define.ts";
import { NativeCheckboxElement } from "./form-control.ts";

export class UISwitch extends NativeCheckboxElement {
  protected override adopt(input: HTMLInputElement) {
    input.setAttribute("role", "switch");
  }

  protected override reflect(input: HTMLInputElement) {
    // The native `role=switch` needs `aria-checked` to convey on/off to AT;
    // keep it in step with the checkbox's checked state.
    input.setAttribute("aria-checked", String(input.checked));
  }
}

define("ui-switch", UISwitch);

declare global {
  interface HTMLElementTagNameMap {
    "ui-switch": UISwitch;
  }
}
