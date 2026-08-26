/**
 * `ui-menu` — a light-DOM menu (Base UI's Menu, ported to web components).
 *
 * Three custom elements cooperate:
 *
 * - `<ui-menu>`     — root; owns focus policy, selection and submenu logic.
 * - `<ui-menu-popup>` — `role=menu`, lifted into the top layer via the Popover
 *   API so it escapes `overflow`/stacking-context clipping for free.
 * - `<ui-menu-item>`  — `role=menuitem`; registers with its root and reports
 *   selection.
 *
 * Coordination uses **bubbling registration events** (the context-request
 * shape) rather than React-style context, and the DOM is the source of truth
 * for item order — which sidesteps the "child upgraded before parent" race.
 * The popup lifecycle, trigger ARIA, CSS anchor pairing, positioning and
 * light-dismiss are the shared {@link overlay}; keyboard navigation and
 * typeahead are the shared {@link listNav} engine (wrap policy — menus loop
 * past the ends).
 *
 * The root exposes `show()` / `hide()` / `openAt(x, y)` / `focusFirst()` and
 * `open`/`close` events so composites (`ui-menubar`, `ui-context-menu`) can
 * drive it, and a `submenu` attribute switches it to a nested side-anchored menu
 * that opens on hover / `ArrowRight` — the building block for `ui-submenu`.
 */
import { rectAt, type VirtualElement } from "./anchor.ts";
import { define } from "./define.ts";
import { isRTL } from "./direction.ts";
import { labelFrom, nextId } from "./id.ts";
import { hoverIntent, type HoverIntent } from "./intent.ts";
import { connectLightDom } from "./lifecycle.ts";
import { listNav, type ListNav } from "./list-nav.ts";
import { type Overlay, overlay } from "./overlay.ts";

/** Detail of the `menu-select` event a `<ui-menu>` dispatches on activation. */
export interface MenuSelectDetail {
  readonly value: string;
  readonly item: UIMenuItem;
}

/** Internal select event a menu item dispatches; `close:false` keeps the menu
 * open (checkbox / radio items toggle in place). */
interface ItemSelectDetail {
  readonly value: string;
  readonly close?: boolean;
}

const SELECT = "ui:menu-item-select";

// Every navigable item variant — plain, link, checkbox and radio items all
// roam, typeahead and highlight together.
const ITEM_SELECTOR = "ui-menu-item, ui-menu-checkbox-item, ui-menu-radio-item";

