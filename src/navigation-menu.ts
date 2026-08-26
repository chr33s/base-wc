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
import { connectLightDom } from "./lifecycle.ts";
import { getFocusable } from "./focus-trap.ts";
import { nextId } from "./id.ts";
import { hoverIntent, type HoverIntent } from "./intent.ts";
import { roving, type Roving } from "./roving.ts";
import { runExit, setOpenState } from "./transitions.ts";

interface NavItem {
  readonly trigger: HTMLElement;
  readonly content: HTMLElement | null;
}

export class UINavigationMenu extends HTMLElement {
  #items: NavItem[] = [];
  #activeIndex = -1;
  #roving: Roving | null = null;
  #wired = false;
  /** Index whose panel a pending hover-intent open will reveal. */
  #pendingIndex = -1;
  #intent: HoverIntent = hoverIntent({
    isOpen: () => this.#activeIndex >= 0,
    open: () => this.#open(this.#pendingIndex),
    close: () => this.#close(),
    openDelay: () => this.#delay,
    closeDelay: () => this.#delay,
  });

  get #delay() {
    return Number(this.getAttribute("delay") ?? 200);
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  disconnectedCallback() {
    this.#intent.cancel();
  }

  #wire() {
    this.#wired = true;
    const list = this.querySelector<HTMLElement>("ui-nav-list") ?? this;
    // Items without a trigger cannot participate at all — dropping them here
    // keeps `NavItem.trigger` honestly non-null for everything downstream.
    this.#items = [...this.querySelectorAll<HTMLElement>("ui-nav-item")].flatMap((item) => {
      const trigger = item.querySelector<HTMLElement>("[data-nav-trigger]");
      const content = item.querySelector<HTMLElement>("ui-nav-content");
      return trigger ? [{ trigger, content }] : [];
    });

    this.#items.forEach(({ trigger, content }, i) => {
      if (!trigger.id) trigger.id = nextId("ui-nav-trigger");
      trigger.setAttribute("aria-expanded", "false");
      if (content) {
        if (!content.id) content.id = nextId("ui-nav-content");
        trigger.setAttribute("aria-controls", content.id);
        content.setAttribute("role", "region");
        content.setAttribute("aria-labelledby", trigger.id);
        content.hidden = true;
        setOpenState(content, false);
        content.addEventListener("pointerenter", this.#cancelClose);
        content.addEventListener("keydown", this.#onContentKeydown);
      }
      trigger.addEventListener("click", () => this.#toggle(i));
      trigger.addEventListener("keydown", (e) => this.#onTriggerKeydown(e, i));
      trigger.addEventListener("pointerenter", () => this.#onTriggerEnter(i));
    });

    this.#roving = roving(list, {
      items: () => this.#triggers(),
      orientation: "horizontal",
      loop: true,
    });
    this.#roving.refresh(0);

    this.addEventListener("pointerenter", this.#cancelClose);
    this.addEventListener("pointerleave", this.#scheduleClose);
  }

  #triggers() {
    return this.#items.map((it) => it.trigger).filter((t) => !t.hasAttribute("disabled"));
  }

  // ---- open / close ----------------------------------------------------
  #open(index: number) {
    const { trigger, content } = this.#items[index] ?? {};
    if (!trigger || !content) return;
    if (this.#activeIndex >= 0 && this.#activeIndex !== index) this.#hide(this.#activeIndex);
    this.#activeIndex = index;
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
        detail: { index, value: trigger.textContent?.trim() ?? "" },
      }),
    );
  }

  #hide(index: number) {
    const { trigger, content } = this.#items[index] ?? {};
    if (!trigger || !content) return;
    trigger.setAttribute("aria-expanded", "false");
    content.removeAttribute("data-open");
    runExit(content, () => {
      if (!content.hasAttribute("data-open")) content.hidden = true;
    });
  }

  #close(restoreFocus = false) {
    if (this.#activeIndex < 0) return;
    const index = this.#activeIndex;
    this.#activeIndex = -1;
    this.#hide(index);
    this.removeAttribute("data-open");
    if (restoreFocus) this.#items[index]?.trigger?.focus();
  }

  #toggle(index: number) {
    if (this.#activeIndex === index) this.#close();
    else this.#open(index);
  }

  // ---- intent ----------------------------------------------------------
  #onTriggerEnter(index: number) {
    this.#intent.cancelClose();
    // Cancel any pending open from an earlier trigger so a fast hover sweep
    // doesn't queue several opens (which would flash panels or open one after
    // the pointer has already left).
    this.#intent.cancelOpen();
    if (this.#activeIndex >= 0) {
      this.#open(index); // already browsing — switch instantly
    } else {
      this.#pendingIndex = index;
      this.#intent.scheduleOpen();
    }
  }
  #cancelClose = () => this.#intent.cancelClose();
  #scheduleClose = () => this.#intent.scheduleClose();

  // ---- keyboard --------------------------------------------------------
  #onTriggerKeydown = (e: KeyboardEvent, index: number) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.#open(index);
      const content = this.#items[index]?.content;
      if (content) getFocusable(content)[0]?.focus();
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

export class UINavList extends HTMLElement {}
export class UINavItem extends HTMLElement {}
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
