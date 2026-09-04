/**
 * Progressive-enhancement adoption of an **authored native control**.
 *
 * The library's leaf controls are form-associated via {@link ElementInternals},
 * which needs JavaScript — so with scripting off they submit nothing and render
 * no working control. To stay usable in a server-rendered, no-JS-first context
 * (e.g. the admin), a consumer may instead author a **real native element**
 * inside the custom element:
 *
 * ```html
 * <ui-switch><input type="checkbox" name="notify" /></ui-switch>
 * <ui-select name="fruit"><select><option value="a">A</option></select></ui-select>
 * ```
 *
 * With no JS that native control is fully functional and submits on its own. On
 * upgrade the component **adopts** it: the native element becomes the single
 * source of truth for the form value (so `ElementInternals` is not used in this
 * mode — no double submission), and the component either styles it in place
 * (checkbox, range, number: the native stays the interactive control) or
 * {@link retireNative | retires} it behind an enhanced widget it drives.
 *
 * The convention is opt-in: {@link adoptedControl} returns `null` when no native
 * control was authored, and the component falls back to its standalone behavior.
 *
 * ### FOUC / the `:defined` seam
 *
 * Before the element upgrades, only the native control exists, so it shows and
 * works. A component that *generates* its enhanced chrome does so only after
 * upgrade, so there is never a flash of two controls. Consumers styling a
 * retired native can also key off `:defined`, e.g.
 * `ui-select:not(:defined) > select { … }`.
 */
import { scopedFirst } from "./query.ts";

/**
 * The authored native control this element should adopt as its value source, or
 * `null` when none was authored (standalone / `ElementInternals` mode). A match
 * counts at **any depth** (so the control can sit inside wrapper markup) as
 * long as it is not owned by a nested same-tag instance — i.e. its nearest
 * `host.localName` ancestor is `host` itself — so a component nested inside
 * another's markup never adopts the wrong control.
 */
export function adoptedControl<T extends Element = HTMLElement>(host: Element, selector: string) {
  return scopedFirst<T>(host, selector);
}

/**
 * Retire a fully-replaced native control: it stays in the DOM as the submitting
 * form value + no-JS fallback, but is removed from the accessibility tree and
 * tab order now that the enhanced widget owns interaction. `hidden` keeps it out
 * of layout and the a11y tree while still submitting — unlike `disabled`, which
 * would drop it from submission entirely.
 */
export function retireNative(el: HTMLElement) {
  el.hidden = true;
  el.tabIndex = -1;
  el.setAttribute("aria-hidden", "true");
  el.setAttribute("data-ui-adopted", "");
}

/**
 * After programmatically changing a native control's value, fire the events a
 * form (and any listeners / constraint validation) expect from user input, so
 * the enhanced widget and the native control stay indistinguishable to hosts.
 */
export function fireNativeChange(el: HTMLElement) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * One-way managed `disabled` for an adopted native control.
 *
 * A host's `disabled` attribute (or a form-driven disable) must disable the
 * inner control — but removing it may only re-enable a control **we** disabled.
 * An input the author disabled directly is left alone, the same ownership rule
 * `ui-fieldset` applies when it propagates. That needs a bit of state (did we
 * disable it?), and `ui-autocomplete`, `ui-combobox` and `ui-number-field` each
 * carried an identical `#managedDisabled` flag and branch for it.
 *
 * Returns the setter; the flag lives in the closure, so the component keeps no
 * field of its own. Create it once the control is adopted, in `wire`.
 */
export function managedDisabled(control: HTMLInputElement) {
  let managed = false;
  return (disabled: boolean) => {
    if (disabled) {
      if (!control.disabled) {
        control.disabled = true;
        managed = true;
      }
    } else if (managed) {
      control.disabled = false;
      managed = false;
    }
  };
}
