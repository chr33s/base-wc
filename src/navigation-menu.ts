/**
 * `ui-navigation-menu` — a site-navigation bar whose triggers reveal large
 * content panels (Base UI's Navigation Menu). One panel is open at a time;
 * hovering or focusing a trigger opens its panel after an intent delay — the
 * shared {@link hoverIntent} timer pair — (or instantly when switching from an
 * already-open one), and leaving the menu closes it. Triggers roam with the arrow keys (RTL-aware via {@link roving}),
 * `ArrowDown` moves into the open panel, and `Escape` closes. Panels animate
 * out via {@link runExit}; the active panel's size is published as
 * `--nav-content-width` / `--nav-content-height` on the root so a shared
 * "viewport" can morph between panels.
 *
 * Markup: `<ui-navigation-menu>` › `<ui-nav-list>` › `<ui-nav-item>`s, each with
 * a `[data-nav-trigger]` and a `<ui-nav-content>`.
 */
import { define } from "./define.ts";
import { numberAttribute } from "./math.ts";
import { getFocusable } from "./focus-trap.ts";
import { nextId } from "./id.ts";
import { hoverIntent, type HoverIntent } from "./intent.ts";
import { RovingElement, isDisabled, type RovingOptions } from "./roving.ts";
import { runExit, setOpenState } from "./transitions.ts";

interface NavItem {
  readonly trigger: HTMLElement;
  readonly content: HTMLElement | null;
}

