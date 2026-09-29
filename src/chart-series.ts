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
import { ChartChildElement } from "./chart-child.ts";
import type { BuiltInSeriesType, HighlightScope, SeriesRegistration } from "./chart-core.ts";
import type { UIChart } from "./chart.ts";

/** The attributes {@link UIChartSeries} itself reads — spread into each subclass's `observedAttributes`. */
export const SERIES_ATTRIBUTES = ["key", "label", "highlight", "fade", "hidden"] as const;

/** Shared base of every series element: registers itself (as its own registration) with the owning chart. */
export abstract class UIChartSeries extends ChartChildElement implements SeriesRegistration {
  /** The `registerSeriesType` name whose renderer draws this series. */
  abstract readonly type: BuiltInSeriesType;

  /**
   * The registration's visibility flag *is* the element's native `hidden` —
   * this `declare` only narrows lib.dom's `boolean | "until-found"` typing to
   * the plain boolean the registration interface (and this element's actual
   * usage) means; it emits no field, so the native accessor stays in charge.
   */
  declare hidden: boolean;

  /** The registration's DOM handle — this element itself. */
  get element(): this {
    return this;
  }

  /** The dataset column this series plots (`key` attribute). */
  get key(): string {
    return this.getAttribute("key") ?? "";
  }

  /** Display name for legend/tooltip text (`label` attribute); `undefined` falls back to `key`. */
  get label(): string | undefined {
    return this.getAttribute("label") ?? undefined;
  }

  /** Highlight/fade behaviour from the `highlight` and `fade` attributes. */
  get highlightScope(): HighlightScope {
    const highlight = this.getAttribute("highlight");
    const fade = this.getAttribute("fade");
    return {
      highlight: highlight === "series" || highlight === "none" ? highlight : "item",
      fade: fade === "series" || fade === "none" ? fade : "global",
    };
  }

  protected override register(chart: UIChart): () => void {
    return chart.registerSeries(this);
  }
}
