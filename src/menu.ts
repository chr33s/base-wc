/**
 * `ui-menu` — a light-DOM menu (Base UI's Menu, ported to web components).
 *
 * Three custom elements cooperate:
 *
 * - `<ui-menu>`     — root; owns open state, keyboard, typeahead, positioning.
 * - `<ui-menu-popup>` — `role=menu`, lifted into the top layer via the Popover
 *   API so it escapes `overflow`/stacking-context clipping for free.
 * - `<ui-menu-item>`  — `role=menuitem`; registers with its root and reports
 *   selection.
 *
 * Coordination uses **bubbling registration events** (the context-request
 * shape) rather than React-style context, and the DOM is the source of truth
 * for item order — which sidesteps the "child upgraded before parent" race.
 * Positioning delegates to {@link anchor} only on browsers without native CSS
 * anchor positioning.
 *
 * The root exposes `show()` / `hide()` / `openAt(x, y)` / `focusFirst()` and
 * `open`/`close` events so composites (`ui-menubar`, `ui-context-menu`) can
 * drive it, and a `submenu` attribute switches it to a nested side-anchored menu
 * that opens on hover / `ArrowRight` — the building block for `ui-submenu`.
 */
import { rectAt, SUPPORTS_ANCHOR, type VirtualElement } from "./anchor.ts";
import { isRTL } from "./direction.ts";
import { nextId } from "./id.ts";
import { connectLightDom } from "./lifecycle.ts";
import { type Overlay, overlay } from "./overlay.ts";
import { normalize } from "./text.ts";

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

/** Root — owns state, wires the trigger, coordinates items, positions popup. */
export class UIMenu extends HTMLElement {
  #trigger: HTMLElement | null = null;
  #popup: HTMLElement | null = null;
  #isOpen = false;
  #activeIndex = -1;
  #overlay: Overlay | null = null;
  #pointRef: VirtualElement | null = null;
  #typeahead = "";
  #typeaheadTimer = 0;
  #closeTimer = 0;
  #wired = false;