/** Site navigation with hover-intent triggers revealing `ui-nav-content` panels; roving focus across triggers. */
export class UINavigationMenu extends RovingElement {
  /**
   * The authored items, keyed by trigger and rebuilt whenever the light DOM
   * changes. One map rather than a list plus a lookup: a `Map` already iterates
   * in insertion order, so it *is* the ordered item list, and a single
   * structure cannot drift out of step with itself the way two caches rebuilt
   * side by side can.
   */
  #items = new Map<HTMLElement, NavItem>();
  /**
   * The open item, held as the item itself rather than an index. An index into
   * a list that can change under it is what freezes the menu when the open
   * trigger is removed: the index still looks valid, points at a different
   * item, and every close path then targets the wrong panel — or a detached
   * one — leaving the menu stuck open forever.
   */
  #active: NavItem | null = null;
  /** The element roving is attached to — the authored list, else the host. */
  #list: HTMLElement | null = null;
  #observer: MutationObserver | null = null;
  /** Triggers already given their listeners, so a re-sync never double-wires. */
  #wiredTriggers = new WeakSet<HTMLElement>();
  /** Panels already set up — keyed on their own, since a panel can arrive or be
   * swapped after its trigger was wired (a nav that renders per route). */
  #wiredContents = new WeakSet<HTMLElement>();
  /** The item a pending hover-intent open will reveal. */
  #pending: NavItem | null = null;
  #intent: HoverIntent = hoverIntent({
    isOpen: () => this.#active != null,
    open: () => this.#open(this.#pending),
    close: () => this.#close(),
    openDelay: () => this.#delay,
    closeDelay: () => this.#delay,
  });

  get #delay() {
    return numberAttribute(this, "delay", 200);
  }

  protected override connectResources() {
    const stopRoving = super.connectResources();
    this.#observeItems();
    return () => {
      stopRoving();
      this.#intent.cancel();
      this.#observer?.disconnect();
      this.#observer = null;
    };
  }

  protected override initialize() {
    const list = this.querySelector<HTMLElement>("ui-nav-list") ?? this;
    this.#syncItems();

    this.#list = list;
    this.attachRoving();
    this.roving?.refresh(0);

    this.addEventListener("pointerenter", this.#cancelClose);
    this.addEventListener("pointerleave", this.#scheduleClose);
    return true;
  }

  protected override get rovingContainer(): HTMLElement {
    return this.#list ?? this;
  }

  protected override rovingOptions(): RovingOptions {
    return {
      items: () => this.#triggers(),
      orientation: "horizontal",
      loop: true,
    };
  }

  /**
   * Nav items are routinely added or removed at runtime (a nav that renders
   * per-route, an item behind a permission check). Re-read them instead of
   * holding the snapshot taken at wire time, which would leave new items inert
   * and removed ones still addressable.
   */
  #observeItems() {
    if (this.#observer || typeof MutationObserver === "undefined") return;
    this.#observer = new MutationObserver(() => this.#syncItems());
    this.#observer.observe(this, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "aria-disabled"],
    });
  }

  /**
   * Rebuild the item list from the DOM and wire any newcomers. Items without a
   * trigger cannot participate at all — dropping them here keeps
   * `NavItem.trigger` honestly non-null for everything downstream.
   */
  #syncItems() {
    // Entries are reused, keyed by trigger, so an item keeps *one* identity for
    // as long as its trigger is in the document. `#active` and `#pending` hold
    // entries, and a rebuild that minted fresh objects would silently stop
    // matching them — leaving the menu unable to recognise its own open panel.
    const previous = this.#items;
    this.#items = new Map();
    for (const item of this.querySelectorAll<HTMLElement>("ui-nav-item")) {
      const trigger = item.querySelector<HTMLElement>("[data-nav-trigger]");
      if (!trigger) continue;
      const content = item.querySelector<HTMLElement>("ui-nav-content");
      const existing = previous.get(trigger);
      this.#items.set(trigger, existing?.content === content ? existing : { trigger, content });
    }

    for (const entry of this.#items.values()) {
      const { trigger, content } = entry;
      if (!trigger.id) trigger.id = nextId("ui-nav-trigger");
      // Re-reflected on every sync, not just at wiring: `disabled` is the one
      // piece of trigger state a consumer flips at runtime, and `data-disabled`
      // is what their CSS styles it with.
      trigger.toggleAttribute("data-disabled", isDisabled(trigger));
      if (!content) trigger.removeAttribute("aria-controls");
      else if (!this.#wiredContents.has(content)) {
        this.#wiredContents.add(content);
        if (!content.id) content.id = nextId("ui-nav-content");
        trigger.setAttribute("aria-controls", content.id);
        content.setAttribute("role", "region");
        content.setAttribute("aria-labelledby", trigger.id);
        content.hidden = true;
        setOpenState(content, false);
        content.addEventListener("pointerenter", this.#cancelClose);
        content.addEventListener("keydown", this.#onContentKeydown);
      }
      if (this.#wiredTriggers.has(trigger)) continue;
      this.#wiredTriggers.add(trigger);
      trigger.setAttribute("aria-expanded", "false");
      // Bound to the entry, not to an index — the entry survives its neighbours
      // being reordered or removed.
      trigger.addEventListener("click", () => this.#toggle(this.#itemFor(trigger)));
      trigger.addEventListener("keydown", (e) => this.#onTriggerKeydown(e, this.#itemFor(trigger)));
      trigger.addEventListener("pointerenter", () => this.#onTriggerEnter(this.#itemFor(trigger)));
    }

    // The open panel's trigger just left the DOM: drop the open state outright
    // rather than animating a detached element, or the menu stays latched open
    // and every later hover is ignored.
    if (this.#active && !this.#active.trigger.isConnected) {
      this.#active = null;
      this.removeAttribute("data-open");
      this.#intent.cancel();
    }
    if (this.#pending && !this.#pending.trigger.isConnected) this.#pending = null;
    // Roving reads triggers through the cache rebuilt above; its own observer
    // may already have fired against the stale list, so re-assert the tab stop
    // now that the list is current (no index: keeps the stop where it survives).
    this.roving?.refresh();
  }

  /** The live entry for a trigger (identity, so a rebuilt list still matches). */
  #itemFor(trigger: HTMLElement) {
    return this.#items.get(trigger) ?? null;
  }

  #triggers() {
    return [...this.#items.keys()].filter((t) => !isDisabled(t));
  }

  // ---- open / close ----------------------------------------------------
  #open(item: NavItem | null) {
    if (!item?.content || !item.trigger.isConnected) return;
    if (item.trigger.hasAttribute("data-disabled")) return;
    const { trigger, content } = item;
    if (this.#active && this.#active !== item) this.#hide(this.#active);
    this.#active = item;
    trigger.setAttribute("aria-expanded", "true");
    content.hidden = false;
    content.setAttribute("data-open", "");
    setOpenState(content, true);
    this.style.setProperty("--nav-content-width", `${content.scrollWidth}px`);
    this.style.setProperty("--nav-content-height", `${content.scrollHeight}px`);
    this.setAttribute("data-open", "");
    this.dispatchEvent(
      new CustomEvent("change", {
        bubbles: true,
        detail: {
          index: [...this.#items.values()].indexOf(item),
          value: trigger.textContent?.trim() ?? "",
        },
      }),
    );
  }

  #hide({ trigger, content }: NavItem) {
    if (!content) return;
    trigger.setAttribute("aria-expanded", "false");
    content.removeAttribute("data-open");
    runExit(content, () => {
      if (!content.hasAttribute("data-open")) content.hidden = true;
    });
  }

  #close(restoreFocus = false) {
    const item = this.#active;
    if (!item) return;
    this.#active = null;
    this.#hide(item);
    this.removeAttribute("data-open");
    if (restoreFocus) item.trigger.focus();
  }

  #toggle(item: NavItem | null) {
    if (!item) return;
    if (this.#active === item) this.#close();
    else this.#open(item);
  }

  // ---- intent ----------------------------------------------------------
  #onTriggerEnter(item: NavItem | null) {
    if (!item) return;
    this.#intent.cancelClose();
    // Cancel any pending open from an earlier trigger so a fast hover sweep
    // doesn't queue several opens (which would flash panels or open one after
    // the pointer has already left).
    this.#intent.cancelOpen();
    if (this.#active) {
      this.#open(item); // already browsing — switch instantly
    } else {
      this.#pending = item;
      this.#intent.scheduleOpen();
    }
  }
  #cancelClose = () => this.#intent.cancelClose();
  #scheduleClose = () => this.#intent.scheduleClose();

  // ---- keyboard --------------------------------------------------------
  #onTriggerKeydown = (e: KeyboardEvent, item: NavItem | null) => {
    if (!item) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.#open(item);
      if (item.content) getFocusable(item.content)[0]?.focus();
    } else if (e.key === "Escape") {
      this.#close(true);
    }
  };

  #onContentKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      this.#close(true);
    }
  };
}

/** Custom element `ui-nav-list`: the container roving focus attaches to. */
export class UINavList extends HTMLElement {}
/** Custom element `ui-nav-item`: groups one trigger with its content panel. */
export class UINavItem extends HTMLElement {}
/** Custom element `ui-nav-content`: the panel revealed by an item's trigger. */
export class UINavContent extends HTMLElement {}

define("ui-navigation-menu", UINavigationMenu);
define("ui-nav-list", UINavList);
define("ui-nav-item", UINavItem);
define("ui-nav-content", UINavContent);

declare global {
  interface HTMLElementTagNameMap {
    "ui-navigation-menu": UINavigationMenu;
    "ui-nav-list": UINavList;
    "ui-nav-item": UINavItem;
    "ui-nav-content": UINavContent;
  }
}
