/**
 * `ui-select` — a trigger + listbox popup single-select (Base UI's Select). When
 * open, focus sits on the `role="listbox"` popup and a virtual "active" option
 * moves with the arrow keys / typeahead (`aria-activedescendant`), with `Enter`
 * committing it. The popup reuses the shared {@link overlay} (trigger ARIA, CSS
 * anchor pairing, {@link anchor} positioning, the Popover-API top layer,
 * {@link onOutsidePress} light-dismiss) and the shared {@link listNav} keyboard
 * + typeahead engine (clamp policy — a select does not wrap past its ends). The
 * `multiple` attribute makes it a multi-select listbox (`aria-multiselectable`):
 * options toggle without closing and `value` is a `string[]`. `orientation`
 * picks the arrow axis, `readonly` locks the value while leaving the popup
 * operable, and a press on the trigger can be dragged straight onto an option
 * and released to choose it.
 *
 * **Default (native-first).** Author a native `<select>` inside the element —
 * `<ui-select name="fruit"><select>…<option>…</select></ui-select>` (`multiple`
 * and `<optgroup>` supported) — and it works with no JavaScript: the native menu
 * opens and submits on its own. On upgrade the component
 * {@link adoptedControl | adopts} it — generates the trigger + listbox from the
 * `<option>`/`<optgroup>` markup, seeds the selection from the native value, and
 * {@link retireNative | retires} the `<select>` as the hidden submitting form
 * value (no `ElementInternals` in this mode). The native value is the source of
 * truth, so a later submit carries the enhanced choice.
 *
 * **Fallback (JS-only, richer).** Author the chrome directly — a
 * `[data-select-trigger]` (with an optional `[data-select-value]` label slot), a
 * `<ui-select-popup>`, and `<ui-select-option value>` children (optionally in
 * `<ui-select-group>` blocks labelled by a `<ui-select-group-label>`). The value
 * submits via {@link ElementInternals}. Prefer this only when options need rich
 * content a native `<option>` can't hold (icons, two-line rows) — it submits
 * nothing with scripting off. The selected option carries `data-selected` for an
 * item-indicator (check-mark) style hook.
 */
import { define } from "./define.ts";
import { isRTL } from "./direction.ts";
import { UIPopupElement } from "./popup.ts";
import { FormAssociatedElement, type FormControlOptions } from "./form-control.ts";
import { labelFrom, nextId } from "./id.ts";
import { listNav, type ListNav } from "./list-nav.ts";
import { clamp } from "./math.ts";
import type { ChangeReason } from "./reasons.ts";
import type { Orientation } from "./roving.ts";
import { localeOf } from "./text.ts";
import { adoptedControl, fireNativeChange, retireNative } from "./native.ts";
import { type Overlay, overlay } from "./overlay.ts";

/** Detail of the `change` event dispatched when the selection changes. */
export interface SelectChangeDetail {
  /** The option that was just toggled/chosen. */
  readonly value: string;
  readonly label: string;
  /** All currently-selected values, in option order (single → `[value]`). */
  readonly values: string[];
  /** What caused the change — a press on an option, or Enter on one. */
  readonly reason: ChangeReason;
}