  /** Whether the popup is currently shown. */
  get open(): boolean {
    return this.#isOpen;
  }
  get #isSubmenu(): boolean {
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
      if (this.#trigger instanceof HTMLButtonElement && !this.#trigger.hasAttribute("type")) {
        this.#trigger.type = "button"; // never submit an enclosing form
      }
      this.#trigger.setAttribute("aria-haspopup", "menu");
      this.#trigger.setAttribute("aria-expanded", "false");
      if (this.#popup) {
        if (!this.#popup.id) this.#popup.id = nextId("ui-menu-popup");
        this.#trigger.setAttribute("aria-controls", this.#popup.id);
      }
      if (this.#isSubmenu) {
        this.#trigger.addEventListener("click", this.#onSubmenuTriggerClick);
        this.#trigger.addEventListener("keydown", this.#onSubmenuTriggerKeydown);
        this.#trigger.addEventListener("pointerenter", this.#onSubmenuEnter);
        this.addEventListener("pointerenter", this.#cancelClose);
        this.addEventListener("pointerleave", this.#scheduleClose);
      } else {
        this.#trigger.addEventListener("click", this.#onTriggerClick);
        this.#trigger.addEventListener("keydown", this.#onTriggerKeydown);
      }
    }
    this.#popup?.addEventListener("keydown", this.#onPopupKeydown);
    this.#popup?.addEventListener("pointermove", this.#onPointerMove, true);

    // Native anchor pairing, unique per instance to avoid the multi-instance
    // "everything resolves to the last one" collision. Submenus always position
    // via JS (to the side), so they skip the CSS (bottom-placement) pairing.
    if (SUPPORTS_ANCHOR && !this.#isSubmenu && this.#trigger && this.#popup) {
      const name = `--menu-${nextId("anchor")}`;
      this.#trigger.style.setProperty("anchor-name", name);
      this.#popup.style.setProperty("position-anchor", name);
    }

    this.addEventListener(SELECT, this.#onItemSelect as EventListener);

    // Assign stable ids to this popup's own items (present at wire time).
    this.#allItems().forEach((el) => {
      if (!el.id) el.id = nextId("ui-menu-item");
    });

    if (this.#popup) {
      this.#overlay = overlay(this.#popup, {
        // Point-anchored (context menu) and side-anchored (submenu) opens
        // position via JS unconditionally; a regular menu uses the CSS
        // anchor-name pairing above when supported, else the JS fallback.
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
        },
        dismiss: {
          within: () => [this.#popup, this.#trigger],
          onDismiss: () => this.#close({ restoreFocus: false }),
        },
      });
    }
  }

  disconnectedCallback() {
    clearTimeout(this.#closeTimer);
    this.#close({ restoreFocus: false });
  }

  // ---- public API (for ui-menubar / ui-context-menu) -------------------
  /** Open the popup (no focus move). */
  show() {
    this.#open();
  }
  /** Close the popup without restoring focus (the caller owns focus). */
  hide() {
    this.#close({ restoreFocus: false });
  }
  /** Open at a viewport point (context menu) and focus the first item. */
  openAt(x: number, y: number) {
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
  #allItems(): UIMenuItem[] {
    const popup = this.#popup;
    if (!popup) return [];
    return [...popup.querySelectorAll<UIMenuItem>(ITEM_SELECTOR)].filter(
      (el) => el.closest("ui-menu-popup") === popup,
    );
  }
  /** Navigable items in DOM order; disabled ones excluded. */
  #items(): UIMenuItem[] {
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
  #outermostMenu(): UIMenu {
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
    if (this.#isOpen || !this.#popup) return;
    this.#isOpen = true;
    this.#trigger?.setAttribute("aria-expanded", "true");
    // overlay() owns the top-layer show, positioning (per-open placement) and
    // outside-press dismissal.
    this.#overlay?.show();
    this.dispatchEvent(new CustomEvent("open", { bubbles: true }));
  }

  #openWithFocus(which: "first" | "last") {
    this.#open();
    if (which === "last") this.focusLast();
    else this.focusFirst();
  }

  #close({ restoreFocus = true }: { restoreFocus?: boolean } = {}) {
    if (!this.#isOpen) return;
    this.#isOpen = false;
    this.#activeIndex = -1;
    this.#clearActive();
    // Close any open descendant submenus with us.
    for (const sub of this.#popup?.querySelectorAll<UIMenu>("ui-menu[submenu]") ?? []) sub.hide();
    this.#trigger?.setAttribute("aria-expanded", "false");
    this.#overlay?.hide();
    this.#pointRef = null;
    if (restoreFocus) this.#trigger?.focus();
    this.dispatchEvent(new CustomEvent("close", { bubbles: true }));
  }

  // ---- trigger interaction --------------------------------------------
  #onTriggerClick = () => {
    if (this.#isOpen) this.#close();
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
    if (this.#isOpen) this.#close();
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
    this.#cancelClose();
    this.#open();
  };
  #cancelClose = () => clearTimeout(this.#closeTimer);
  #scheduleClose = () => {
    clearTimeout(this.#closeTimer);
    // A grace delay approximates diagonal travel into the submenu popup.
    this.#closeTimer = window.setTimeout(() => this.#close({ restoreFocus: false }), 200);
  };

  #onPopupKeydown = (e: KeyboardEvent) => {
    // Ignore keydowns bubbling up from a nested submenu popup.
    if ((e.target as Element)?.closest?.("ui-menu-popup") !== this.#popup) return;
    const count = this.#items().length;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        this.#move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        this.#move(-1);
        break;
      case "ArrowLeft":
      case "ArrowRight":
        // Collapse the submenu toward its parent: ArrowLeft in LTR, ArrowRight
        // in RTL (the mirror of the open key).
        if (this.#isSubmenu && e.key === (isRTL(this) ? "ArrowRight" : "ArrowLeft")) {
          e.preventDefault();
          e.stopPropagation();
          this.#close();
        }
        break;
      case "Home":
        e.preventDefault();
        this.#setActive(0);
        break;
      case "End":
        e.preventDefault();
        this.#setActive(count - 1);
        break;
      case "Escape":
        e.preventDefault();
        if (this.#isSubmenu) e.stopPropagation();
        this.#close();
        break;
      case "Tab":
        this.#close({ restoreFocus: false });
        break;
      case "Enter":
        e.preventDefault();
        this.#activate();
        break;
      case " ":
        e.preventDefault();
        // Space extends a pending typeahead search (so multi-word labels are
        // reachable); it only activates when no search is in progress.
        if (this.#typeahead) this.#typeaheadTo(" ");
        else this.#activate();
        break;
      default:
        if (e.key.length === 1) this.#typeaheadTo(e.key);
    }
  };

  #move(delta: number) {
    const items = this.#items();
    if (!items.length) return;
    const i = (this.#activeIndex + delta + items.length) % items.length; // wrap
    this.#setActive(i);
  }

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

  #activate() {
    this.#items()[this.#activeIndex]?.click(); // item dispatches the select
  }

  #onPointerMove = (e: PointerEvent) => {
    const item = (e.target as Element).closest?.(ITEM_SELECTOR) as UIMenuItem | null;
    if (!item || item.hasAttribute("disabled")) return;
    const idx = this.#items().indexOf(item);
    if (idx !== -1 && idx !== this.#activeIndex) this.#setActive(idx);
  };

  #typeaheadTo(char: string) {
    clearTimeout(this.#typeaheadTimer);
    this.#typeahead += char;
    this.#typeaheadTimer = window.setTimeout(() => (this.#typeahead = ""), 500);
    // Diacritic-/case-insensitive match, consistent with combobox/autocomplete.
    const q = normalize(this.#typeahead);
    if (!q) return;
    const items = this.#items();
    const start = this.#activeIndex + 1;
    const ordered = [...items.slice(start), ...items.slice(0, start)]; // search from next
    const match = ordered.find((i) => normalize(i.textContent ?? "").startsWith(q));
    if (match) this.#setActive(items.indexOf(match));
  }
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
  protected _role(): string {
    return "menuitem";
  }

  /** The value reported on selection. */
  protected _value(): string {
    return this.getAttribute("value") ?? this.textContent?.trim() ?? "";
  }

  /**
   * Perform the item's action. The base item reports a closing selection;
   * checkbox / radio items override to toggle state and keep the menu open.
   */
  protected _activate(): void {
    this._emitSelect(this._value());
  }

  protected _emitSelect(value: string, close?: boolean): void {
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

  get checked(): boolean {
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

  protected _syncChecked(): void {
    this.setAttribute("aria-checked", String(this.checked));
    this.toggleAttribute("data-checked", this.checked);
  }
}

/** A menu item that holds a checked state (`role=menuitemcheckbox`). Activating
 * it toggles the checkmark and keeps the menu open. */
export class UIMenuCheckboxItem extends UICheckedMenuItem {
  protected override _role(): string {
    return "menuitemcheckbox";
  }

  protected override _activate(): void {
    this.checked = !this.checked;
    this._syncChecked();
    this._emitSelect(this._value(), false); // keep the menu open
  }
}

/** A single-select menu item (`role=menuitemradio`); its owning
 * `<ui-menu-radio-group>` coordinates the checked state. */
export class UIMenuRadioItem extends UICheckedMenuItem {
  get value(): string {
    return this._value();
  }

  protected override _role(): string {
    return "menuitemradio";
  }

  protected override _activate(): void {
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

  get value(): string | null {
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
      const label = this.querySelector("ui-menu-group-label");
      if (label) {
        if (!label.id) label.id = nextId("ui-menu-group-label");
        this.setAttribute("aria-labelledby", label.id);
      }
    });
  }
}

/** The label for a `<ui-menu-group>` (presentational — not a menu item). */
export class UIMenuGroupLabel extends HTMLElement {
  connectedCallback() {
    this.setAttribute("role", "presentation");
  }
}

if (!customElements.get("ui-menu")) customElements.define("ui-menu", UIMenu);
if (!customElements.get("ui-menu-popup")) customElements.define("ui-menu-popup", UIMenuPopup);
if (!customElements.get("ui-menu-item")) customElements.define("ui-menu-item", UIMenuItem);
if (!customElements.get("ui-menu-checkbox-item"))
  customElements.define("ui-menu-checkbox-item", UIMenuCheckboxItem);
if (!customElements.get("ui-menu-radio-item"))
  customElements.define("ui-menu-radio-item", UIMenuRadioItem);
if (!customElements.get("ui-menu-radio-group"))
  customElements.define("ui-menu-radio-group", UIMenuRadioGroup);
if (!customElements.get("ui-menu-group")) customElements.define("ui-menu-group", UIMenuGroup);
if (!customElements.get("ui-menu-group-label"))
  customElements.define("ui-menu-group-label", UIMenuGroupLabel);

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
