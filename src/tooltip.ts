/**
 * `ui-tooltip` — a hover/focus tooltip (Base UI's Tooltip). Non-focusable
 * supplementary text anchored to a trigger and wired as its `aria-describedby`.
 * Pointer hover opens after an intent delay (instant on keyboard focus) and
 * closes after a short close delay; `Escape` dismisses. Delay is shared across a
 * named `group` via {@link isGroupWarm} so adjacent tooltips open instantly once
 * one has. Reuses {@link anchor} positioning and the Popover-API top layer.
 *
 * Markup: a `[data-tooltip-trigger]` and a `<ui-tooltip-content>`.
 */
import { connectLightDom } from "./lifecycle.ts";
import { SUPPORTS_ANCHOR } from "./anchor.ts";
import { nextId } from "./id.ts";
import { closeGroup, isGroupWarm, openGroup } from "./intent.ts";
import { overlay, type Overlay } from "./overlay.ts";

export class UITooltip extends HTMLElement {
  #trigger: HTMLElement | null = null;
  #content: HTMLElement | null = null;
  #arrow: HTMLElement | null = null;
  #wired = false;
  #isOpen = false;
  #openTimer = 0;
  #closeTimer = 0;
  #overlay: Overlay | null = null;
  /**
   * Guard against opening from a `pointerenter` the browser fires when the
   * trigger renders *under* a resting cursor (mount / re-render) rather than an
   * intentional hover. Disarmed while already hovered at wire time; re-armed once
   * the pointer actually leaves.
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
    this.#trigger = this.querySelector<HTMLElement>("[data-tooltip-trigger]");
    this.#content = this.querySelector<HTMLElement>("ui-tooltip-content");
    if (!this.#trigger || !this.#content) return;
    this.#wired = true;
    this.#arrow = this.#content.querySelector<HTMLElement>("ui-arrow");

    if (!this.#content.id) this.#content.id = nextId("ui-tooltip");
    this.#trigger.setAttribute("aria-describedby", this.#content.id);
    // If the trigger mounts under a resting cursor, ignore opens until it leaves.
    this.#armed = !this.#trigger.matches(":hover");
    this.#trigger.addEventListener("pointerenter", this.#scheduleOpen);
    this.#trigger.addEventListener("pointerleave", this.#scheduleClose);
    this.#trigger.addEventListener("focus", this.#openNow);
    this.#trigger.addEventListener("blur", this.#closeNow);
    this.#trigger.addEventListener("keydown", this.#onKeydown);

    if (SUPPORTS_ANCHOR) {
      const name = `--tooltip-${nextId("anchor")}`;
      this.#trigger.style.setProperty("anchor-name", name);
      this.#content.style.setProperty("position-anchor", name);
    }

    this.#overlay = overlay(this.#content, {
      anchor: {
        ref: () => this.#trigger,
        options: { offset: 6, padding: 8, arrow: this.#arrow },
      },
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

  #closeNow = () => {
    clearTimeout(this.#openTimer);
    this.#close();
  };

  #onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.#close();
  };

  #open() {
    if (this.#isOpen || !this.#content || !this.#trigger) return;
    this.#isOpen = true;
    this.#overlay?.show();
    openGroup(this.#group);
    this.dispatchEvent(new CustomEvent("open", { bubbles: true }));
  }

  #close() {
    if (!this.#isOpen || !this.#content) return;
    this.#isOpen = false;
    this.#overlay?.hide();
    closeGroup(this.#group, this.#skipDelay);
    this.dispatchEvent(new CustomEvent("close", { bubbles: true }));
  }
}

export class UITooltipContent extends HTMLElement {
  connectedCallback() {
    this.setAttribute("role", "tooltip");
    this.setAttribute("popover", "manual");
  }
}

if (!customElements.get("ui-tooltip")) customElements.define("ui-tooltip", UITooltip);
if (!customElements.get("ui-tooltip-content"))
  customElements.define("ui-tooltip-content", UITooltipContent);

declare global {
  interface HTMLElementTagNameMap {
    "ui-tooltip": UITooltip;
    "ui-tooltip-content": UITooltipContent;
  }
}
