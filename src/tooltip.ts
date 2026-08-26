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
import { connectLightDom } from "./lifecycle.ts";
import { nextId } from "./id.ts";
import { closeGroup, hoverIntent, type HoverIntent, isGroupWarm, openGroup } from "./intent.ts";
import { overlay, type Overlay } from "./overlay.ts";

export class UITooltip extends HTMLElement {
  #trigger: HTMLElement | null = null;
  #content: HTMLElement | null = null;
  #arrow: HTMLElement | null = null;
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
    this.#trigger = this.querySelector<HTMLElement>("[data-tooltip-trigger]");
    this.#content = this.querySelector<HTMLElement>("ui-tooltip-content");
    if (!this.#trigger || !this.#content) return;
    this.#wired = true;
    this.#arrow = this.#content.querySelector<HTMLElement>("ui-arrow");

    if (!this.#content.id) this.#content.id = nextId("ui-tooltip");
    this.#trigger.setAttribute("aria-describedby", this.#content.id);
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
    this.#trigger.addEventListener("pointerenter", () => this.#intent?.scheduleOpen());
    this.#trigger.addEventListener("pointerleave", () => this.#intent?.scheduleClose());
    this.#trigger.addEventListener("focus", () => this.#intent?.openNow());
    this.#trigger.addEventListener("blur", () => this.#intent?.closeNow());
    this.#trigger.addEventListener("keydown", this.#onKeydown);

    this.#overlay = overlay(this.#content, {
      anchor: {
        ref: () => this.#trigger,
        options: { offset: 6, padding: 8, arrow: this.#arrow },
        pair: "tooltip",
      },
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

  #open() {
    if (!this.#overlay?.show()) return;
    openGroup(this.#group);
  }

  #close() {
    if (!this.#overlay?.hide()) return;
    closeGroup(this.#group, this.#skipDelay);
  }
}

export class UITooltipContent extends HTMLElement {
  connectedCallback() {
    this.setAttribute("role", "tooltip");
    this.setAttribute("popover", "manual");
  }
}

define("ui-tooltip", UITooltip);
define("ui-tooltip-content", UITooltipContent);

declare global {
  interface HTMLElementTagNameMap {
    "ui-tooltip": UITooltip;
    "ui-tooltip-content": UITooltipContent;
  }
}
