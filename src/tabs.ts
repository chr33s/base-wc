/**
 * `ui-tabs` — a tab list with associated panels (Base UI's Tabs). The list is
 * `role="tablist"` with one roving tab stop (via {@link roving}); tabs are
 * `role="tab"` cross-referencing their `role="tabpanel"` by `aria-controls` /
 * `aria-labelledby` — a light-DOM relationship. Activation is `automatic`
 * (selection follows arrow focus) by default, or `manual` (Enter/Space to
 * select). Orientation picks the arrow axis.
 *
 * Markup: a `<ui-tab-list>` of `[data-tab value]` buttons and sibling
 * `[data-tab-panel value]` elements.
 */
import { connectLightDom } from "./lifecycle.ts";
import { define } from "./define.ts";
import { nextId } from "./id.ts";
import { scopedQuery } from "./query.ts";
import { roving, type Roving } from "./roving.ts";

export class UITabs extends HTMLElement {
  #list: HTMLElement | null = null;
  #roving: Roving | null = null;
  #wired = false;

  get value() {
    return this.#selectedTab()?.getAttribute("value") ?? null;
  }
  set value(next: string | null) {
    const tab = this.#tabs().find((t) => t.getAttribute("value") === next);
    if (tab) this.#select(tab, false);
  }
  get orientation() {
    return this.getAttribute("orientation") === "vertical" ? "vertical" : "horizontal";
  }
  get #automatic() {
    return this.getAttribute("activation") !== "manual";
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#wired,
      () => this.#wire(),
    );
  }

  #wire() {
    // Only wire once at least one tab exists, so a wiring pass that beats the
    // parser sees connectLightDom retry on the next light-DOM mutation instead
    // of silently claiming an empty host.
    if (this.#tabs().length === 0) return;
    this.#wired = true;
    this.#list = scopedQuery(this, "ui-tab-list, [data-tab-list]")[0] ?? null;
    this.#list?.setAttribute("role", "tablist");
    this.#list?.setAttribute("aria-orientation", this.orientation);

    for (const tab of this.#tabs()) {
      tab.setAttribute("role", "tab");
      if (!tab.id) tab.id = nextId("ui-tab");
      const panel = this.#panelFor(tab.getAttribute("value"));
      if (panel) {
        if (!panel.id) panel.id = nextId("ui-tab-panel");
        tab.setAttribute("aria-controls", panel.id);
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", tab.id);
        panel.tabIndex = 0;
      }
    }

    const container = this.#list ?? this;
    this.#roving = roving(container, {
      items: () => this.#navTabs(),
      orientation: this.orientation,
      loop: true,
      onMove: (tab) => {
        if (this.#automatic) this.#select(tab, true);
      },
      onActivate: (tab) => this.#select(tab, true),
    });
    container.addEventListener("click", this.#onClick);

    const preset = this.getAttribute("value");
    const initial =
      this.#tabs().find((t) => t.getAttribute("value") === preset) ??
      this.#navTabs()[0] ??
      this.#tabs()[0];
    if (initial) this.#select(initial, false);
  }

  // Child queries are scoped so a `ui-tabs` nested inside a panel keeps
  // ownership of its own tabs and panels.
  #tabs() {
    return scopedQuery(this, "[data-tab]");
  }
  #navTabs() {
    return this.#tabs().filter((t) => !t.hasAttribute("disabled"));
  }
  #panels() {
    return scopedQuery(this, "[data-tab-panel]");
  }
  #panelFor(value: string | null) {
    return this.#panels().find((p) => p.getAttribute("value") === value);
  }
  #selectedTab() {
    return this.#tabs().find((t) => t.getAttribute("aria-selected") === "true") ?? null;
  }

  #select(tab: HTMLElement, emit: boolean) {
    if (tab.hasAttribute("disabled")) return;
    const value = tab.getAttribute("value");
    for (const t of this.#tabs()) t.setAttribute("aria-selected", String(t === tab));
    for (const panel of this.#panels()) {
      panel.toggleAttribute("hidden", panel.getAttribute("value") !== value);
    }
    const index = this.#navTabs().indexOf(tab);
    if (index >= 0) this.#roving?.refresh(index);
    if (emit) this.dispatchEvent(new CustomEvent("change", { bubbles: true, detail: { value } }));
  }

  #onClick = (e: MouseEvent) => {
    const tab = (e.target as Element).closest("[data-tab]") as HTMLElement | null;
    if (tab?.closest("ui-tabs") !== this) return; // a nested ui-tabs owns this tab
    if (tab && !tab.hasAttribute("disabled")) {
      tab.focus();
      this.#select(tab, true);
    }
  };
}

export class UITabList extends HTMLElement {}

define("ui-tabs", UITabs);
define("ui-tab-list", UITabList);

declare global {
  interface HTMLElementTagNameMap {
    "ui-tabs": UITabs;
    "ui-tab-list": UITabList;
  }
}
