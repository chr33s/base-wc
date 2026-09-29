/**
 * `ui-tabs` — a tab list with associated panels (Base UI's Tabs). The list is
 * `role="tablist"` with one roving tab stop (via {@link roving}); tabs are
 * `role="tab"` cross-referencing their `role="tabpanel"` by `aria-controls` /
 * `aria-labelledby` — a light-DOM relationship. Activation is `automatic`
 * (selection follows arrow focus) by default, or `manual` (Enter/Space to
 * select). Orientation picks the arrow axis.
 *
 * An optional `<ui-tab-indicator>` (or `[data-tab-indicator]`) inside the list
 * is positioned over the selected tab by publishing `--active-tab-left` /
 * `-right` / `-top` / `-bottom` / `-width` / `-height` on it, plus
 * `data-orientation` and `data-activation-direction` — the same headless split
 * as anchor positioning: this element measures, consumer CSS draws.
 *
 * Markup: a `<ui-tab-list>` of `[data-tab value]` buttons and sibling
 * `[data-tab-panel value]` elements.
 */
import { define } from "./define.ts";
import { nextId } from "./id.ts";
import { closestFrom } from "./internal/closest.ts";
import { scopedQuery } from "./query.ts";
import type { ChangeNotification } from "./reasons.ts";
import { RovingElement, type RovingOptions } from "./roving.ts";

/** Direction the selection moved in, for enter/exit animations. */
export type TabActivationDirection = "left" | "right" | "up" | "down" | "none";

// `offsetLeft`/`offsetTop` are rounded to whole pixels and the error compounds
// across the offset-parent chain, so agreement with the rect-based offset is
// only ever checked to within this many pixels.
const MAX_LAYOUT_ROUNDING_ERROR = 2;

/** Tabbed interface: roving `[data-tab]` triggers, `[data-tab-panel]` panels, optional indicator. */
export class UITabs extends RovingElement {
  #list: HTMLElement | null = null;
  #indicator: HTMLElement | null = null;
  #resize: ResizeObserver | null = null;
  /** Index of the previously selected tab, for `data-activation-direction`. */
  #previousIndex = -1;

