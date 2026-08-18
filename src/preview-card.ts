/**
 * `ui-preview-card` — a hover-intent rich card / hover-card (Base UI's Preview
 * Card). Like a tooltip, it opens on hover/focus of its trigger after an intent
 * delay, but its content is **interactive**: moving the pointer from the trigger
 * into the card keeps it open, and it only closes once the pointer has left both
 * (after a close delay). Shares the delay-group cooldown ({@link intent}) and
 * reuses {@link anchor} positioning + the Popover-API top layer.
 *
 * Markup: a `[data-preview-trigger]` and a `<ui-preview-card-content>`.
 */
import { connectLightDom } from "./lifecycle.ts";
import { SUPPORTS_ANCHOR } from "./anchor.ts";
import { nextId } from "./id.ts";
import { closeGroup, isGroupWarm, openGroup } from "./intent.ts";
import { overlay, type Overlay } from "./overlay.ts";

export class UIPreviewCard extends HTMLElement {
  #trigger: HTMLElement | null = null;
  #content: HTMLElement | null = null;
  #wired = false;
  #isOpen = false;
  #openTimer = 0;
  #closeTimer = 0;
  #overlay: Overlay | null = null;
  /**
   * Guard against opening from a `pointerenter` the browser fires when the
   * trigger renders *under* a resting cursor (e.g. on mount / re-render) — that
   * is not an intentional hover. We disarm while the pointer is already over the
   * trigger at wire time and re-arm once it has actually left.
   */
  #armed = true;

  get open(): boolean {
    return this.#isOpen;
  }
  get #group(): string | null {
    return this.getAttribute("group");
  }
  get #delay(): number {
    return Number(this.getAttribute("delay") ?? 600);
  }
  get #closeDelay(): number {
    return Number(this.getAttribute("close-delay") ?? 300);
  }
  get #skipDelay(): number {
    return Number(this.getAttribute("skip-delay") ?? 300);
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    this.#trigger = this.querySelector<HTMLElement>("[data-preview-trigger]");
    this.#content = this.querySelector<HTMLElement>("ui-preview-card-content");
    if (!this.#trigger || !this.#content) return;
    this.#wired = true;

    if (!this.#content.id) this.#content.id = nextId("ui-preview-card");
    this.#trigger.setAttribute("aria-expanded", "false");
    this.#trigger.setAttribute("aria-controls", this.#content.id);
    // If the trigger mounts under a resting cursor, ignore opens until it leaves.
    this.#armed = !this.#trigger.matches(":hover");

    // Opening intent comes from the trigger; the card only *keeps* the card open.
    this.#trigger.addEventListener("pointerenter", this.#scheduleOpen);
    this.#trigger.addEventListener("focus", this.#openNow);
    this.#trigger.addEventListener("keydown", this.#onKeydown);
    for (const part of [this.#trigger, this.#content]) {
      part.addEventListener("pointerenter", this.#cancelClose);
      part.addEventListener("pointerleave", this.#scheduleClose);
    }
    this.#content.addEventListener("keydown", this.#onKeydown);
    // Close once keyboard focus leaves both the trigger and the (interactive)
    // card — without this a card opened by tabbing onto the trigger would stay
    // open forever after tabbing away. Focus moving between the two is kept.
    this.addEventListener("focusout", this.#onFocusOut);

    if (SUPPORTS_ANCHOR) {
      const name = `--preview-${nextId("anchor")}`;
      this.#trigger.style.setProperty("anchor-name", name);
      this.#content.style.setProperty("position-anchor", name);
    }

    this.#overlay = overlay(this.#content, {
      anchor: { ref: () => this.#trigger, options: { offset: 6, padding: 8 } },
    });
  }

  disconnectedCallback() {
    clearTimeout(this.#openTimer);
    clearTimeout(this.#closeTimer);
    this.#close();
  }

  #scheduleOpen = () => {
    clearTimeout(this.#closeTimer);
    if (this.#isOpen || !this.#armed) return;
    const delay = isGroupWarm(this.#group) ? 0 : this.#delay;
    this.#openTimer = window.setTimeout(() => this.#open(), delay);
  };

  #cancelClose = () => {
    clearTimeout(this.#closeTimer);
  };

  #scheduleClose = () => {
    this.#armed = true; // the pointer has left → future enters are intentional
    clearTimeout(this.#openTimer);
    if (!this.#isOpen) return;
    this.#closeTimer = window.setTimeout(() => this.#close(), this.#closeDelay);
  };

  #openNow = () => {
    clearTimeout(this.#closeTimer);
    this.#open();
  };

  #onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.#close();
  };

  #onFocusOut = (e: FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && this.contains(next)) return; // focus stayed within trigger/card
    this.#close();
  };

  #open() {
    if (this.#isOpen || !this.#content || !this.#trigger) return;
    this.#isOpen = true;
    this.#trigger.setAttribute("aria-expanded", "true");
    this.#overlay?.show();
    openGroup(this.#group);
    this.dispatchEvent(new CustomEvent("open", { bubbles: true }));
  }

  #close() {
    if (!this.#isOpen || !this.#content) return;
    this.#isOpen = false;
    this.#trigger?.setAttribute("aria-expanded", "false");
    this.#overlay?.hide();
    closeGroup(this.#group, this.#skipDelay);
    this.dispatchEvent(new CustomEvent("close", { bubbles: true }));
  }
}

export class UIPreviewCardContent extends HTMLElement {
  connectedCallback() {
    this.setAttribute("popover", "manual");
  }
}

if (!customElements.get("ui-preview-card")) customElements.define("ui-preview-card", UIPreviewCard);
if (!customElements.get("ui-preview-card-content"))
  customElements.define("ui-preview-card-content", UIPreviewCardContent);

declare global {
  interface HTMLElementTagNameMap {
    "ui-preview-card": UIPreviewCard;
    "ui-preview-card-content": UIPreviewCardContent;
  }
}