/** Root — owns focus policy, wires the trigger, coordinates items. */
export class UIMenu extends HTMLElement {
  #trigger: HTMLElement | null = null;
  #popup: HTMLElement | null = null;
  #activeIndex = -1;
  #overlay: Overlay | null = null;
  #pointRef: VirtualElement | null = null;
  #wired = false;
  // Submenu grace closing: a delay on pointerleave approximates diagonal
  // travel from the trigger into the submenu popup.
  #graceClose: HoverIntent = hoverIntent({
    isOpen: () => this.open,
    open: () => {},
    close: () => this.#close({ restoreFocus: false }),
    openDelay: () => 0,
    closeDelay: () => 200,
  });
  #nav: ListNav = listNav({
    count: () => this.#items().length,
    activeIndex: () => this.#activeIndex,
    onActive: (i) => this.#setActive(i),
    loop: true, // POLICY: menus wrap past the ends
    onCommit: (i) => this.#items()[i]?.click(), // item dispatches the select
    onCancel: () => this.#close(),
    onTab: () => this.#close({ restoreFocus: false }),
    label: (i) => this.#items()[i]?.textContent ?? "",
  });

  /** Whether the popup is currently shown. */
  get open() {
    return this.#overlay?.open ?? false;
  }
  get #isSubmenu() {
    return this.hasAttribute("submenu");
  }

  connectedCallback() {
    // Defer wiring to a microtask so the light-DOM children (trigger, popup,
    // items) have finished parsing/upgrading — a custom element's
    // `connectedCallback` can run before its children are inserted.
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    this.#trigger = this.querySelector<HTMLElement>("[data-menu-trigger]");
    this.#popup = this.querySelector<HTMLElement>("ui-menu-popup");
    if (!this.#popup) return;
    this.#wired = true;

    if (this.#trigger) {
      if (this.#isSubmenu) {
        this.#trigger.addEventListener("click", this.#onSubmenuTriggerClick);
        this.#trigger.addEventListener("keydown", this.#onSubmenuTriggerKeydown);
        this.#trigger.addEventListener("pointerenter", this.#onSubmenuEnter);
        this.addEventListener("pointerenter", () => this.#graceClose.cancelClose());
        this.addEventListener("pointerleave", () => this.#graceClose.scheduleClose());
      } else {
        this.#trigger.addEventListener("click", this.#onTriggerClick);
        this.#trigger.addEventListener("keydown", this.#onTriggerKeydown);
      }
    }
    this.#popup.addEventListener("keydown", this.#onPopupKeydown);
    this.#popup.addEventListener("pointermove", this.#onPointerMove, true);

    this.addEventListener(SELECT, this.#onItemSelect as EventListener);

    // Assign stable ids to this popup's own items (present at wire time).
    this.#allItems().forEach((el) => {
      if (!el.id) el.id = nextId("ui-menu-item");
    });

    this.#overlay = overlay(this.#popup, {
      // Point-anchored (context menu) and side-anchored (submenu) opens
      // position via JS unconditionally; a regular menu uses the CSS
      // anchor-name pairing when supported, else the JS fallback. Submenus
      // always position via JS (to the side), so they skip the CSS
      // (bottom-placement) pairing.
      anchor: {
        ref: () => this.#pointRef ?? this.#trigger,
        always: () => this.#pointRef != null || this.#isSubmenu,
        options: () => {
          if (this.#pointRef) return { offset: 0, padding: 8 };
          if (this.#isSubmenu)
            return {
              offset: 4,
              padding: 8,
              placement: isRTL(this) ? "left" : "right",
              constrainHeight: false,
            };
          return { offset: 6, padding: 8 };
        },
        pair: "menu",
      },
      dismiss: {
        within: () => [this.#popup, this.#trigger],
        onDismiss: () => this.#close({ restoreFocus: false }),
      },
      trigger: { element: this.#trigger, haspopup: "menu", controls: "ui-menu-popup" },
      events: this,
    });
  }

  disconnectedCallback() {
    this.#graceClose.cancel();
    this.#close({ restoreFocus: false });
  }

  // ---- public API (for ui-menubar / ui-context-menu) -------------------
  /** Open the popup (no focus move). */
  show() {
    // Wire synchronously if called in the same task as connection, before the
    // deferred wiring microtask has run — otherwise the open silently no-ops.
    if (!this.#wired) this.#wire();
    this.#open();
  }
  /** Close the popup without restoring focus (the caller owns focus). */
  hide() {
    this.#close({ restoreFocus: false });
  }
  /** Open at a viewport point (context menu) and focus the first item. */
  openAt(x: number, y: number) {
    if (!this.#wired) this.#wire();
    this.#pointRef = { getBoundingClientRect: () => rectAt(x, y) };
    this.#open();
    this.focusFirst();
  }
  focusFirst() {
    if (this.#items().length) this.#setActive(0);
  }
  focusLast() {
    const items = this.#items();
    if (items.length) this.#setActive(items.length - 1);
  }

  // ---- item bookkeeping (scoped to THIS popup, so submenus don't leak) --
  #allItems() {
    const popup = this.#popup;
    if (!popup) return [];
    return [...popup.querySelectorAll<UIMenuItem>(ITEM_SELECTOR)].filter(
      (el) => el.closest("ui-menu-popup") === popup,
    );
  }
  /** Navigable items in DOM order; disabled ones excluded. */
  #items() {
    return this.#allItems().filter((el) => !el.hasAttribute("disabled"));
  }

  #onItemSelect = (e: CustomEvent<ItemSelectDetail>) => {
    // Consume the internal event at the nearest root so a selection inside a
    // submenu isn't re-handled by every ancestor menu (which would fire
    // `menu-select` once per level and run competing focus restores).
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent<MenuSelectDetail>("menu-select", {
        bubbles: true,
        detail: { value: e.detail.value, item: e.target as UIMenuItem },
      }),
    );
    // Checkbox / radio items toggle in place (`close:false`); plain items close
    // the whole tree from the outermost root, so focus lands on the top-level
    // trigger and every descendant submenu closes with it.
    if (e.detail.close !== false) this.#outermostMenu().#close();
  };

  /** The top-level `<ui-menu>` root (self when not nested in another menu). */
  #outermostMenu() {
    let root = this.parentElement?.closest<UIMenu>("ui-menu");
    if (!root) return this;
    for (
      let parent = root.parentElement?.closest<UIMenu>("ui-menu");
      parent;
      parent = root.parentElement?.closest<UIMenu>("ui-menu")
    ) {
      root = parent;
    }
    return root;
  }

  #open() {
    // overlay() owns the top-layer show, trigger ARIA, positioning (per-open
    // placement), outside-press dismissal and the bubbling `open` event.
    this.#overlay?.show();
  }

  #openWithFocus(which: "first" | "last") {
    this.#open();
    if (which === "last") this.focusLast();
    else this.focusFirst();
  }

  #close({ restoreFocus = true }: { restoreFocus?: boolean } = {}) {
    if (!this.#overlay?.open) return;
    this.#activeIndex = -1;
    this.#clearActive();
    // Close any open descendant submenus with us.
    for (const sub of this.#popup?.querySelectorAll<UIMenu>("ui-menu[submenu]") ?? []) sub.hide();
    this.#overlay.hide();
    this.#pointRef = null;
    if (restoreFocus) this.#trigger?.focus();
  }

  // ---- trigger interaction --------------------------------------------
  #onTriggerClick = () => {
    if (this.open) this.#close();
    else this.#openWithFocus("first");
  };

  #onTriggerKeydown = (e: KeyboardEvent) => {
    // Enter/Space already fire a native click on <button>; add the arrows.
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.#openWithFocus("first");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.#openWithFocus("last");
    }
  };

  // ---- submenu trigger interaction ------------------------------------
  #onSubmenuTriggerClick = () => {
    if (this.open) this.#close();
    else {
      this.#open();
      this.focusFirst();
    }
  };
  #onSubmenuTriggerKeydown = (e: KeyboardEvent) => {
    // The submenu opens toward its side: ArrowRight in LTR, ArrowLeft in RTL.
    const openKey = isRTL(this) ? "ArrowLeft" : "ArrowRight";
    if (e.key === openKey || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      // Consume the open key so an enclosing composite (e.g. ui-menubar) doesn't
      // also act on it and move focus to the next top-level menu.
      e.stopPropagation();
      this.#open();
      this.focusFirst();
    }
  };
  #onSubmenuEnter = () => {
    this.#graceClose.cancelClose();
    this.#open();
  };

  #onPopupKeydown = (e: KeyboardEvent) => {
    // Ignore keydowns bubbling up from a nested submenu popup.
    if ((e.target as Element)?.closest?.("ui-menu-popup") !== this.#popup) return;
    if (this.#isSubmenu) {
      // Collapse the submenu toward its parent: ArrowLeft in LTR, ArrowRight
      // in RTL (the mirror of the open key).
      if (e.key === (isRTL(this) ? "ArrowRight" : "ArrowLeft")) {
        e.preventDefault();
        e.stopPropagation();
        this.#close();
        return;
      }
      // Escape closes only this level, not every ancestor menu.
      if (e.key === "Escape") e.stopPropagation();
    }
    this.#nav.handle(e);
  };

  #setActive(index: number) {
    const items = this.#items();
    this.#clearActive();
    this.#activeIndex = index;
    const item = items[index];
    if (!item) return;
    item.setAttribute("data-highlighted", "");
    item.tabIndex = 0; // roving tabindex
    item.focus();
  }

  #clearActive() {
    for (const i of this.#allItems()) {
      i.removeAttribute("data-highlighted");
      i.tabIndex = -1;
    }
  }

  #onPointerMove = (e: PointerEvent) => {
    const item = (e.target as Element).closest?.(ITEM_SELECTOR) as UIMenuItem | null;
    if (!item || item.hasAttribute("disabled")) return;
    const idx = this.#items().indexOf(item);
    if (idx !== -1 && idx !== this.#activeIndex) this.#setActive(idx);
  };
}

