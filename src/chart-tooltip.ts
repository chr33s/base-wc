/**
 * `ui-chart-tooltip` — a pointer-following popover that shows the currently
 * highlighted chart data (ported from `@mui/x-charts`'s `ChartsTooltip` /
 * `ChartsTooltipContainer`).
 *
 * Wires to the closest `ui-chart` ancestor and listens for its bubbling
 * `highlight` event. `trigger="axis"` (default) shows one row per *visible*
 * series at the highlighted data index; `trigger="item"` shows only the row
 * for the specifically-hovered series (identified by the highlight event's
 * `detail.seriesIndex`, its palette slot — not by `key`, which two series may
 * share). Series come from `chart.getSeries()` — the registry the chart
 * itself renders from — so a row's `--series-index` is the same palette slot
 * as its marks and its legend swatch, and annotations (a reference line)
 * never produce a row. The tooltip hides whenever a `highlight` event reports
 * nothing active for its trigger mode — in particular whenever both
 * `detail.index` and `detail.series` are `null`.
 *
 * Content is a generated `<table data-part="table">`: one `<tr data-part="row"
 * data-series="<key>" data-series-index="N" style="--series-index: N">` per
 * row, each holding a `<td data-part="label">` and a `<td data-part="value">` —
 * unless this element has an authored `<template>` child, in which case the
 * template is cloned once per row instead, and any of the literal tokens
 * `{key}` / `{label}` / `{value}` / `{index}` found in the clone's text nodes
 * are substituted with that row's values.
 *
 * Uses the Popover API (`popover="manual"`) as its top-layer mechanism and
 * follows the pointer via `position: fixed` + `left`/`top`, updated on a
 * `pointermove` listener attached to the chart (a separate listener from
 * `ui-chart`'s own band/axis-hit-test `pointermove` handling — the two do not
 * conflict). Positioning is a straightforward pointer-follow only; viewport
 * clamping is not yet implemented.
 *
 * Markup: `<ui-chart-tooltip>` anywhere inside a `<ui-chart>`, optionally
 * containing a single `<template>` child for custom row markup. Attribute:
 * `trigger` (`"axis" | "item"`, default `"axis"`). Dispatches no events of its
 * own.
 */
import type { ChartValue } from "./chart-core.ts";
import type { UIChart, UIChartHighlightDetail } from "./chart.ts";
import { define } from "./define.ts";
import { connectOwned } from "./lifecycle.ts";
import { UIPopupElement } from "./popup.ts";

const TOKENS = ["{key}", "{label}", "{value}", "{index}"] as const;

interface Row {
  key: string;
  label: string;
  value: ChartValue;
  index: number | null;
  seriesIndex: number | null;
}

function formatValue(value: ChartValue) {
  if (value == null) return "";
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
}

export class UIChartTooltip extends UIPopupElement {
  static override role = "tooltip";

  #wired = false;
  #chart: UIChart | null = null;
  #active = false;

  get trigger() {
    return this.getAttribute("trigger") === "item" ? "item" : "axis";
  }

  override connectedCallback() {
    super.connectedCallback();
    connectOwned(
      this,
      "ui-chart",
      () => this.#wired,
      (chart) => this.#wire(chart),
    );
  }

  disconnectedCallback() {
    this.#chart?.removeEventListener("highlight", this.#onHighlight);
    this.#chart?.removeEventListener("pointermove", this.#onPointerMove);
    this.#hide();
    // Reset both so a reconnection re-wires: the listeners above live on the
    // *chart*, not on this element, and `connectOwned` would otherwise see
    // an already-wired tooltip and never re-attach them (`table.ts`'s
    // precedent — a tooltip that survives a DOM move but never shows again is
    // the bug this avoids).
    this.#wired = false;
    this.#chart = null;
  }

  #wire(chart: UIChart) {
    this.#wired = true;
    this.#chart = chart;
    this.style.position = "fixed";
    chart.addEventListener("highlight", this.#onHighlight);
    chart.addEventListener("pointermove", this.#onPointerMove);
  }

  #onHighlight = (event: Event) => {
    const chart = this.#chart;
    if (!chart) return;
    const detail = (event as CustomEvent<UIChartHighlightDetail>).detail;
    const shouldShow = this.trigger === "item" ? detail.series !== null : detail.index !== null;
    // The row set, not just `shouldShow`, decides visibility: `detail.series`
    // can name a series that is currently hidden (the legend's own hover
    // still highlights it) or, under `trigger="axis"`, every series can be
    // hidden at once — either way `#rows` comes back empty, and showing an
    // empty popover would follow the pointer with nothing in it.
    const rows = shouldShow ? this.#rows(chart, detail) : [];
    if (rows.length === 0) {
      this.#hide();
      return;
    }
    this.#populate(rows);
    this.#show();
  };

