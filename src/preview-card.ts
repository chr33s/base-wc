/**
 * `ui-preview-card` — a hover-intent rich card / hover-card (Base UI's Preview
 * Card). Like a tooltip, it opens on hover/focus of its trigger after an intent
 * delay, but its content is **interactive**: moving the pointer from the trigger
 * into the card keeps it open, and it only closes once the pointer has left both
 * (after a close delay). The timer state machine is the shared
 * {@link hoverIntent}; what stays here is only the content-cancels-close wiring
 * and the focusout policy. Shares the delay-group cooldown ({@link intent}) and
 * reuses {@link overlay} for CSS anchor pairing, {@link anchor} positioning and
 * the Popover-API top layer.
 *
 * Markup: a `[data-preview-trigger]` and a `<ui-preview-card-content>`.
 */
import { define } from "./define.ts";
import { connectLightDom } from "./lifecycle.ts";
import { closeGroup, hoverIntent, type HoverIntent, isGroupWarm, openGroup } from "./intent.ts";
import { overlay, type Overlay } from "./overlay.ts";

export class UIPreviewCard extends HTMLElement {
  #trigger: HTMLElement | null = null;
  #content: HTMLElement | null = null;
  #wired = false;
  #overlay: Overlay | null = null;
  #intent: HoverIntent | null = null;

  get open() {
    return this.#overlay?.open ?? false;
  }
  get #group() {
    return this.getAttribute("group");
  }
  get #delay() {
    return Number(this.getAttribute("delay") ?? 600);
  }
  get #closeDelay() {
    return Number(this.getAttribute("close-delay") ?? 300);
  }
  get #skipDelay() {
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

    this.#intent = hoverIntent({
      isOpen: () => this.open,
      open: () => this.#open(),
      close: () => this.#close(),
      openDelay: () => this.#delay,
      closeDelay: () => this.#closeDelay,
      warm: () => isGroupWarm(this.#group),
      // If the trigger mounts under a resting cursor, ignore opens until it leaves.
      armed: !this.#trigger.matches(":hover"),
    });

    // Opening intent comes from the trigger; the card only *keeps* the card open.
    this.#trigger.addEventListener("pointerenter", () => this.#intent?.scheduleOpen());
    this.#trigger.addEventListener("focus", () => this.#intent?.openNow());
    this.#trigger.addEventListener("keydown", this.#onKeydown);
    for (const part of [this.#trigger, this.#content]) {
      part.addEventListener("pointerenter", () => this.#intent?.cancelClose());
      part.addEventListener("pointerleave", () => this.#intent?.scheduleClose());
    }
    this.#content.addEventListener("keydown", this.#onKeydown);
    // Close once keyboard focus leaves both the trigger and the (interactive)
    // card — without this a card opened by tabbing onto the trigger would stay
    // open forever after tabbing away. Focus moving between the two is kept.
    this.addEventListener("focusout", this.#onFocusOut);

    this.#overlay = overlay(this.#content, {
      anchor: { ref: () => this.#trigger, options: { offset: 6, padding: 8 }, pair: "preview" },
      trigger: { element: this.#trigger, controls: "ui-preview-card" },
      events: this,
    });
  }

  disconnectedCallback() {
    this.#intent?.cancel();
    this.#close();
  }

  #onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.#close();
  };

  #onFocusOut = (e: FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && this.contains(next)) return; // focus stayed within trigger/card
    this.#close();
  };

  #open() {
    if (!this.#overlay?.show()) return;
    openGroup(this.#group);
  }

  #close() {
    if (!this.#overlay?.hide()) return;
    closeGroup(this.#group, this.#skipDelay);
  }
}

export class UIPreviewCardContent extends HTMLElement {
  connectedCallback() {
    this.setAttribute("popover", "manual");
  }
}

define("ui-preview-card", UIPreviewCard);
define("ui-preview-card-content", UIPreviewCardContent);

declare global {
  interface HTMLElementTagNameMap {
    "ui-preview-card": UIPreviewCard;
    "ui-preview-card-content": UIPreviewCardContent;
  }
}
