/**
 * The base every `ui-chart` series element extends (`ui-chart-bar`,
 * `-line`, `-pie`, `-scatter`, and the `-reference-line` annotation). It owns
 * the half of a series element that is identical across all of them: find the
 * ancestor `ui-chart`, register with it, and unregister on disconnect.
 *
 * **The element is its own registration.** `UIChartSeries` implements
 * {@link SeriesRegistration} directly — the attribute getters *are* the
 * registration fields, `element` is the element itself, and `hidden` is the
 * element's native `hidden` — so there is no mirror object to keep in sync:
 * an attribute change only has to ask the chart to re-render, and the chart
 * reads the new values straight off the element. Object identity is stable
 * for the element's whole registered life (the element was always the
 * identity anchor), so mark reconciliation keys and palette slots survive
 * attribute edits exactly as before.
 *
 * A subclass supplies its registered {@link SeriesTypeDefinition} name as
 * {@link UIChartSeries.type} and, where it has more than the shared fields,
 * simply declares the extra getters (a scatter's `xKey`, a bar's `stack`) —
 * they are registration fields like any other. Everything else — including
 * the `key` / `label` / `highlight` / `fade` attribute surface, which used to
 * be spelled three different ways across the five elements — lives here once.
 *
 * Shared attributes:
 * - `key` — the dataset column this series plots.
 * - `label` — display name for legend/tooltip text (falls back to `key`).
 * - `highlight` (`"item" | "series" | "none"`, default `"item"`) and `fade`
 *   (`"global" | "series" | "none"`, default `"global"`) — this series'
 *   {@link HighlightScope}.
 * - `hidden` — the native attribute doubles as the series' visibility flag:
 *   `<ui-chart-bar hidden>` starts hidden, `ui-chart-legend` toggles it, and
 *   because it lives on the element it survives a DOM move (which unregisters
 *   and re-registers the series) with no hand-off.
 *
 * A subclass's `observedAttributes` should spread {@link SERIES_ATTRIBUTES}
 * and add its own on top.
 */
import type { HighlightScope, SeriesRegistration } from "./chart-core.ts";
import type { UIChart } from "./chart.ts";
import { connectLightDom } from "./lifecycle.ts";

/** The attributes {@link UIChartSeries} itself reads — spread into each subclass's `observedAttributes`. */
export const SERIES_ATTRIBUTES = ["key", "label", "highlight", "fade", "hidden"] as const;

export abstract class UIChartSeries extends HTMLElement implements SeriesRegistration {
  #chart: UIChart | null = null;
  #unregister: (() => void) | null = null;

  /** The `registerSeriesType` name whose renderer draws this series. */
  abstract readonly type: string;

  /**
   * The registration's visibility flag *is* the element's native `hidden` —
   * this `declare` only narrows lib.dom's `boolean | "until-found"` typing to
   * the plain boolean the registration interface (and this element's actual
   * usage) means; it emits no field, so the native accessor stays in charge.
   */
  declare hidden: boolean;

  /** The registration's DOM handle — this element itself. */
  get element() {
    return this;
  }

  get key() {
    return this.getAttribute("key") ?? "";
  }

  get label() {
    return this.getAttribute("label") ?? undefined;
  }

  get highlightScope(): HighlightScope {
    const highlight = this.getAttribute("highlight");
    const fade = this.getAttribute("fade");
    return {
      highlight: highlight === "series" || highlight === "none" ? highlight : "item",
      fade: fade === "series" || fade === "none" ? fade : "global",
    };
  }

  /** The `ui-chart` this series is registered with, or `null` while unattached. */
  protected get chart() {
    return this.#chart;
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#unregister !== null,
      () => this.#wire(),
    );
  }

  disconnectedCallback() {
    this.#unregister?.();
    this.#unregister = null;
    this.#chart = null;
  }

  attributeChangedCallback() {
    // The chart renders straight from this element (it *is* the registration),
    // so there is nothing to sync — the new value is already visible. It only
    // needs telling that the registry moved on. Re-registering instead would
    // hand the series a new position in the list, and with it a new palette
    // slot and a fresh set of mark elements, for what is only an edit.
    this.#chart?.requestRender();
  }

  #wire() {
    const chart = this.closest("ui-chart");
    if (!chart) return;
    this.#chart = chart;
    this.#unregister = chart.registerSeries(this);
  }
}