  /** `value` of the selected tab, or `null`. Setting selects the matching tab without emitting `change`. */
  get value(): string | null {
    return this.#selectedTab()?.getAttribute("value") ?? null;
  }
  set value(next: string | null) {
    const tab = this.#tabs().find((t) => t.getAttribute("value") === next);
    if (tab) this.#select(tab, "silent");
  }
  /** Tab-list axis from the `orientation` attribute. */
  get orientation(): "horizontal" | "vertical" {
    return this.getAttribute("orientation") === "vertical" ? "vertical" : "horizontal";
  }
  get #automatic() {
    return this.getAttribute("activation") !== "manual";
  }

  protected override initialize() {
    // Only wire once at least one tab exists, so a wiring pass that beats the
    // parser sees connectLightDom retry on the next light-DOM mutation instead
    // of silently claiming an empty host.
    if (this.#tabs().length === 0) return false;
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

    this.attachRoving();
    (this.#list ?? this).addEventListener("click", this.#onClick);

    this.#indicator =
      scopedQuery<HTMLElement>(this, "ui-tab-indicator, [data-tab-indicator]")[0] ?? null;

    const preset = this.getAttribute("value");
    const initial =
      this.#tabs().find((t) => t.getAttribute("value") === preset) ??
      this.#navTabs()[0] ??
      this.#tabs()[0];
    if (initial) this.#select(initial, "silent");
    return true;
  }

  protected override connectResources() {
    const stopRoving = super.connectResources();
    this.#observeResize();
    return () => {
      stopRoving();
      this.#resize?.disconnect();
    };
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
  protected override get rovingContainer(): HTMLElement {
    return this.#list ?? this;
  }

  protected override rovingOptions(): RovingOptions {
    return {
      items: () => this.#navTabs(),
      orientation: this.orientation,
      loop: true,
      onMove: (tab) => {
        if (this.#automatic) this.#select(tab, "emit");
      },
      onActivate: (tab) => this.#select(tab, "emit"),
    };
  }

  #panelFor(value: string | null) {
    return this.#panels().find((p) => p.getAttribute("value") === value);
  }
  #selectedTab() {
    return this.#tabs().find((t) => t.getAttribute("aria-selected") === "true") ?? null;
  }

  #select(tab: HTMLElement, notify: ChangeNotification) {
    if (tab.hasAttribute("disabled")) return;
    const value = tab.getAttribute("value");
    const tabs = this.#tabs();
    const selectedIndex = tabs.indexOf(tab);
    this.#setActivationDirection(selectedIndex);
    this.#previousIndex = selectedIndex;
    for (const t of tabs) t.setAttribute("aria-selected", String(t === tab));
    for (const panel of this.#panels()) {
      panel.toggleAttribute("hidden", panel.getAttribute("value") !== value);
    }
    const index = this.#navTabs().indexOf(tab);
    if (index >= 0) this.roving?.refresh(index);
    this.#positionIndicator();
    if (notify === "emit")
      this.dispatchEvent(new CustomEvent("change", { bubbles: true, detail: { value } }));
  }

  // ---- indicator --------------------------------------------------------
  /**
   * Watch the list and the selected tab for size changes: the indicator is
   * positioned from measured geometry, so a font swap, a container resize or a
   * label change would otherwise leave it behind the tab it tracks.
   */
  #observeResize() {
    if (!this.#indicator || typeof ResizeObserver === "undefined") return;
    this.#resize ??= new ResizeObserver(() => this.#positionIndicator());
    this.#resize.disconnect();
    const list = this.#list ?? this;
    this.#resize.observe(list);
    for (const tab of this.#tabs()) this.#resize.observe(tab);
  }

  /** Record which way the selection travelled, for enter/exit animations. */
  #setActivationDirection(next: number) {
    const previous = this.#previousIndex;
    let direction: TabActivationDirection = "none";
    if (previous >= 0 && next >= 0 && previous !== next) {
      const forward = next > previous;
      direction =
        this.orientation === "vertical" ? (forward ? "down" : "up") : forward ? "right" : "left";
    }
    this.#indicator?.setAttribute("data-activation-direction", direction);
  }

  /**
   * Publish the selected tab's box, relative to the list's padding box, as the
   * `--active-tab-*` custom properties. Two measurements are taken because
   * neither is sufficient alone: layout offsets survive transforms but are
   * rounded to whole pixels, while the rect-based offset is sub-pixel-precise
   * but is projected viewport geometry that a rotation, skew or 3D transform
   * anywhere in the ancestry warps beyond what dividing out the scale can undo.
   * The precise value is adopted only when the two agree (up to layout
   * rounding), which is exactly the case where no such distortion is in effect.
   *
   * The tab's *own* translation moves the rect but not its layout slot, so it
   * is stripped before comparing — that lets the indicator follow a tab-local
   * animation, which it does not inherit as the tab's sibling.
   */
  #positionIndicator = () => {
    const indicator = this.#indicator;
    const list = this.#list ?? this;
    if (!indicator) return;
    indicator.setAttribute("data-orientation", this.orientation);
    const tab = this.#selectedTab();
    // `getBoundingClientRect` is absent under happy-dom's bare elements; with no
    // measurable geometry there is nothing to draw, so stay hidden.
    if (!tab || !("getBoundingClientRect" in tab)) {
      indicator.hidden = true;
      return;
    }

    const tabRect = tab.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const width = tab.offsetWidth;
    const height = tab.offsetHeight;
    // A list scaled by CSS reports a rect that no longer matches its layout
    // size; divide the scale back out so both offsets are in layout pixels.
    const scaleX = list.offsetWidth > 0 ? listRect.width / list.offsetWidth : 1;
    const scaleY = list.offsetHeight > 0 ? listRect.height / list.offsetHeight : 1;

    const layout = layoutOffset(tab, list);
    let { left, top } = layout;

    const rectLeft = (tabRect.left - listRect.left) / scaleX + list.scrollLeft - list.clientLeft;
    const rectTop = (tabRect.top - listRect.top) / scaleY + list.scrollTop - list.clientTop;
    // A degenerate scale divides by zero above; the resulting NaN/Infinity fails
    // this same comparison, so it needs no guard of its own.
    const translation = elementTranslation(tab);
    if (
      Math.abs(rectLeft - translation.x - left) <= MAX_LAYOUT_ROUNDING_ERROR &&
      Math.abs(rectTop - translation.y - top) <= MAX_LAYOUT_ROUNDING_ERROR
    ) {
      left = rectLeft;
      top = rectTop;
    }

    for (const [name, px] of [
      ["--active-tab-left", left],
      ["--active-tab-top", top],
      ["--active-tab-right", list.scrollWidth - left - width],
      ["--active-tab-bottom", list.scrollHeight - top - height],
      ["--active-tab-width", width],
      ["--active-tab-height", height],
    ] as const) {
      indicator.style.setProperty(name, `${px}px`);
    }
    // Never show it before the layout has settled — a zero-sized tab would
    // otherwise flash the indicator collapsed at the list's origin.
    indicator.hidden = !(width > 0 && height > 0);
  };

  #onClick = (e: MouseEvent) => {
    const tab = closestFrom<HTMLElement>(e, "[data-tab]");
    if (tab?.closest("ui-tabs") !== this) return; // a nested ui-tabs owns this tab
    if (tab && !tab.hasAttribute("disabled")) {
      tab.focus();
      this.#select(tab, "emit");
    }
  };
}