  #onPointerMove = (event: PointerEvent) => {
    if (!this.#active) return;
    this.style.left = `${event.clientX + 12}px`;
    this.style.top = `${event.clientY + 12}px`;
  };

  #rows(chart: UIChart, detail: UIChartHighlightDetail) {
    const series = chart.getSeries();
    const visible = series.filter((registration) => !registration.hidden);
    // `item` trigger: the highlight's palette slot names the series exactly.
    // Matching on `key` instead would show a row for every series that happens
    // to plot the same dataset column — both halves of a bar-plus-line combo
    // chart over `Revenue`, which is precisely the case the rest of this family
    // keeps apart.
    const targets =
      this.trigger === "item"
        ? visible.filter((registration) => series.indexOf(registration) === detail.seriesIndex)
        : visible;
    const index = detail.index;
    return targets.map((registration) => ({
      key: registration.key,
      label: registration.label ?? registration.key,
      value: index === null ? null : (chart.data[index]?.[registration.key] ?? null),
      index,
      // The palette slot, from the full registry — a row keeps its colour
      // when another series is hidden, matching its marks and its swatch.
      seriesIndex: series.indexOf(registration),
    }));
  }

  #populate(rows: Row[]) {
    this.#clearContent();
    const template = this.querySelector(":scope > template");
    if (template instanceof HTMLTemplateElement) {
      for (const row of rows) this.append(this.#instantiate(template, row));
      return;
    }
    const table = document.createElement("table");
    table.setAttribute("data-part", "table");
    const tbody = document.createElement("tbody");
    for (const row of rows) tbody.append(this.#buildRow(row));
    table.append(tbody);
    this.append(table);
  }

  #buildRow(row: Row) {
    const tr = document.createElement("tr");
    tr.setAttribute("data-part", "row");
    tr.setAttribute("data-series", row.key);
    if (row.seriesIndex !== null) {
      // Both spellings of the palette slot, exactly as a series group carries
      // them, so one consumer rule can colour marks, swatches and rows alike.
      tr.dataset.seriesIndex = String(row.seriesIndex);
      tr.style.setProperty("--series-index", String(row.seriesIndex));
    }
    const label = document.createElement("td");
    label.setAttribute("data-part", "label");
    label.textContent = row.label;
    const value = document.createElement("td");
    value.setAttribute("data-part", "value");
    value.textContent = formatValue(row.value);
    tr.append(label, value);
    return tr;
  }

  #instantiate(template: HTMLTemplateElement, row: Row) {
    const clone = template.content.cloneNode(true) as DocumentFragment;
    const values = {
      "{key}": row.key,
      "{label}": row.label,
      "{value}": formatValue(row.value),
      "{index}": row.index == null ? "" : String(row.index),
    } satisfies Record<(typeof TOKENS)[number], string>;
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      let text = node.textContent ?? "";
      for (const token of TOKENS) text = text.split(token).join(values[token]);
      node.textContent = text;
      node = walker.nextNode();
    }
    return clone;
  }

  #clearContent() {
    // Every child NODE, not just elements: the template path (`#instantiate`)
    // appends whole cloned fragments, which can carry bare text nodes (literal
    // text outside any wrapper element) alongside the substituted ones —
    // `querySelectorAll` never matches those, so a selector-based clear would
    // leave one behind per row on every highlight, forever. `Array.from` takes
    // a static snapshot — `childNodes` itself is live, so removing each node
    // mid-iteration over it directly would reindex and skip a sibling; the
    // authored `<template>` itself is excluded so it survives to be re-cloned
    // on the next highlight.
    for (const child of Array.from(this.childNodes)) {
      if (!(child instanceof HTMLTemplateElement)) child.remove();
    }
  }

  // `showPopover`/`hidePopover` throw when called against the state the
  // element is already in, and are absent altogether in environments without
  // the Popover API — so `#active` gates the calls (rather than a `catch`
  // swallowing whatever comes back), and `?.()` covers the missing-API case
  // the same way `ui-toast` does.
  #show() {
    if (this.#active) return;
    this.#active = true;
    if (this.isConnected) this.showPopover?.();
  }

  #hide() {
    this.#clearContent();
    if (!this.#active) return;
    this.#active = false;
    if (this.isConnected) this.hidePopover?.();
  }
}

define("ui-chart-tooltip", UIChartTooltip);

declare global {
  interface HTMLElementTagNameMap {
    "ui-chart-tooltip": UIChartTooltip;
  }
}
