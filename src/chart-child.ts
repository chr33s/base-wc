/**
 * The base for a `ui-chart` child that **registers itself with the chart** —
 * `ui-chart-axis` and every series element (`UIChartSeries`).
 *
 * Both spelled out the same three-callback lifecycle: {@link connectOwned} to
 * find the owning `ui-chart` (waiting for the container's own definition, which
 * necessarily lands after its children's), a `disconnectedCallback` that
 * unregisters, and an `attributeChangedCallback` that asks for a re-render.
 * That last one is the shared insight: these elements **are** their own
 * registration — the chart reads the attribute getters straight off the
 * element — so an attribute edit has nothing to sync and re-registering would
 * only churn the element's position in the registry (and with it a series'
 * palette slot and mark elements).
 *
 * A subclass supplies {@link register}, which hands the chart whatever
 * registry it belongs in and returns the unregister callback.
 *
 * `ui-chart-grid`, `ui-chart-legend` and `ui-chart-tooltip` deliberately do not
 * extend this: a grid's registration *is* its `axis` attribute (so it must
 * re-register on change, not re-render), and the other two subscribe to chart
 * events rather than registering at all.
 */
import type { UIChart } from "./chart.ts";
import { connectOwned } from "./lifecycle.ts";

/** Base for chart children that register themselves with the owning `ui-chart` and request a re-render on attribute change. */
export abstract class ChartChildElement extends HTMLElement {
  #chart: UIChart | null = null;
  #unregister: (() => void) | null = null;

  /** The `ui-chart` this element is registered with, or `null` while unattached. */
  protected get chart(): UIChart | null {
    return this.#chart;
  }

  /** Add this element to the chart's registry; return the removal callback. */
  protected abstract register(chart: UIChart): () => void;

  /** Locate the owning chart and register once it is defined. */
  connectedCallback(): void {
    connectOwned(
      this,
      "ui-chart",
      () => this.#unregister !== null,
      (chart) => {
        this.#chart = chart;
        this.#unregister = this.register(chart);
      },
    );
  }

  /** Unregister from the chart. */
  disconnectedCallback(): void {
    this.#unregister?.();
    this.#unregister = null;
    this.#chart = null;
  }

  /** Ask the chart to re-render; the element is its own registration, so nothing else needs syncing. */
  attributeChangedCallback(): void {
    this.#chart?.requestRender();
  }
}