/** Custom element `ui-tab-list`: the strip that holds the tabs and receives clicks. */
export class UITabList extends HTMLElement {}

/**
 * The moving highlight behind the selected tab. Purely decorative — the tab
 * list already announces which tab is selected — so it stays out of the
 * accessibility tree.
 */
export class UITabIndicator extends HTMLElement {
  connectedCallback() {
    this.setAttribute("role", "presentation");
    this.setAttribute("aria-hidden", "true");
  }
}

/** A position in layout pixels. */
interface LayoutOffset {
  left: number;
  top: number;
}

/** A 2D translation in CSS pixels. */
interface Translation {
  x: number;
  y: number;
}

/**
 * The element's box relative to `ancestor`'s padding box, from layout offsets
 * only. Immune to transforms, but rounded to whole pixels.
 */
function layoutOffset(element: HTMLElement, ancestor: HTMLElement): LayoutOffset {
  const own = cumulativeOffset(element);
  const base = cumulativeOffset(ancestor);
  let left = own.left - base.left - ancestor.clientLeft;
  let top = own.top - base.top - ancestor.clientTop;

  // Layout offsets describe layout, and scrolling does not change layout: a
  // scroll container *between* the tab and the list moves the tab on screen
  // while its layout slot stays put. Subtract that scroll so this offset stays
  // comparable with the rect-based one — otherwise the difference reads as
  // transform distortion and the indicator is left behind by the full scroll
  // amount. The list's own scroll is excluded on purpose: the indicator lives
  // inside it and scrolls along with the tab.
  let node = element.parentElement;
  while (node && node !== ancestor) {
    left -= node.scrollLeft;
    top -= node.scrollTop;
    node = node.parentElement;
  }
  return { left, top };
}

function cumulativeOffset(element: HTMLElement): LayoutOffset {
  let left = 0;
  let top = 0;
  let node: HTMLElement | null = element;
  while (node) {
    left += node.offsetLeft;
    top += node.offsetTop;
    const parent: HTMLElement | null =
      node.offsetParent instanceof HTMLElement ? node.offsetParent : null;
    if (parent) {
      left += parent.clientLeft;
      top += parent.clientTop;
    }
    node = parent;
  }
  return { left, top };
}

/**
 * The element's own 2D translation in CSS pixels: the translation component of
 * the computed `transform` matrix plus the `translate` longhand, which is a
 * separate property and never appears in that matrix. CSS composes the two as
 * `translate → rotate → scale → transform`, so summing them is exact only
 * without rotation or scale — enough here, because with either in play the
 * caller's agreement check rejects the rect-based offset anyway.
 */
function elementTranslation(element: HTMLElement): Translation {
  const view = element.ownerDocument?.defaultView;
  const style = view?.getComputedStyle?.(element);
  if (!style) return { x: 0, y: 0 };

  let x = 0;
  let y = 0;
  const { transform } = style;
  if (transform && transform !== "none") {
    const matrix = /matrix(?:3d)?\(([^)]+)\)/.exec(transform);
    if (matrix) {
      const values = (matrix[1] ?? "").split(",").map((part) => Number.parseFloat(part));
      const slot = (i: number) => values[i] ?? 0;
      // `matrix()` carries translation in slots 4/5; `matrix3d()` in 12/13.
      if (values.length === 6) [x, y] = [slot(4), slot(5)];
      else if (values.length === 16) [x, y] = [slot(12), slot(13)];
    }
  }

  // `getComputedStyle` resolves absolute and font-relative lengths to pixels
  // but keeps percentages, which resolve against the tab's border box.
  const { translate } = style;
  if (translate && translate !== "none") {
    const parts = translate.split(" ");
    x += translateLength(parts[0], element.offsetWidth);
    y += translateLength(parts[1], element.offsetHeight);
  }
  return { x, y };
}

/** One `translate` longhand component in pixels; anything unresolvable is 0. */
function translateLength(value: string | undefined, reference: number): number {
  if (!value) return 0;
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return 0;
  return value.endsWith("%") ? (numeric / 100) * reference : numeric;
}

define("ui-tabs", UITabs);
define("ui-tab-list", UITabList);
define("ui-tab-indicator", UITabIndicator);

declare global {
  interface HTMLElementTagNameMap {
    "ui-tabs": UITabs;
    "ui-tab-list": UITabList;
    "ui-tab-indicator": UITabIndicator;
  }
}