export class UISelect extends FormAssociatedElement {
  protected override formControlOptions(): FormControlOptions {
    return {
      adopted: () => this.#native != null,
      value: () => this.#selectedInOrder()[0] ?? null, // any selection satisfies `required`
      onReset: () => this.#onFormReset(),
    };
  }
  protected override onFormDisabled(disabled: boolean) {
    this.toggleAttribute("data-disabled", disabled);
  }
  static observedAttributes = ["readonly"];
  attributeChangedCallback() {
    this.#syncReadOnly();
  }
  #uid = nextId("select");
  #trigger: HTMLElement | null = null;
  #valueEl: HTMLElement | null = null;
  #popup: HTMLElement | null = null;
  /** An adopted native `<select>` (progressive-enhancement mode), else `null`. */
  #native: HTMLSelectElement | null = null;
  #activeIndex = -1;
  #selected = new Set<string>();
  #placeholder = "";
  #overlay: Overlay | null = null;
  /** Whether the currently-open popup was opened by a press, not a click. */
  #openedOnPress = false;
  #nav: ListNav = listNav({
    count: () => this.#options().length,
    activeIndex: () => this.#activeIndex,
    onActive: (i) => this.#setActive(i),
    loop: false, // POLICY: a select clamps at its ends (no wrap)
    onCommit: (i) => this.#activate(i),
    onCancel: () => this.#close({ reason: "escape-key" }),
    onTab: () => this.#close({ restoreFocus: false, reason: "focus-out" }),
    orientation: () => this.orientation,
    rtl: () => isRTL(this),
    label: (i) => {
      const option = this.#options()[i];
      return option ? this.#labelOf(option) : "";
    },
    locale: () => localeOf(this),
  });

  /** Multi-select mode — options toggle without closing; `value` is an array. */
  get multiple() {
    return this.hasAttribute("multiple");
  }
  /**
   * Locks the *value*, not the interaction. Per WAI-ARIA an `aria-readonly`
   * widget is "not editable, but is otherwise operable", so the popup still
   * opens, highlights and typeahead still work, and only committing a choice is
   * refused — an author who wants the control inert wants `disabled`.
   */
  get readOnly() {
    return this.hasAttribute("readonly");
  }
  /**
   * The axis the arrow keys walk. `vertical` is the ARIA default for a listbox,
   * so only the horizontal case is announced — on the popup, which owns the
   * `listbox` role, rather than on this wrapper.
   */
  get orientation(): Orientation {
    return this.getAttribute("orientation") === "horizontal" ? "horizontal" : "vertical";
  }
  get value() {
    const vals = this.#selectedInOrder();
    return this.multiple ? vals : (vals[0] ?? null);
  }
  set value(next: string | string[] | null) {
    // Wire synchronously if the value is set in the same task as connection so
    // the trigger label reflects it (the imperative entry-point guard).
    if (!this.wired) this.wire();
    const arr = next == null ? [] : Array.isArray(next) ? next : [next];
    this.#applySelection(new Set(this.multiple ? arr : arr.slice(0, 1)));
  }

  protected override wire() {
    this.#adoptNative();
    this.#trigger = this.querySelector<HTMLElement>("[data-select-trigger]");
    this.#valueEl = this.querySelector<HTMLElement>("[data-select-value]");
    this.#popup = this.querySelector<HTMLElement>("ui-select-popup");
    if (!this.#trigger || !this.#popup) return;
    this.wired = true;

    this.#popup.setAttribute("role", "listbox");
    if (this.multiple) this.#popup.setAttribute("aria-multiselectable", "true");
    if (this.orientation === "horizontal") {
      this.#popup.setAttribute("aria-orientation", "horizontal");
    }
    this.#popup.tabIndex = -1;
    this.#syncReadOnly();
    this.#placeholder = this.#valueEl?.textContent?.trim() ?? "";
    this.#trigger.addEventListener("click", this.#onTriggerClick);
    this.#trigger.addEventListener("pointerdown", this.#onTriggerPointerDown);
    this.#trigger.addEventListener("keydown", this.#onTriggerKeydown);
    this.#popup.addEventListener("keydown", this.#onPopupKeydown);
    this.#popup.addEventListener("click", this.#onOptionClick);
    this.#popup.addEventListener("pointerover", this.#onOptionPointerOver);

    this.#allOptions().forEach((o, i) => {
      o.setAttribute("role", "option");
      o.id = `${this.#uid}-opt-${i}`;
      o.setAttribute("aria-selected", "false");
    });

    // Label each option group from its <ui-select-group-label>.
    for (const group of this.querySelectorAll("ui-select-group")) {
      labelFrom(
        group,
        "aria-labelledby",
        group.querySelector("ui-select-group-label"),
        "ui-select-group-label",
      );
    }

    this.#overlay = overlay(this.#popup, {
      anchor: { ref: () => this.#trigger, options: { offset: 6, padding: 8 }, pair: "select" },
      dismiss: {
        within: () => [this.#popup, this.#trigger],
        onDismiss: () => this.#close({ restoreFocus: false, reason: "outside-press" }),
      },
      trigger: { element: this.#trigger, haspopup: "listbox", controls: "ui-select-popup" },
      events: this,
    });

    const preselected = this.#allOptions()
      .filter((o) => o.hasAttribute("selected"))
      .map((o) => this.#valueOf(o));
    if (preselected.length) {
      this.#applySelection(new Set(this.multiple ? preselected : preselected.slice(0, 1)));
    }
  }

  disconnectedCallback() {
    this.#close({ restoreFocus: false });
  }

  /**
   * Progressive enhancement: if a native `<select>` was authored (and the
   * trigger+listbox were not), generate that chrome from its `<option>` /
   * `<optgroup>` markup, seed the selection from the native value, and retire the
   * native control to a hidden-but-submitting fallback. The native `<select>`
   * then owns the form value for the rest of this element's life.
   */
  #adoptNative() {
    const select = adoptedControl<HTMLSelectElement>(this, "select");
    if (!select || this.querySelector("[data-select-trigger]")) return;
    this.#native = select;
    if (select.multiple) this.setAttribute("multiple", "");

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.setAttribute("data-select-trigger", "");
    const valueEl = document.createElement("span");
    valueEl.setAttribute("data-select-value", "");
    valueEl.textContent = this.getAttribute("data-placeholder") ?? "";
    trigger.append(valueEl);

    // Carry the native <select>'s accessible name onto the generated trigger,
    // which would otherwise be an unnamed button.
    const ariaLabel = select.getAttribute("aria-label");
    if (ariaLabel) trigger.setAttribute("aria-label", ariaLabel);
    const labelledBy = select.getAttribute("aria-labelledby");
    if (labelledBy) trigger.setAttribute("aria-labelledby", labelledBy);
    // A wrapping <label> implicitly targets the now-retired (hidden) <select>;
    // point it at the trigger so clicking the label opens — and names — the
    // enhanced control.
    const label = this.closest("label");
    if (label && !label.htmlFor) {
      if (!trigger.id) trigger.id = nextId("ui-select-trigger");
      label.htmlFor = trigger.id;
    }

    // Trigger + popup after the native select; then retire it (hidden, out of the
    // a11y tree + tab order, still submitting).
    this.append(trigger, this.#buildPopup(select));
    retireNative(select);
  }

  /** Mirror a native `<select>`'s option tree as `<ui-select-*>` markup. */
  #buildPopup(select: HTMLSelectElement) {
    const popup = document.createElement("ui-select-popup");
    for (const child of Array.from(select.children)) {
      if (child instanceof HTMLOptionElement) {
        popup.append(this.#buildOption(child));
      } else if (child instanceof HTMLOptGroupElement) {
        popup.append(this.#buildGroup(child));
      }
    }
    return popup;
  }

  #buildGroup(optgroup: HTMLOptGroupElement) {
    const group = document.createElement("ui-select-group");
    const label = document.createElement("ui-select-group-label");
    label.textContent = optgroup.label;
    group.append(label);
    for (const opt of Array.from(optgroup.children)) {
      if (opt instanceof HTMLOptionElement) group.append(this.#buildOption(opt));
    }
    return group;
  }

  #buildOption(opt: HTMLOptionElement) {
    const el = document.createElement("ui-select-option");
    el.setAttribute("value", opt.value);
    if (opt.disabled) el.setAttribute("disabled", "");
    // Seed from the native's current selection so the enhanced widget shows —
    // and submits — exactly what the native `<select>` would with no JS.
    if (opt.selected) el.setAttribute("selected", "");
    el.textContent = opt.textContent?.trim() ?? "";
    return el;
  }

  /** Reflect the current selection onto the adopted native `<select>`. */
  #writeNativeState() {
    if (!this.#native) return;
    for (const opt of this.#native.options) opt.selected = this.#selected.has(opt.value);
  }

  /** Mirror `readonly` onto the host, the trigger and the listbox. */
  #syncReadOnly() {
    const readOnly = this.readOnly;
    this.toggleAttribute("data-readonly", readOnly);
    for (const el of [this.#trigger, this.#popup]) {
      if (!el) continue;
      el.toggleAttribute("data-readonly", readOnly);
      if (readOnly) el.setAttribute("aria-readonly", "true");
      else el.removeAttribute("aria-readonly");
    }
  }

  #allOptions() {
    return [...this.querySelectorAll<HTMLElement>("ui-select-option")];
  }
  #options() {
    return this.#allOptions().filter((o) => !o.hasAttribute("disabled"));
  }

  #labelOf(option: HTMLElement) {
    return option.textContent?.trim() ?? "";
  }
  #valueOf(option: HTMLElement) {
    return option.getAttribute("value") ?? this.#labelOf(option);
  }
  /** Selected values in DOM order. */
  #selectedInOrder() {
    return this.#allOptions()
      .map((o) => this.#valueOf(o))
      .filter((v) => this.#selected.has(v));
  }

  #open(reason: ChangeReason = "none") {
    if (!this.#overlay?.show(reason)) return;
    this.#popup?.focus();
    const options = this.#options();
    const current = options.findIndex((o) => this.#selected.has(this.#valueOf(o)));
    this.#setActive(current >= 0 ? current : 0);
  }

  #close({
    restoreFocus = true,
    reason = "none",
  }: { restoreFocus?: boolean; reason?: ChangeReason } = {}) {
    if (!this.#overlay?.open) return;
    // The gesture that opened it is over, whatever ended it.
    this.#openedOnPress = false;
    this.#activeIndex = -1;
    this.#popup?.removeAttribute("aria-activedescendant");
    this.#allOptions().forEach((o) => o.removeAttribute("data-highlighted"));
    this.#overlay.hide({ reason });
    if (restoreFocus) this.#trigger?.focus();
  }

  #setActive(index: number) {
    const options = this.#options();
    if (options.length === 0) return;
    const i = clamp(index, 0, options.length - 1);
    this.#activeIndex = i;
    this.#allOptions().forEach((o) => o.removeAttribute("data-highlighted"));
    const active = options[i];
    active.setAttribute("data-highlighted", "");
    // Keep the highlighted option visible in a scrollable popup (guarded —
    // scrollIntoView is absent under happy-dom).
    active.scrollIntoView?.({ block: "nearest" });
    this.#popup?.setAttribute("aria-activedescendant", active.id);
  }

  /** Reflect the given selection onto the options, form value and trigger. */
  #applySelection(next: Set<string>) {
    this.#selected = next;
    this.#allOptions().forEach((o) => {
      const sel = next.has(this.#valueOf(o));
      o.setAttribute("aria-selected", String(sel));
      o.toggleAttribute("data-selected", sel); // item-indicator hook
    });
    this.#writeNativeState();
    this.#syncFormValue();
    if (this.#valueEl) {
      const labels = this.#allOptions()
        .filter((o) => this.#selected.has(this.#valueOf(o)))
        .map((o) => this.#labelOf(o));
      this.#valueEl.textContent = labels.length ? labels.join(", ") : this.#placeholder;
    }
  }

  #syncFormValue() {
    // In native-adoption mode the retired `<select>` is the form value — the
    // controller's `adopted` guard keeps `setValue` inert there.
    const values = this.#selectedInOrder();
    const name = this.name;
    if (this.multiple && name) {
      const data = new FormData();
      for (const v of values) data.append(name, v);
      this.formControl.setValue(data);
    } else {
      this.formControl.setValue(values[0] ?? null);
    }
  }

  /** `form.reset()`: restore the markup's `selected` options (native mode: the
   * browser restores the retired `<select>`'s defaults; re-seed from it). */
  #onFormReset() {
    if (!this.wired) return;
    if (this.#native) {
      queueMicrotask(() => {
        const native = this.#native;
        if (!native) return;
        const values = [...native.selectedOptions].map((o) => o.value);
        this.#applySelection(new Set(this.multiple ? values : values.slice(0, 1)));
      });
      return;
    }
    const preselected = this.#allOptions()
      .filter((o) => o.hasAttribute("selected"))
      .map((o) => this.#valueOf(o));
    this.#applySelection(new Set(this.multiple ? preselected : preselected.slice(0, 1)));
  }

  /** Choose the option at `index` (into the enabled list). In `multiple` mode
   * this toggles membership and stays open; otherwise it replaces + closes. */
  #activate(index: number) {
    const option = this.#options()[index];
    // `readonly` locks the value: opening, highlighting and typeahead all still
    // work, and committing is where it stops.
    if (!option || this.readOnly) return;
    const v = this.#valueOf(option);
    if (this.multiple) {
      const next = new Set(this.#selected);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      this.#applySelection(next);
    } else {
      this.#applySelection(new Set([v]));
      this.#close({ reason: "item-press" });
    }
    // Mirror a real <select>: a user selection fires `input` *and* `change` on
    // the native control (programmatic `.value =` fires neither — see the value
    // setter), so listeners bound to the adopted <select> are notified.
    if (this.#native) fireNativeChange(this.#native);
    this.dispatchEvent(
      new CustomEvent<SelectChangeDetail>("change", {
        bubbles: true,
        detail: {
          value: v,
          label: this.#labelOf(option),
          values: this.#selectedInOrder(),
          reason: "item-press",
        },
      }),
    );
  }

  /**
   * Press-drag-release selection: pressing the trigger opens immediately so the
   * *same* gesture can continue onto an option and release to choose it — the
   * one-handed interaction a native `<select>` has always had. Opening on the
   * press (rather than the click) is what makes it possible, since a click only
   * lands after the release the user is already choosing with.
   */
  #onTriggerPointerDown = (e: PointerEvent) => {
    if (this.formDisabled) return;
    if (e.button !== 0 || this.#overlay?.open) return;
    this.#openedOnPress = true;
    this.#open("trigger-press");
    // Bound on the window: the release routinely lands outside the trigger —
    // that is the entire point of a drag — and often outside the popup too.
    const finish = (up: PointerEvent) => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      this.#endPressDrag(up);
    };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  /** Resolve a press-drag: commit what it landed on, or take back the open. */
  #endPressDrag(e: PointerEvent) {
    const target = e.target as Element | null;
    const option = target?.closest?.("ui-select-option") as HTMLElement | null;
    if (option && this.#popup?.contains(option)) {
      const index = this.#options().indexOf(option);
      if (index >= 0) this.#activate(index);
      return;
    }
    // Released back on the trigger: an ordinary press-and-release, so the popup
    // stays open for a second, separate press to choose from.
    if (target && this.#trigger?.contains(target)) return;
    // Released anywhere else — the user changed their mind mid-gesture, so the
    // open is taken back rather than left hanging.
    this.#close({ reason: "cancel-open" });
  }

  #onTriggerClick = () => {
    if (this.formDisabled) return;
    // The press already opened it; the click that completes the same gesture
    // must not immediately toggle it shut again.
    if (this.#openedOnPress) {
      this.#openedOnPress = false;
      return;
    }
    if (this.#overlay?.open) this.#close({ reason: "trigger-press" });
    else this.#open("trigger-press");
  };

  #onTriggerKeydown = (e: KeyboardEvent) => {
    if (this.formDisabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      this.#open("list-navigation");
    }
  };

  #onPopupKeydown = (e: KeyboardEvent) => {
    this.#nav.handle(e);
  };

  /** While a press-drag runs, the option under the pointer becomes the active one. */
  #onOptionPointerOver = (e: PointerEvent) => {
    if (!this.#openedOnPress) return;
    const option = (e.target as Element).closest("ui-select-option") as HTMLElement | null;
    if (!option || option.hasAttribute("disabled")) return;
    const index = this.#options().indexOf(option);
    if (index >= 0) this.#setActive(index);
  };

  #onOptionClick = (e: MouseEvent) => {
    const option = (e.target as Element).closest("ui-select-option") as HTMLElement | null;
    if (!option || option.hasAttribute("disabled")) return;
    const index = this.#options().indexOf(option);
    if (index >= 0) this.#activate(index);
  };
}

