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
import { UIPopupElement } from "./popup.ts";
import { isRTL } from "./direction.ts";
import { labelFrom, nextId } from "./id.ts";
import { hoverIntent, type HoverIntent, onPointerMoved } from "./intent.ts";
import { LightDomElement } from "./lifecycle.ts";
import type { ChangeReason } from "./reasons.ts";
import { isDisabled, type Orientation } from "./roving.ts";
import { listNav, type ListNav } from "./list-nav.ts";
import { type Overlay, overlay } from "./overlay.ts";
import { localeOf } from "./text.ts";

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
export class UIMenu extends LightDomElement {
  static observedAttributes = ["disabled", "aria-disabled"];

  #trigger: HTMLElement | null = null;
  #popup: HTMLElement | null = null;
  #activeIndex = -1;
  #overlay: Overlay | null = null;
  #pointRef: VirtualElement | null = null;
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
    onCancel: () => this.#close({ reason: "escape-key" }),
    onTab: () => this.#close({ restoreFocus: false }),
    orientation: () => this.orientation,
    rtl: () => isRTL(this),
    label: (i) => this.#items()[i]?.textContent ?? "",
    locale: () => localeOf(this),
  });

  /** Whether the popup is currently shown. */
  get open() {
    return this.#overlay?.open ?? false;
  }
  /**
   * The axis the arrow keys walk. `vertical` is the ARIA default for a menu, so
   * only the horizontal case is announced — on the popup, which owns the `menu`
   * role, rather than on this wrapper.
   */
  get orientation(): Orientation {
    return this.getAttribute("orientation") === "horizontal" ? "horizontal" : "vertical";
  }
  get #isSubmenu() {
    return this.hasAttribute("submenu");
  }

  override connectedCallback() {
    // Defer wiring to a microtask so the light-DOM children (trigger, popup,
    // items) have finished parsing/upgrading — a custom element's
    // `connectedCallback` can run before its children are inserted.
    super.connectedCallback();
  }

  protected override initialize() {
    this.#trigger = this.querySelector<HTMLElement>("[data-menu-trigger]");
    this.#popup = this.querySelector<HTMLElement>("ui-menu-popup");
    if (!this.#popup) return false;
    if (this.orientation === "horizontal") {
      this.#popup.setAttribute("aria-orientation", "horizontal");
    } else {
      this.#popup.removeAttribute("aria-orientation");
    }

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
    // Capture phase so a submenu trigger's own listeners never pre-empt the
    // root's highlight, and filtered to real movement: arrow-key scrolling in a
    // long menu slides a new item under a resting cursor, and acting on that
    // would drag the highlight back off whatever the keyboard just reached
    // (see {@link onPointerMoved}).
    onPointerMoved(this.#popup, this.#onPointerMove, { capture: true });

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
        onDismiss: () => this.#close({ restoreFocus: false, reason: "outside-press" }),
      },
      trigger: { element: this.#trigger, haspopup: "menu", controls: "ui-menu-popup" },
      events: this,
    });

    this.#reflectDisabled();
    return true;
  }

  attributeChangedCallback() {
    if (!this.wired) return;
    this.#reflectDisabled();
    if (this.#rootDisabled) this.#close({ restoreFocus: false });
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#graceClose.cancel();
    this.#close({ restoreFocus: false });
  }

  /**
   * Reflect the root's disabled state: `data-disabled` on the root (consumer
   * CSS), `aria-disabled` on the trigger, and a nudge to every descendant item
   * (submenus included) so each re-derives its own state — an item reads its
   * enclosing menus itself; the root only tells it when that changed.
   */
  #reflectDisabled() {
    const disabled = this.#rootDisabled;
    this.toggleAttribute("data-disabled", disabled);
    if (this.#trigger && !this.#trigger.matches(ITEM_SELECTOR)) {
      if (disabled) this.#trigger.setAttribute("aria-disabled", "true");
      else this.#trigger.removeAttribute("aria-disabled");
    }
    for (const el of this.querySelectorAll<UIMenuItem>(ITEM_SELECTOR)) el._reflectDisabled();
  }

  // ---- public API (for ui-menubar / ui-context-menu) -------------------
  /** Open the popup (no focus move). */
  show(reason: ChangeReason = "none") {
    // Wire synchronously if called in the same task as connection, before the
    // deferred wiring microtask has run — otherwise the open silently no-ops.
    this.ensureInitialized();
    this.#open(reason);
  }
  /** Close the popup without restoring focus (the caller owns focus). */
  hide(reason: ChangeReason = "none") {
    this.#close({ restoreFocus: false, reason });
  }
  /** Open at a viewport point (context menu) and focus the first item. */
  openAt(x: number, y: number, reason: ChangeReason = "none") {
    this.ensureInitialized();
    this.#pointRef = { getBoundingClientRect: () => rectAt(x, y) };
    this.#open(reason);
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
  /** Whether the whole menu is disabled, so every item is too. */
  get #rootDisabled() {
    return isDisabled(this);
  }

  /**
   * Navigable items in DOM order. An item is skipped when it is disabled
   * itself — via either `disabled` or `aria-disabled`, since a non-form custom
   * element can only be *announced* disabled and assistive tech reads the
   * latter — or when the root is, which no per-item attribute reflects.
   */
  #items() {
    if (this.#rootDisabled) return [];
    return this.#allItems().filter((el) => !isDisabled(el));
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
    // Walk up until no enclosing menu remains — a submenu nests arbitrarily deep.
    let parent = root.parentElement?.closest<UIMenu>("ui-menu");
    while (parent) {
      root = parent;
      parent = root.parentElement?.closest<UIMenu>("ui-menu");
    }
    return root;
  }

  #open(reason: ChangeReason = "none") {
    // A disabled menu never opens — the single chokepoint, so every entry
    // (trigger click, arrow keys, hover on a submenu, `show()`, `openAt()`)
    // is covered by this one guard.
    if (this.#rootDisabled) return;
    // overlay() owns the top-layer show, trigger ARIA, positioning (per-open
    // placement), outside-press dismissal and the bubbling `open` event.
    this.#overlay?.show(reason);
  }

  #openWithFocus(which: "first" | "last", reason: ChangeReason = "none") {
    this.#open(reason);
    if (which === "last") this.focusLast();
    else this.focusFirst();
  }

  #close({
    restoreFocus = true,
    reason = "none",
  }: { restoreFocus?: boolean; reason?: ChangeReason } = {}) {
    if (!this.#overlay?.open) return;
    this.#activeIndex = -1;
    this.#clearActive();
    // Close any open descendant submenus with us — a parent closing is what
    // took them with it, not anything the user did to them.
    for (const sub of this.#popup?.querySelectorAll<UIMenu>("ui-menu[submenu]") ?? []) {
      sub.hide("sibling-open");
    }
    this.#overlay.hide({ reason });
    this.#pointRef = null;
    if (restoreFocus) this.#trigger?.focus();
  }

  // ---- trigger interaction --------------------------------------------
  #onTriggerClick = () => {
    if (this.open) this.#close({ reason: "trigger-press" });
    else this.#openWithFocus("first", "trigger-press");
  };

  /**
   * The axis the trigger's open keys sit on. A menu inside a menubar opens
   * across the bar, not along it: the bar owns its own axis for moving between
   * menus, so a vertical bar has to open on Left/Right or the same key would
   * both move and open.
   */
  get #openAxis(): Orientation {
    const bar = this.parentElement?.closest("ui-menubar") as { orientation?: Orientation } | null;
    return bar?.orientation === "vertical" ? "horizontal" : "vertical";
  }

  #onTriggerKeydown = (e: KeyboardEvent) => {
    // Enter/Space already fire a native click on <button>; add the arrows.
    const [first, last] =
      this.#openAxis === "vertical"
        ? (["ArrowDown", "ArrowUp"] as const)
        : isRTL(this)
          ? (["ArrowLeft", "ArrowRight"] as const)
          : (["ArrowRight", "ArrowLeft"] as const);
    if (e.key !== first && e.key !== last) return;
    e.preventDefault();
    // Consume it so an enclosing menubar doesn't also treat the key as its own.
    e.stopPropagation();
    this.#openWithFocus(e.key === first ? "first" : "last", "list-navigation");
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
    if (!item || isDisabled(item)) return;
    const idx = this.#items().indexOf(item);
    if (idx !== -1 && idx !== this.#activeIndex) this.#setActive(idx);
  };
}

