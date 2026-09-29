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
import { LightDomElement } from "./lifecycle.ts";
import { define } from "./define.ts";
import { nextId } from "./id.ts";
import { scopedQuery } from "./query.ts";
import { resolveNavKey } from "./roving.ts";
import { syncDisclosure } from "./collapsible.ts";

/** The accordion host: owns single/multiple open policy and header keyboard navigation. */
export class UIAccordion extends LightDomElement {
  /** Whether several items may be open at once (`multiple` attribute). */
  get multiple(): boolean {
    return this.hasAttribute("multiple");
  }
  /** Open item values: an array in `multiple` mode, else the single open value or `null`. */
  get value(): string[] | string | null {
    const open = this.#items()
      .filter((item) => item.open)
      .map((item) => item.value);
    return this.multiple ? open : (open[0] ?? null);
  }

  protected override initialize() {
    // Only wire once at least one complete trigger+content pair exists, so a
    // wiring pass that beats the parser sees connectLightDom retry on the next
    // light-DOM mutation instead of silently claiming an empty host.
    const pairs = this.#items()
      .map((item) => ({ item, ...this.#parts(item) }))
      .filter((pair) => pair.trigger && pair.content);
    if (pairs.length === 0) return false;

    for (const { item, trigger, content } of pairs) {
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
    return true;
  }

  // Child queries are scoped so an accordion nested inside an item's content
  // keeps ownership of its own items, triggers, and contents.
  #items() {
    return scopedQuery<UIAccordionItem>(this, "ui-accordion-item");
  }
  #parts(item: UIAccordionItem) {
    return {
      trigger: scopedQuery(item, "[data-accordion-trigger]")[0] ?? null,
      content: scopedQuery(item, "[data-accordion-content]")[0] ?? null,
    };
  }
  #triggers() {
    return this.#items()
      .map((item) => this.#parts(item).trigger)
      .filter((el): el is HTMLElement => el != null);
  }

  #syncItem(item: UIAccordionItem) {
    const { trigger, content } = this.#parts(item);
    syncDisclosure(trigger, content, item, item.open);
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
    const current = triggers.findIndex((trigger) => trigger === document.activeElement);
    if (current < 0) return;
    const target = resolveNavKey(e.key, triggers.length, current, {
      orientation: "vertical",
      loop: true,
    });
    if (target !== null) {
      e.preventDefault();
      triggers[target]?.focus();
    }
  };
}

/** One collapsible section; `open` reflects its expanded state. */
export class UIAccordionItem extends HTMLElement {
  /** Whether the item is expanded (`open` attribute). */
  get open(): boolean {
    return this.hasAttribute("open");
  }
  /** The `value` attribute, or the item's index among the owning accordion's items. */
  get value(): string {
    const explicit = this.getAttribute("value");
    if (explicit != null) return explicit;
    // Fall back to the index within the owning accordion's own items (nested
    // accordions' items and wrapper elements must not shift the numbering).
    const owner = this.closest("ui-accordion");
    const items = owner ? scopedQuery(owner, "ui-accordion-item") : [this];
    return String(items.indexOf(this));
  }
}

define("ui-accordion", UIAccordion);
define("ui-accordion-item", UIAccordionItem);

declare global {
  interface HTMLElementTagNameMap {
    "ui-accordion": UIAccordion;
    "ui-accordion-item": UIAccordionItem;
  }
}
