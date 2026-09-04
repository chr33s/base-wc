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
import { HoverCardElement } from "./hover-card.ts";
import { overlay } from "./overlay.ts";
import { UIPopupElement } from "./popup.ts";

export class UIPreviewCard extends HoverCardElement {
  protected override parts() {
    const trigger = this.querySelector<HTMLElement>("[data-preview-trigger]");
    const content = this.querySelector<HTMLElement>("ui-preview-card-content");
    return trigger && content ? ([trigger, content] as const) : null;
  }

  protected override listen(trigger: HTMLElement, content: HTMLElement) {
    // Opening intent comes from the trigger; the card only *keeps* it open.
    trigger.addEventListener("pointerenter", () => this.intent?.scheduleOpen());
    trigger.addEventListener("focus", () => this.intent?.openNow());
    trigger.addEventListener("keydown", this.onEscape);
    for (const part of [trigger, content]) {
      part.addEventListener("pointerenter", () => this.intent?.cancelClose());
      part.addEventListener("pointerleave", () => this.intent?.scheduleClose());
    }
    content.addEventListener("keydown", this.onEscape);
    // Close once keyboard focus leaves both the trigger and the (interactive)
    // card — without this a card opened by tabbing onto the trigger would stay
    // open forever after tabbing away. Focus moving between the two is kept.
    this.addEventListener("focusout", this.#onFocusOut);
  }

  protected override createOverlay(trigger: HTMLElement, content: HTMLElement) {
    return overlay(content, {
      anchor: { ref: () => trigger, options: { offset: 6, padding: 8 }, pair: "preview" },
      trigger: { element: trigger, controls: "ui-preview-card" },
      events: this,
    });
  }

  #onFocusOut = (e: FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && this.contains(next)) return; // focus stayed within trigger/card
    this.hide();
  };
}

export class UIPreviewCardContent extends UIPopupElement {}

define("ui-preview-card", UIPreviewCard);
define("ui-preview-card-content", UIPreviewCardContent);

declare global {
  interface HTMLElementTagNameMap {
    "ui-preview-card": UIPreviewCard;
    "ui-preview-card-content": UIPreviewCardContent;
  }
}