/** Popup — `role=menu`, lives in the top layer via the Popover API. */
export class UIMenuPopup extends HTMLElement {
  connectedCallback() {
    this.setAttribute("role", "menu");
    this.setAttribute("popover", "manual"); // top layer, we control dismissal
    this.tabIndex = -1;
  }
}

/** Item — `role=menuitem`; registers with its root, reports selection. */
export class UIMenuItem extends HTMLElement {
  connectedCallback() {
    this.setAttribute("role", this._role());
    this.tabIndex = -1;
    if (this.hasAttribute("disabled")) this.setAttribute("aria-disabled", "true");
    this.addEventListener("click", this.#onClick);
  }

  /** The item's ARIA role; overridden by checkbox / radio variants. */
  protected _role() {
    return "menuitem";
  }

  /** The value reported on selection. */
  protected _value() {
    return this.getAttribute("value") ?? this.textContent?.trim() ?? "";
  }

  /**
   * Perform the item's action. The base item reports a closing selection;
   * checkbox / radio items override to toggle state and keep the menu open.
   */
  protected _activate() {
    this._emitSelect(this._value());
  }

  protected _emitSelect(value: string, close?: boolean) {
    this.dispatchEvent(
      new CustomEvent<ItemSelectDetail>(SELECT, {
        bubbles: true,
        composed: true,
        detail: { value, close },
      }),
    );
  }

  #onClick = (e: MouseEvent) => {
    if (this.hasAttribute("disabled")) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // A submenu trigger item opens its submenu instead of selecting.
    if (this.hasAttribute("data-menu-trigger")) return;
    this._activate();
  };
}

