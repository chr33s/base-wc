/**
 * The base every `ui-chart` series element extends (`ui-chart-bar`,
 * `-line`, `-pie`, `-scatter`, and the `-reference-line` annotation). It owns
 * the half of a series element that is identical across all of them: find the
 * ancestor `ui-chart`, build and register a {@link SeriesRegistration} (whose
 * own object identity *is* the series' identity — see that type's doc), keep
 * the registration in step with the shared attributes, and unregister on
 * disconnect.
 *
 * A subclass supplies its registered {@link SeriesTypeDefinition} name through
 * {@link UIChartSeries.seriesType} and, if it needs more than the shared
 * fields, overrides {@link UIChartSeries.seriesFields} to contribute its own
 * (a scatter's `xKey`, a bar's `stack`). Everything else — including the
 * `key` / `label` / `highlight` / `fade` attribute surface, which used to be
 * spelled three different ways across the five elements — lives here once.
 *
 * Shared attributes:
 * - `key` — the dataset column this series plots.
 * - `label` — display name for legend/tooltip text (falls back to `key`).
 * - `highlight` (`"item" | "series" | "none"`, default `"item"`) and `fade`
 *   (`"global" | "series" | "none"`, default `"global"`) — this series'
 *   {@link HighlightScope}.
 *
 * A subclass's `observedAttributes` should spread {@link SERIES_ATTRIBUTES}
 * and add its own on top.
 */
import type { HighlightScope, SeriesRegistration } from "./chart-core.ts";
import type { UIChart } from "./chart.ts";
import { connectLightDom } from "./lifecycle.ts";

/** The attributes {@link UIChartSeries} itself reads — spread into each subclass's `observedAttributes`. */
export const SERIES_ATTRIBUTES = ["key", "label", "highlight", "fade"] as const;

export abstract class UIChartSeries extends HTMLElement {
  #chart: UIChart | null = null;
  #registration: SeriesRegistration | null = null;
  #unregister: (() => void) | null = null;
  /** Visibility, kept on this element across re-registration: the flag itself lives on the registration, which a DOM move discards — and a series hidden through the legend must not come back visible just because it (or its chart) moved. */
  #hidden = false;

  /** The `registerSeriesType` name whose renderer draws this series. */
  protected abstract readonly seriesType: string;

  get key(): string {
    return this.getAttribute("key") ?? "";
  }

  get label(): string | undefined {
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
  protected get chart(): UIChart | null {
    return this.#chart;
  }

  /** Type-specific registration fields, merged over the shared ones on registration and on every attribute change. */
  protected seriesFields(): Partial<SeriesRegistration> {
    return {};
  }

  connectedCallback() {
    connectLightDom(
      this,
      () => this.#registration !== null,
      () => this.#wire(),
    );
  }

  disconnectedCallback() {
    this.#hidden = this.#registration?.hidden ?? this.#hidden;
    this.#unregister?.();
    this.#unregister = null;
    this.#registration = null;
    this.#chart = null;
  }

  attributeChangedCallback() {
    const registration = this.#registration;
    if (!registration) return;
    // Mutate the registration in place — it is the same object the chart holds
    // and renders from, so this *is* the update. Re-registering instead would
    // hand the series a new position in the list, and with it a new palette
    // slot and a fresh set of mark elements, for what is only an edit.
    this.#sync(registration);
    this.#chart?.requestRender();
  }

  #sync(registration: SeriesRegistration) {
    registration.key = this.key;
    registration.label = this.label;
    registration.highlightScope = this.highlightScope;
    Object.assign(registration, this.seriesFields());
  }

  #wire() {
    const chart = this.closest("ui-chart");
    if (!chart) return;
    this.#chart = chart;
    const registration: SeriesRegistration = {
      element: this,
      type: this.seriesType,
      key: this.key,
      highlightScope: this.highlightScope,
      hidden: this.#hidden,
    };
    this.#sync(registration);
    this.#registration = registration;
    this.#unregister = chart.registerSeries(registration);
  }
}
