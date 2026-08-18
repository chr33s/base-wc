/**
 * `ui-accordion` — a set of collapsible sections (Base UI's Accordion). Each
 * item's trigger carries `aria-expanded` + `aria-controls`; its content is a
 * `role="region"` labelled by the trigger, hidden when closed, with a
 * `data-state` hook for height animation. `single` by default (opening one
 * closes the others); add `multiple` for independent sections. Per APG the
 * headers are all in the tab order and Arrow/Home/End move focus between them.
 *
 * Markup: `<ui-accordion-item>`s, each with a `[data-accordion-trigger]` and a
 * `[data-accordion-content]`.
 */
import { connectLightDom } from "./lifecycle.ts";
import { nextId } from "./id.ts";

export class UIAccordion extends HTMLElement {
  #wired = false;

  get multiple(): boolean {
    return this.hasAttribute("multiple");
  }
  get value(): string | string[] | null {
    const open = this.#items()
      .filter((item) => item.open)
      .map((item) => item.value);
    return this.multiple ? open : (open[0] ?? null);
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    this.#wired = true;
    for (const item of this.#items()) {
      const trigger = item.querySelector<HTMLElement>("[data-accordion-trigger]");
      const content = item.querySelector<HTMLElement>("[data-accordion-content]");
      if (!trigger || !content) continue;
      if (!trigger.id) trigger.id = nextId("ui-accordion-trigger");
      if (!content.id) content.id = nextId("ui-accordion-content");
      trigger.setAttribute("aria-controls", content.id);
      content.setAttribute("role", "region");
      content.setAttribute("aria-labelledby", trigger.id);
      trigger.addEventListener("click", () => this.#toggle(item));
      trigger.addEventListener("keydown", this.#onKeydown);
    }

    // Single mode: never allow more than one open from the initial markup.
    if (!this.multiple) {
      this.#items()
        .filter((item) => item.open)
        .slice(1)
        .forEach((item) => item.toggleAttribute("open", false));
    }
    for (const item of this.#items()) this.#syncItem(item);
  }

  #items(): UIAccordionItem[] {
    return [...this.querySelectorAll<UIAccordionItem>("ui-accordion-item")];
  }
  #triggers(): HTMLElement[] {
    return this.#items()
      .map((item) => item.querySelector<HTMLElement>("[data-accordion-trigger]"))
      .filter((el): el is HTMLElement => el != null);
  }

  #syncItem(item: UIAccordionItem) {
    const trigger = item.querySelector<HTMLElement>("[data-accordion-trigger]");
    const content = item.querySelector<HTMLElement>("[data-accordion-content]");
    const state = item.open ? "open" : "closed";
    trigger?.setAttribute("aria-expanded", String(item.open));
    item.setAttribute("data-state", state);
    if (content) {
      content.toggleAttribute("hidden", !item.open);
      content.setAttribute("data-state", state);
    }
  }

  #toggle(item: UIAccordionItem) {
    const willOpen = !item.open;
    if (!this.multiple) {
      for (const other of this.#items()) {
        if (other !== item && other.open) {
          other.toggleAttribute("open", false);
          this.#syncItem(other);
        }
      }
    }
    item.toggleAttribute("open", willOpen);
    this.#syncItem(item);
    this.dispatchEvent(new CustomEvent("change", { bubbles: true, detail: { value: this.value } }));
  }

  #onKeydown = (e: KeyboardEvent) => {
    const triggers = this.#triggers();
    const i = triggers.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    let target = -1;
    if (e.key === "ArrowDown") target = (i + 1) % triggers.length;
    else if (e.key === "ArrowUp") target = (i - 1 + triggers.length) % triggers.length;
    else if (e.key === "Home") target = 0;
    else if (e.key === "End") target = triggers.length - 1;
    if (target >= 0) {
      e.preventDefault();
      triggers[target].focus();
    }
  };
}

export class UIAccordionItem extends HTMLElement {
  get open(): boolean {
    return this.hasAttribute("open");
  }
  get value(): string {
    const siblings = [...(this.parentElement?.querySelectorAll("ui-accordion-item") ?? [])];
    return this.getAttribute("value") ?? String(siblings.indexOf(this));
  }
}

if (!customElements.get("ui-accordion")) customElements.define("ui-accordion", UIAccordion);
if (!customElements.get("ui-accordion-item"))
  customElements.define("ui-accordion-item", UIAccordionItem);

declare global {
  interface HTMLElementTagNameMap {
    "ui-accordion": UIAccordion;
    "ui-accordion-item": UIAccordionItem;
  }
}