export class UISelectPopup extends UIPopupElement {
  // Claimed here as well as in the root's wiring: a popup is unconditionally a
  // listbox, and announcing it before the children connect lets them see the
  // role-constrained context they sit in (`ui-separator` demotes itself inside
  // one) without waiting for the root's deferred wiring pass.
  static override role = "listbox";
}
export class UISelectOption extends HTMLElement {
  connectedCallback() {
    this.setAttribute("role", "option");
  }
}

/** A labelled group of options (`role=group`); label wired by the root. */
export class UISelectGroup extends HTMLElement {
  connectedCallback() {
    this.setAttribute("role", "group");
  }
}

/**
 * The label for a `<ui-select-group>`. Hidden from the accessibility tree
 * rather than merely `role="presentation"`: the group already announces this
 * text through its `aria-labelledby`, so an exposed node would make a screen
 * reader read the heading twice — once as the group's name and again as a
 * sibling of the options. `aria-hidden` does not affect a name computed via
 * `aria-labelledby`, so the group keeps its label.
 */
export class UISelectGroupLabel extends HTMLElement {
  connectedCallback() {
    this.setAttribute("aria-hidden", "true");
  }
}

define("ui-select", UISelect);
define("ui-select-popup", UISelectPopup);
define("ui-select-option", UISelectOption);
define("ui-select-group", UISelectGroup);
define("ui-select-group-label", UISelectGroupLabel);

declare global {
  interface HTMLElementTagNameMap {
    "ui-select": UISelect;
    "ui-select-popup": UISelectPopup;
    "ui-select-option": UISelectOption;
    "ui-select-group": UISelectGroup;
    "ui-select-group-label": UISelectGroupLabel;
  }
}