/** Shared base for menu items carrying a checked state (checkbox / radio):
 * observes `checked`/`disabled` and reflects `aria-checked` + `data-checked`.
 * Subclasses supply only their role and activation behavior. */
abstract class UICheckedMenuItem extends UIMenuItem {
  static observedAttributes = ["checked", "disabled"];

  get checked() {
    return this.hasAttribute("checked");
  }
  set checked(next: boolean) {
    this.toggleAttribute("checked", next);
  }

  connectedCallback() {
    super.connectedCallback();
    this._syncChecked();
  }
  attributeChangedCallback() {
    this._syncChecked();
  }

  protected _syncChecked() {
    this.setAttribute("aria-checked", String(this.checked));
    this.toggleAttribute("data-checked", this.checked);
  }
}

/** A menu item that holds a checked state (`role=menuitemcheckbox`). Activating
 * it toggles the checkmark and keeps the menu open. */
export class UIMenuCheckboxItem extends UICheckedMenuItem {
  protected override _role() {
    return "menuitemcheckbox";
  }

  protected override _activate() {
    this.checked = !this.checked;
    this._syncChecked();
    this._emitSelect(this._value(), false); // keep the menu open
  }
}

/** A single-select menu item (`role=menuitemradio`); its owning
 * `<ui-menu-radio-group>` coordinates the checked state. */
export class UIMenuRadioItem extends UICheckedMenuItem {
  get value() {
    return this._value();
  }

  protected override _role() {
    return "menuitemradio";
  }

  protected override _activate() {
    this.closest<UIMenuRadioGroup>("ui-menu-radio-group")?.select(this.value);
    this._emitSelect(this.value, false); // selection-in-group keeps the menu open
  }
}

/** Groups radio items and owns the single selected `value`. */
export class UIMenuRadioGroup extends HTMLElement {
  connectedCallback() {
    this.setAttribute("role", "group");
    queueMicrotask(() => {
      // Adopt a pre-`checked` item as the initial value, then reflect state.
      if (this.value == null) {
        const pre = this.querySelector<UIMenuRadioItem>("ui-menu-radio-item[checked]");
        if (pre) {
          this.value = pre.value;
          return;
        }
      }
      this.#sync();
    });
  }

  get value() {
    return this.getAttribute("value");
  }
  set value(next: string | null) {
    if (next == null) this.removeAttribute("value");
    else this.setAttribute("value", next);
    this.#sync();
  }

  /** Set the selected value (called by a radio item on activation). */
  select(value: string) {
    this.value = value;
  }

  #sync() {
    const val = this.value;
    for (const item of this.querySelectorAll<UIMenuRadioItem>("ui-menu-radio-item")) {
      item.checked = item.value === val;
    }
  }
}

/** A labelled group of menu items (`role=group` + `aria-labelledby`). */
export class UIMenuGroup extends HTMLElement {
  connectedCallback() {
    this.setAttribute("role", "group");
    queueMicrotask(() => {
      labelFrom(
        this,
        "aria-labelledby",
        this.querySelector("ui-menu-group-label"),
        "ui-menu-group-label",
      );
    });
  }
}

/** The label for a `<ui-menu-group>` (presentational — not a menu item). */
export class UIMenuGroupLabel extends HTMLElement {
  connectedCallback() {
    this.setAttribute("role", "presentation");
  }
}

define("ui-menu", UIMenu);
define("ui-menu-popup", UIMenuPopup);
define("ui-menu-item", UIMenuItem);
define("ui-menu-checkbox-item", UIMenuCheckboxItem);
define("ui-menu-radio-item", UIMenuRadioItem);
define("ui-menu-radio-group", UIMenuRadioGroup);
define("ui-menu-group", UIMenuGroup);
define("ui-menu-group-label", UIMenuGroupLabel);

declare global {
  interface HTMLElementTagNameMap {
    "ui-menu": UIMenu;
    "ui-menu-popup": UIMenuPopup;
    "ui-menu-item": UIMenuItem;
    "ui-menu-checkbox-item": UIMenuCheckboxItem;
    "ui-menu-radio-item": UIMenuRadioItem;
    "ui-menu-radio-group": UIMenuRadioGroup;
    "ui-menu-group": UIMenuGroup;
    "ui-menu-group-label": UIMenuGroupLabel;
  }
}
