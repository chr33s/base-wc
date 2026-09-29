/**
 * `ui-tooltip` — a hover/focus tooltip (Base UI's Tooltip). Non-focusable
 * supplementary text anchored to a trigger and wired as its `aria-describedby`.
 * Pointer hover opens after an intent delay (instant on keyboard focus) and
 * closes after a short close delay; `Escape` dismisses. The timer state machine
 * is the shared {@link hoverIntent}; delay is shared across a named `group` via
 * {@link isGroupWarm} so adjacent tooltips open instantly once one has. Reuses
 * {@link overlay} for CSS anchor pairing, {@link anchor} positioning and the
 * Popover-API top layer.
 *
 * Markup: a `[data-tooltip-trigger]` and a `<ui-tooltip-content>`.
 */
import { define } from "./define.ts";
import { HoverCardElement } from "./hover-card.ts";
import { nextId } from "./id.ts";
import { overlay } from "./overlay.ts";
import { UIPopupElement } from "./popup.ts";
import { queryPair } from "./query.ts";

/** Hover/focus tooltip: `[data-tooltip-trigger]` described by a `<ui-tooltip-content>`. */
export class UITooltip extends HoverCardElement {
  #arrow: HTMLElement | null = null;

  protected override parts(): readonly [HTMLElement, HTMLElement] | null {
    return queryPair(this, "[data-tooltip-trigger]", "ui-tooltip-content");
  }

  protected override prepare(trigger: HTMLElement, content: HTMLElement) {
    this.#arrow = content.querySelector<HTMLElement>("ui-arrow");
    if (!content.id) content.id = nextId("ui-tooltip");
    trigger.setAttribute("aria-describedby", content.id);
  }

  protected override listen(trigger: HTMLElement) {
    // A tooltip's content is not interactive, so the pointer leaving the
    // trigger is enough to close it — nothing to move into.
    trigger.addEventListener("pointerenter", () => this.intent?.scheduleOpen());
    trigger.addEventListener("pointerleave", () => this.intent?.scheduleClose());
    trigger.addEventListener("focus", () => this.intent?.openNow());
    trigger.addEventListener("blur", () => this.intent?.closeNow());
    trigger.addEventListener("keydown", this.onEscape);
  }

  protected override createOverlay(trigger: HTMLElement, content: HTMLElement) {
    return overlay(content, {
      anchor: {
        ref: () => trigger,
        options: { arrow: this.#arrow },
        pair: "tooltip",
      },
      events: this,
    });
  }
}

/** Custom element `ui-tooltip-content`: the non-focusable `role="tooltip"` surface. */
export class UITooltipContent extends UIPopupElement {
  static override role = "tooltip";
}

define("ui-tooltip", UITooltip);
define("ui-tooltip-content", UITooltipContent);

declare global {
  interface HTMLElementTagNameMap {
    "ui-tooltip": UITooltip;
    "ui-tooltip-content": UITooltipContent;
  }
}
