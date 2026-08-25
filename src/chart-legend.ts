/**
 * `ui-chart-legend` — ported from `@mui/x-charts`'s `ChartsLegend`. An
 * ordinary light-DOM element (a plain sibling of the chart's `<svg>`, NOT
 * rendered inside it — unlike a series/axis, it never touches SVG at all),
 * rendering one item per **registered** series on the closest `ui-chart` —
 * `chart.getSeries()`, the same document-ordered list the chart itself paints
 * from, so a legend item and its marks can never disagree about which series
 * is which, or about which palette slot it holds. Annotations (a reference
 * line) are not series and never appear here.
 *
 * Host carries `role="list"`. Each item is a `<span role="listitem">`
 * wrapping a `<button type="button">` — the role sits on the wrapper, not the
 * button itself, because `aria-pressed` is only a valid state on `role`
 * `button` (or nothing, which resolves to a native `<button>`'s implicit
 * role): putting `role="listitem"` directly on the button would silently
 * strip its pressed semantics from the accessibility tree. Each button
 * carries:
 * - `data-legend-index` — the series' position in that list (also how a click
 *   maps back to its series: the list is read fresh rather than cached).
 * - `data-series` — that series' `key`.
 * - `aria-pressed` — `"true"` while the series is shown and `"false"` once it
 *   is hidden, matching `ui-toggle`, where pressed is the "on" state.
 * - `data-hidden` — present while the series is hidden, for consumer CSS
 *   (e.g. strikethrough/dim a hidden item).
 *
 * Each button contains a `<span data-part="swatch" style="--series-index:
 * N">` (the same palette slot `ui-chart` assigns that series' own group, so a
 * consumer's palette rules apply identically to swatches and marks) and the
 * series' label text — its `label`, falling back to its `key`.
 *
 * Interaction is entirely delegated to the host — `click` toggles the series
 * under the pointer via `chart.setSeriesHidden` and dispatches `toggle`, while
 * `pointerover`/`pointerleave` drive `chart.setHighlight` so hovering an item
 * highlights its whole series, matching the built-in mark-hover interaction.
 * No button holds a listener or a reference of its own.
 *
 * Re-rendering is driven by the chart's store: whenever the series registry
 * changes — one added, removed, hidden, or edited — the items are reconciled
 * *in place*, so the button a user just clicked (or tabbed to) survives its own
 * toggle instead of being replaced under them. Nothing here observes the
 * chart's DOM either, so the chart's own painting — which mutates its `<svg>`
 * on every highlight — never disturbs these buttons.
 *
 * Events: `toggle` (`UIChartToggleDetail`) fires on every click, after the
 * series' hidden state has flipped.
 */
import type { SeriesRegistration } from "./chart-core.ts";
import type { UIChart } from "./chart.ts";
import { connectLightDom } from "./lifecycle.ts";

export interface UIChartToggleDetail {
  readonly series: string;
  readonly hidden: boolean;
}

export class UIChartLegend extends HTMLElement {
  #chart: UIChart | null = null;
  #unsubscribe: (() => void) | null = null;

  #onClick = (event: MouseEvent) => {
    const chart = this.#chart;
    if (!chart) return;
    const registration = this.#seriesFor(event.target);
    if (!registration) return;

    const hidden = !registration.hidden;
    // Re-rendering this list is the store subscription's job — the toggle
    // below lands after it, so listeners see the finished state.
    chart.setSeriesHidden(registration.element, hidden);
    this.dispatchEvent(
      new CustomEvent<UIChartToggleDetail>("toggle", {
        bubbles: true,
        detail: { series: registration.key, hidden },
      }),
    );
  };

  /** Hovering an item highlights its whole series. Delegated (`pointerover`, which bubbles — unlike `pointerenter`) so the buttons themselves stay stateless and reusable across re-renders. */
  #onPointerOver = (event: PointerEvent) => {
    this.#chart?.setHighlight({
      index: null,
      series: this.#seriesFor(event.target)?.element ?? null,
    });
  };

  #onPointerLeave = () => {
    this.#chart?.setHighlight({ index: null, series: null });
  };

  connectedCallback() {
    this.setAttribute("role", "list");
    connectLightDom(
      this,
      () => this.#chart !== null,
      () => this.#wire(),
    );
  }

  disconnectedCallback() {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.removeEventListener("click", this.#onClick);
    this.removeEventListener("pointerover", this.#onPointerOver);
    this.removeEventListener("pointerleave", this.#onPointerLeave);
    this.#chart = null;
  }

  #wire() {
    const chart = this.closest("ui-chart");
    if (!chart) return;
    this.#chart = chart;
    this.addEventListener("click", this.#onClick);
    this.addEventListener("pointerover", this.#onPointerOver);
    this.addEventListener("pointerleave", this.#onPointerLeave);
    this.#unsubscribe = chart.getStore().subscribe((_state, patch) => {
      if ("series" in patch) this.#render(chart);
    });
    this.#render(chart);
  }

  /**
   * Reconcile the items in place — update what is there, add what is new, drop
   * what is gone. Rebuilding the list wholesale would destroy the very button
   * the user just activated, dropping keyboard focus to the document on every
   * toggle.
   */
  #render(chart: UIChart) {
    const series = chart.getSeries();
    const existing = Array.from(this.querySelectorAll<HTMLElement>(':scope > [role="listitem"]'));
    series.forEach((registration, index) => {
      let item = existing[index];
      if (!item) {
        item = this.#createItem();
        this.append(item);
      }
      this.#syncItem(item, registration, index);
    });
    for (let i = series.length; i < existing.length; i++) existing[i]?.remove();
  }

  #createItem(): HTMLElement {
    const item = document.createElement("span");
    item.setAttribute("role", "listitem");
    const button = document.createElement("button");
    button.type = "button";
    const swatch = document.createElement("span");
    swatch.setAttribute("data-part", "swatch");
    button.append(swatch, document.createTextNode(""));
    item.append(button);
    return item;
  }

  #syncItem(item: HTMLElement, registration: SeriesRegistration, index: number) {
    const button = item.querySelector("button")!;
    button.setAttribute("data-legend-index", String(index));
    button.setAttribute("data-series", registration.key);
    // Pressed is the "on" state, as in `ui-toggle`: a shown series is pressed.
    button.setAttribute("aria-pressed", String(!registration.hidden));
    button.toggleAttribute("data-hidden", registration.hidden);
    button
      .querySelector<HTMLElement>('[data-part="swatch"]')
      ?.style.setProperty("--series-index", String(index));
    const text = button.lastChild;
    if (text) text.textContent = registration.label ?? registration.key;
  }

  /** The series an event landed on, resolved through the item's index — the same lookup the click handler uses, so no button holds a reference of its own and every one of them stays reusable. */
  #seriesFor(target: EventTarget | null): SeriesRegistration | undefined {
    if (!(target instanceof Element) || !this.#chart) return undefined;
    const button = target.closest<HTMLButtonElement>("button[data-legend-index]");
    if (!button) return undefined;
    return this.#chart.getSeries()[Number(button.getAttribute("data-legend-index"))];
  }
}

if (!customElements.get("ui-chart-legend")) customElements.define("ui-chart-legend", UIChartLegend);

declare global {
  interface HTMLElementTagNameMap {
    "ui-chart-legend": UIChartLegend;
  }
}