/** Popup — `role=menu`, lives in the top layer via the Popover API. */
export class UIMenuPopup extends UIPopupElement {
  static override role = "menu";
  static override focusable = true;
}

/** Item — `role=menuitem`; registers with its root, reports selection. */
export class UIMenuItem extends HTMLElement {
  static observedAttributes = ["disabled"];

  /** The author announced this item disabled via `aria-disabled` alone — that
   * announcement is theirs; we only ever add `data-disabled` beside it. */
  #authorAria = false;

  connectedCallback() {
    this.setAttribute("role", this._role());
    this.tabIndex = -1;
    this.#authorAria =
      !this.hasAttribute("disabled") && this.getAttribute("aria-disabled") === "true";
    this._reflectDisabled();
    this.addEventListener("click", this.#onClick);
  }

  attributeChangedCallback(name: string) {
    if (name === "disabled") this._reflectDisabled();
  }

  /** Disabled by its own `disabled`, or because an enclosing menu is. */
  get #disabled() {
    return (
      this.hasAttribute("disabled") ||
      this.closest("ui-menu[disabled], ui-menu[aria-disabled='true']") != null
    );
  }

  /** Reflect the effective disabled state to `aria-disabled` / `data-disabled`.
   * The root calls this when its own state changes. */
  /**
   * Single-underscore, not `#`: the menu root and `UICheckedMenuItem` both
   * reach this from outside the instance that owns it, which a private name
   * makes impossible. The prefix marks it as internal to the module rather
   * than part of the element's public surface.
   */
  _reflectDisabled() {
    const disabled = this.#disabled;
    this.toggleAttribute("data-disabled", disabled || this.#authorAria);
    if (this.#authorAria) return;
    if (disabled) this.setAttribute("aria-disabled", "true");
    else this.removeAttribute("aria-disabled");
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
    // `aria-disabled` covers both an item announced disabled by the author and
    // one the root disabled wholesale — the root reflects its state down here
    // rather than every item reaching back up for it.
    if (isDisabled(this)) {
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
  static override observedAttributes = ["checked", "disabled"];

  get checked() {
    return this.hasAttribute("checked");
  }
  set checked(next: boolean) {
    this.toggleAttribute("checked", next);
  }

  override connectedCallback() {
    super.connectedCallback();
    this._syncChecked();
  }
  override attributeChangedCallback(name: string) {
    super.attributeChangedCallback(name);
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

/**
 * The label for a `<ui-menu-group>` — hidden from the accessibility tree, not
 * merely `role="presentation"`. The group already announces this text via its
 * `aria-labelledby`, so an exposed node would have a screen reader read the
 * heading twice; and inside a `role="menu"`, a bare presentational node still
 * sits among the menu items. `aria-hidden` does not affect a name computed
 * through `aria-labelledby`, so the group keeps its label.
 */
export class UIMenuGroupLabel extends HTMLElement {
  connectedCallback() {
    this.setAttribute("aria-hidden", "true");
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
