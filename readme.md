# `@chr33s/base-wc` — headless web components

Base UI, ported to **dependency-free** custom elements. Framework-agnostic:
any server-rendered or client runtime can consume them.

## Install

```sh
npm install @chr33s/base-wc
```

Importing a component's **class** registers its element — there is no separate
`define()` call:

```html
<ui-select name="fruit">
  <select>
    <option value="apple">Apple</option>
    <option value="banana" selected>Banana</option>
  </select>
</ui-select>
```

```ts
import { UISelect } from "@chr33s/base-wc"; // registers <ui-select>
```

With no JS that `<select>` is already a working form control; on upgrade the
component enhances it and the native element keeps owning the form value. To
register everything up front instead — from an app shell that renders `ui-*` tags
without importing their classes:

```ts
import "@chr33s/base-wc/elements"; // register every custom element
```

Components ship unstyled either way — `@chr33s/base-wc/styles.css` is a demo
skin, not a theme. See [Entry points & bundle size](#entry-points--bundle-size)
for what each entry point costs.

[TK: minimum supported browsers — the components require the Popover API and
`ElementInternals`; CSS anchor positioning has a JS fallback.]

A runnable **Storybook** of every component lives alongside the sources — the
`*.stories.ts` files, driven by the config in [`.storybook/`](./.storybook/) and
themed by [`src/styles.css`](./src/styles.css), which composes the focused
modules in [`src/styles/`](./src/styles/). Run it with
`npm install && npm run dev`, or build the static site with
`npm run build:storybook` (`@storybook/web-components-vite` consumes the
TypeScript sources directly). The Storybook tooling is a `devDependency` and
never ships with the components.

## Design invariants

Every component in this package holds to the same contract (the Base UI port
assumptions):

- **Light DOM, no shadow root** — so consumer CSS applies directly and
  cross-root ARIA (`aria-controls` / `aria-activedescendant` / `aria-labelledby`)
  resolves against elements the page owns. Style off `data-*` / ARIA hooks.
- **Native-first form controls** — the default contract for a leaf control with
  a native equivalent (switch, checkbox, select, …) is to **author a real native
  control inside it**; the component enhances that control and the browser owns
  submission, so the form works **with no JS**. `ElementInternals` is the
  **fallback**, used only for JS-only contexts and components with no native
  equivalent. See [Native-first form controls](#native-first-form-controls-the-default-contract).
- **Top layer via the Popover API** (`popover="manual"`) — popups escape
  `overflow`/stacking-context clipping; the component owns dismissal.
- **CSS anchor positioning** with a viewport-aware JS fallback
  (`anchor.ts`) behind `@supports (anchor-name: --a)`.
- **Shared DOM controllers**, not framework context, coordinate behavior. The
  DOM remains the source of truth for order, while `connectLightDom()` waits for
  late-authored light-DOM parts and shared controllers own composite state.

## Native-first form controls (the default contract)

The **default** way to author a leaf control that has a native equivalent is to
wrap a **real native control** — the component enhances it, never replaces it.
For server-rendered, no-JS-first pages this is the contract to reach for:

```html
<ui-switch><input type="checkbox" name="notify" /></ui-switch>
<ui-select name="fruit">
  <select>
    <option value="apple">Apple</option>
    <option value="banana" selected>Banana</option>
  </select>
</ui-select>
```

With no JS that native control is fully functional and submits on its own. On
upgrade the component **adopts** it (`native.ts` → `adoptedControl()`): the
native element is the single source of truth for the form value, so
`ElementInternals` is **not** used in this mode and nothing submits twice. From
there the component follows one of two patterns:

- **Style-in-place** (`ui-switch`, `ui-checkbox`): the native input **is** the
  control — overlay it on the visual, and the component only announces it
  (`ui-switch` sets `role=switch`) and mirrors its state onto the `data-state` /
  `data-disabled` hooks. Cheapest and most accessible — the browser owns focus,
  keyboard, and submission. These toggles are **native-only**: they have no
  `ElementInternals` fallback and no-op if no native checkbox is authored.
- **Generate-from-native** (`ui-select`): the component builds its trigger +
  listbox from the native `<option>`/`<optgroup>` markup, seeds the selection
  from the native value, and `retireNative()`s the `<select>` — hidden and out
  of the a11y tree + tab order, but still the submitting form value (never
  `disabled`, which would drop it from submission). Selecting an enhanced option
  writes back to the native control, so a later submit carries the choice.

### The `ElementInternals` fallback

For controls that implement both native-first and standalone modes, authoring no
native control makes `adoptedControl()` return `null`; the element then drives
its own ARIA, keyboard handling, and `ElementInternals.setFormValue()` in JS.
`ui-switch` / `ui-checkbox` are native-only and no-op without an inner checkbox.
The standalone fallback is right in exactly two cases, and wrong otherwise
(it submits nothing with JS off):

- **No native equivalent** — `ui-combobox` (virtualized), `ui-menu`, `ui-toast`,
  `ui-otp-field`, multi-thumb `ui-slider`, standalone `ui-calendar` /
  `ui-color-picker`, etc. have no native control to adopt. (When used through the
  native-first `ui-date-field` / `ui-color-field` wrappers, the wrapper's native
  `<input>` is the submitting value and the picker drives it — no `ElementInternals`.)
- **Rich content the native can't express** — e.g. authoring `<ui-select-option>`
  directly (icons, two-line options) instead of plain-text `<option>`s. This is
  JS-only by nature; use it when the richer listbox matters more than a no-JS
  fallback.

For a plain toggle or single-select in an SSR form, prefer the native-first
markup above.

### The `:defined` seam (avoiding FOUC)

Before the element upgrades only the native control exists, so it shows and
works. A generate-from-native component builds its enhanced chrome only _after_
upgrade, so there is never a flash of two controls. Consumers styling a retired
native can also key off `:defined`:

```css
ui-select:not(:defined) > select {
  /* pre-JS: the native menu is the control */
}
```

### Fallback matrix

| Component                                                            | No-JS baseline                   | Upgrade pattern                                               |
| -------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------- |
| `ui-switch`, `ui-checkbox`                                           | `<input type=checkbox>` required | Native style-in-place; no standalone fallback                 |
| `ui-select`                                                          | `<select>`                       | Retires native select; direct `ui-select-option` is JS-only   |
| `ui-number-field`                                                    | `<input type=number>`            | Native style-in-place, or standalone spinbutton               |
| `ui-slider`                                                          | Single `<input type=range>`      | Native single slider, or standalone multi-thumb range         |
| `ui-radio-group`                                                     | Native radio inputs              | Native style-in-place, or standalone radiogroup               |
| `ui-search-field`                                                    | `<input type=search>`            | Native style-in-place + clear/debounced `search`              |
| `ui-date-field`, `ui-color-field`                                    | Native date/color inputs         | Retire native input; picker writes back to it                 |
| `ui-drop-zone`                                                       | `<input type=file>`              | Retire native input; drag/drop writes accepted files          |
| `ui-table`                                                           | `<table>`                        | Native table enhancer; sort/select/pagination hooks           |
| `ui-chart`                                                           | `<table>`                        | Authored table renders as-is with no JS; SVG plot is JS-only  |
| `ui-gauge`                                                           | —                                | JS-only SVG arc + `--gauge` fraction (the `ui-meter` pattern) |
| `ui-combobox`                                                        | —                                | JS store/listbox control, form-associated                     |
| `ui-autocomplete`                                                    | Authored input                   | JS suggestion listbox; input text is the form value           |
| `ui-collapsible`, `ui-accordion`, `ui-tabs`                          | Authored triggers/panels         | ARIA wiring, disclosure/roving behaviour                      |
| `ui-menu`, `ui-popover`, `ui-dialog`, `ui-drawer`, `ui-context-menu` | Authored trigger/content         | Popover top layer + JS positioning/dismissal                  |
| `ui-meter`, `ui-progress`                                            | —                                | Custom ARIA elements with CSS variable fill hooks             |
| `ui-toast`, `ui-scroll-area`, `ui-preview-card`, `ui-tooltip`        | —                                | JS enhancement-only; `ui-tooltip` can degrade to `title`      |

## Shared infrastructure (`build once, reuse everywhere`)

| Module             | Role                                                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id.ts`            | Document-unique id generator for ARIA cross-references.                                                                                                                                                                     |
| `native.ts`        | `adoptedControl()`/`retireNative()`/`fireNativeChange()`/`managedDisabled()` — adopt an authored native control for no-JS fallback, propagate its value/change, and disable it without stealing an author's own `disabled`. |
| `lifecycle.ts`     | `connectLightDom()` waits for required authored parts and preserves wiring across reconnects; `LightDomElement` is the base that owns that lifecycle.                                                                       |
| `anchor.ts`        | `SUPPORTS_ANCHOR` + `anchor()` positioner (Floating UI stand-in).                                                                                                                                                           |
| `dismiss.ts`       | `onOutsidePress()` capture-phase light-dismiss.                                                                                                                                                                             |
| `overlay.ts`       | `overlay()` popup lifecycle: top layer + position + dismiss + exit.                                                                                                                                                         |
| `combobox-core.ts` | Shared editable-combobox ARIA, active-option, overlay, dismissal, and option-delegation state.                                                                                                                              |
| `text.ts`          | `localeOf()` + `normalize()` locale-aware, diacritic-/case-insensitive filter key.                                                                                                                                          |
| `focus-trap.ts`    | `trapFocus()` focus cycle + restore; `getFocusable()`.                                                                                                                                                                      |
| `scroll-lock.ts`   | `lockScroll()` reference-counted background scroll freeze.                                                                                                                                                                  |
| `roving.ts`        | `roving()` generalized roving-tabindex composite navigation; keeps exactly one tabbable item as items come and go. `RovingElement` owns the helper's lifetime.                                                              |
| `intent.ts`        | Hover-intent delay groups for tooltip/preview-card; `onPointerMoved()` ignores a stationary Safari pointermove.                                                                                                             |
| `transitions.ts`   | `runExit()` defers hide until the CSS exit animation finishes.                                                                                                                                                              |
| `direction.ts`     | `isRTL()` — flips horizontal arrow keys / side placement in RTL.                                                                                                                                                            |
| `form-control.ts`  | `formControl()` form association + constraint validation; `FormAssociatedElement` / `NativeCheckboxElement` bases.                                                                                                          |
| `popup.ts`         | `UIPopupElement` / `UIModalPopupElement` — the top-layer popup shell (`popover=manual`, role, focusability).                                                                                                                |
| `hover-card.ts`    | `HoverCardElement` — hover-intent trigger + anchored surface (`ui-tooltip`, `ui-preview-card`).                                                                                                                             |
| `popover-field.ts` | `popoverField()` — trigger + anchored popover over an adopted native input (`ui-date-field`, `ui-color-field`).                                                                                                             |
| `chart-child.ts`   | `ChartChildElement` — find the owning `ui-chart`, register, unregister, re-render on attribute change.                                                                                                                      |
| `math.ts`          | `clamp()`, `clampSnap()`, and `numberAttribute()`/`toNumber()` — the one guarded numeric-attribute reader.                                                                                                                  |
| `query.ts`         | `scopedQuery()`/`scopedFirst()` — light-DOM child queries that skip a nested same-tag instance's parts.                                                                                                                     |
| `parts.ts`         | `ensureButton()` — adopt an authored action button, or generate a labelled one.                                                                                                                                             |

## Components

| Element                                               | Base UI          | Notes                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui-menu` (+ popup, item, checkbox/radio item, group) | Menu / Submenu   | Roving focus, typeahead, top-layer popup; `submenu` → nested side-anchored menu; `menuitemcheckbox`/`menuitemradio` items and labelled `role=group`s.                                                                                                                             |
| `ui-menubar`                                          | Menubar          | Roving across sibling menus; arrow/hover crosses + opens the adjacent menu; `orientation` (the open key moves to the cross axis).                                                                                                                                                 |
| `ui-context-menu`                                     | Context Menu     | Menu opened at the pointer (`openAt` virtual anchor); right-click / touch long-press.                                                                                                                                                                                             |
| `ui-navigation-menu` (+ list/item/content)            | Navigation Menu  | Hover-intent panels, one open at a time; morph size vars; RTL roving triggers.                                                                                                                                                                                                    |
| `ui-combobox` (+ popup/viewport/spacer/empty, chips)  | Combobox         | Store-backed **virtualized** listbox; fixed row pool over 10,000+ items; form-associated; `multiple` → chips + `[data-combobox-clear]`; `readonly`; `columns` → `role=grid` with 2D arrows; `createItems()` for record collections.                                               |
| `ui-switch`                                           | Switch           | Form-associated `role=switch` toggle.                                                                                                                                                                                                                                             |
| `ui-separator`                                        | Separator        | `role=separator` / decorative; demotes to `role=none` inside a `listbox`, whose children may only be options or groups.                                                                                                                                                           |
| `ui-popover` (+ popup)                                | Popover          | Anchored **non-modal** popup; title/description labelling + `[data-popover-close]`.                                                                                                                                                                                               |
| `ui-dialog` (+ popup, backdrop)                       | Dialog / Alert   | **Modal**: focus trap + scroll lock + `aria-modal`; `static`, or `alert` → `alertdialog`.                                                                                                                                                                                         |
| `ui-drawer` (+ popup, backdrop)                       | Drawer           | Edge-anchored modal; swipe-to-dismiss + `[data-drawer-swipe]` swipe-to-open; `side`, `--drawer-offset`, `--drawer-keyboard-inset`.                                                                                                                                                |
| `ui-scroll-area` (+ viewport/scrollbar/thumb)         | Scroll Area      | Overlay scrollbars; overflow detection, proportional thumb, drag-to-scroll, WebKit overscroll feedback; a scrollbar press never takes focus.                                                                                                                                      |
| `ui-radio-group` (+ radio)                            | Radio Group      | Roving, selection-follows-focus, single form value.                                                                                                                                                                                                                               |
| `ui-toggle` / `ui-toggle-group`                       | Toggle (Group)   | `aria-pressed` buttons; group does single/multiple roving selection.                                                                                                                                                                                                              |
| `ui-checkbox` (+ group)                               | Checkbox         | Form-associated tri-state; group derives a "select all" master.                                                                                                                                                                                                                   |
| `ui-select` (+ popup, option, group)                  | Select           | Trigger + listbox popup, `activedescendant` nav, typeahead, form value; labelled option groups + `data-selected` hook; `multiple` selection; `readonly`; `orientation`; press-drag-release selection.                                                                             |
| `ui-autocomplete` (+ popup/list/empty)                | Autocomplete     | Combobox core, `selectionMode: none` — form value is the input text; `readonly`.                                                                                                                                                                                                  |
| `ui-toolbar`                                          | Toolbar          | `role=toolbar`, one roving tab stop across mixed controls, orientation.                                                                                                                                                                                                           |
| `ui-progress`                                         | Progress         | `role=progressbar`; determinate/indeterminate; `--progress` fill; `format` → `aria-valuetext`.                                                                                                                                                                                    |
| `ui-meter`                                            | Meter            | `role=meter`; low/high/optimum → `optimal`/`suboptimal`/`poor`; `format` → `aria-valuetext`.                                                                                                                                                                                      |
| `ui-avatar`                                           | Avatar           | Image load/error → fallback state machine (`data-state`).                                                                                                                                                                                                                         |
| `ui-tooltip` (+ content)                              | Tooltip          | Hover/focus intent + delay groups; `role=tooltip`, `aria-describedby`.                                                                                                                                                                                                            |
| `ui-preview-card` (+ content)                         | Preview Card     | Hover-card; interactive content stays open when the pointer moves in.                                                                                                                                                                                                             |
| `ui-number-field`                                     | Number Field     | `role=spinbutton`, steppers + keys, clamp/snap, form value; `[data-number-scrub]` drag-to-change (Pointer Lock).                                                                                                                                                                  |
| `ui-slider` (+ track, thumb)                          | Slider           | `role=slider`, keyboard + pointer, orientation, `--slider` fraction, form value; multi-thumb **range** with `min-distance`.                                                                                                                                                       |
| `ui-field`                                            | Field            | Label/description/error IDREF wiring + validity in light DOM; a `validate` rule (sync or async) published through `setCustomValidity`; `validation-mode`/`validation-debounce`; `data-touched`/`dirty`/`filled`/`focused`/`valid`/`invalid`.                                      |
| `ui-fieldset`                                         | Fieldset         | `role=group` labelled legend; disabled propagation.                                                                                                                                                                                                                               |
| `ui-form`                                             | Form             | Submit-time validation over its fields (one pass, so an implicit submit validates once); focus first invalid, error summary.                                                                                                                                                      |
| `ui-otp-field`                                        | OTP Field        | Multi-cell code input; caret movement, paste distribution, masking, form value.                                                                                                                                                                                                   |
| `ui-collapsible`                                      | Collapsible      | Single disclosure; `aria-expanded`, `data-state` for height animation.                                                                                                                                                                                                            |
| `ui-accordion` (+ item)                               | Accordion        | Single/multiple sections; APG header arrow-nav; region cross-refs.                                                                                                                                                                                                                |
| `ui-tabs` (+ tab-list, indicator)                     | Tabs             | `role=tablist` roving; auto/manual activation; panel cross-refs; orientation; `ui-tab-indicator` publishes `--active-tab-*` + `data-activation-direction`.                                                                                                                        |
| `ui-toast` (+ viewport)                               | Toast            | Top-layer live region + manager (`add`/`update`/`dismiss`/`clear`, `toast()`/`updateToast()`); **Sonner-style stack** (peek + hover-expand, `visible` limit, swipe-to-dismiss), auto-dismiss w/ hover-pause, action/close, `role=status`/`alert`.                                 |
| `ui-calendar` (+ popup)                               | — (beyond)       | Month `role=grid`; 2D roving nav, min/max/disabled days, form value; also the popover content for `ui-date-field`.                                                                                                                                                                |
| `ui-date-field`                                       | — (beyond)       | Native-first `<input type=date>` enhancer: trigger opens a `ui-calendar` popover, writes the ISO pick back to the input.                                                                                                                                                          |
| `ui-color-picker` (+ popup)                           | — (beyond)       | Saturation/brightness plane (`role=slider`) + hue range + hex input; form value (`#rrggbb`).                                                                                                                                                                                      |
| `ui-color-field`                                      | — (beyond)       | Native-first `<input type=color>` enhancer: swatch trigger opens a `ui-color-picker` popover.                                                                                                                                                                                     |
| `ui-drop-zone`                                        | — (beyond)       | Native-first `<input type=file>` drag/drop target; `accept` filtering, `data-dragging`, `change` with the accepted files.                                                                                                                                                         |
| `ui-search-field`                                     | — (beyond)       | Native-first `<input type=search>`: clear affordance, Escape-to-clear, debounced `search` event.                                                                                                                                                                                  |
| `ui-chip`                                             | — (beyond)       | Compact, optionally-removable token; `remove` event, Delete/Backspace, `[data-state]` exit.                                                                                                                                                                                       |
| `ui-banner`                                           | — (beyond)       | Persistent inline `role=status`/`alert` (the non-transient sibling of `ui-toast`); dismissible with exit animation.                                                                                                                                                               |
| `ui-table`                                            | — (beyond)       | Enhances a native `<table>`: sortable headers, select-all/row selection, loading + pagination events, list-layout cell metadata, and row click delegation.                                                                                                                        |
| `ui-arrow`                                            | Arrow            | Caret centered on the anchor by the positioner (`data-side`); place inside any anchored popup.                                                                                                                                                                                    |
| `ui-chart` (+ axis, grid)                             | — (MUI X Charts) | SVG plot container: dataset from an authored `<table>` (accessible no-JS fallback) or `.data`; axes/grid declared as child elements; `ui-chart-axis` renders real HTML tick text (`--tick` fraction), no SVG text measurement. See [`### ui-chart contract`](#ui-chart-contract). |
| `ui-chart-bar`                                        | — (MUI X Charts) | Bar series; grouped side-by-side or `stack`-grouped (mixed-sign split above/below zero).                                                                                                                                                                                          |
| `ui-chart-line`                                       | — (MUI X Charts) | Line series; `curve` (linear/step ×3/monotone), optional `area` fill (stackable) and point `marks`, `connect-nulls` gap bridging.                                                                                                                                                 |
| `ui-chart-pie`                                        | — (MUI X Charts) | Pie/donut; `inner-radius`/`pad-angle`/`sort`; slice `data-index` always tracks the original row regardless of paint order.                                                                                                                                                        |
| `ui-chart-scatter`                                    | — (MUI X Charts) | x/y-pair series over two continuous axes; rows missing either coordinate are skipped.                                                                                                                                                                                             |
| `ui-chart-reference-line`                             | — (MUI X Charts) | Fixed horizontal/vertical annotation line + label at a constant axis value; never contributes to the axis domain.                                                                                                                                                                 |
| `ui-chart-legend`                                     | — (MUI X Charts) | One toggle button per series (visibility + `toggle` event); hover highlights the whole series.                                                                                                                                                                                    |
| `ui-chart-tooltip`                                    | — (MUI X Charts) | Pointer-following popover; `trigger` `axis` (all series at the hovered index) or `item` (one series); generated table or an authored `<template>`.                                                                                                                                |
| `ui-gauge`                                            | — (MUI X Charts) | Standalone SVG-arc meter (the `ui-meter` idiom, drawn as an arc); `--gauge` fraction, `role=meter`.                                                                                                                                                                               |

### `ui-table` contract

Author a real `<table>` inside `<ui-table>`; no-JS output remains semantic and
readable. The enhancer owns only behaviour and `data-*` hooks:

- Sorting: `th[data-sort-key]`, optional `format` / `data-format`
  (`base`/`numeric`/`currency`), emits `sort`.
- Controls: `[data-table-filters]` and `[data-table-bulk]` live in a
  `thead` row marked `[data-table-controls-row]` above the column header row;
  authored controls outside the table are moved there on upgrade.
- Selection: `input[type=checkbox][data-table-select-all]` and
  `[data-table-select-row]`; updates `[data-table-selected-count]`,
  `[data-table-bulk-action]`, and emits `selectionchange`.
- Pagination: `paginate`, `has-previous-page`, `has-next-page`; uses authored
  `[data-table-pagination]` controls or generates Previous/Next buttons in
  `tfoot`; emits `previouspage` / `nextpage`.
- Responsive-list hooks: header `data-list-slot`; body cells receive
  `data-label`, `data-list-slot`, and `data-format` for consumer CSS.
- Row click delegation: `<tr click-delegate="action-id">`; the target action must
  already exist in the row for keyboard/screen-reader access.

### `ui-chart` contract

A third lineage beyond Base UI and Shopify App Home: a chart family ported from
[`@mui/x-charts`](https://github.com/mui/mui-x/tree/master/packages/x-charts) (v9.12.0, MIT).
Charts render **SVG** — the one place this package is not purely headless — but they sit on the
same side of its contract as `ui-table`: the library owns **behaviour and geometry** (scales,
stacking, pointer→datum inversion, ARIA, `data-*` state), the consumer owns **all paint**. Marks
carry only structural attributes (`x`/`y`/`width`/`height`/`d`/`cx`/`cy`/`r`, plus the
`fill="none"` a stroked line needs — structure, not paint), so an unstyled chart renders as
unstyled black shapes, and `src/styles/charts.css` here is only a demo skin. The library never
chooses a color.

- Dataset: an authored `<table>` inside `<ui-chart>` (columns keyed by header text; `<time
datetime>` cells parse as dates, `data-value` overrides a cell's display text) — this is the
  no-JS-accessible fallback and it **stays** the accessible representation after upgrade (the
  generated `<svg>` is `aria-hidden`). A `.data` property setter accepts the same shape
  programmatically and wins over the table.
- Axes/grid/series are **child elements**, not props: `<ui-chart-axis position="bottom|top|left|right"
key="…" scale="band|point|linear|log|sqrt|time">`, `<ui-chart-grid axis="x|y">` (grid lines are
  opt-in — no `ui-chart-grid`, no lines), and one series element per series
  (`ui-chart-bar`/`-line`/`-pie`/`-scatter`, in paint order = document order). `ui-chart-axis`
  generates real HTML `<span data-part="tick" style="--tick: 0…1">` children (a fraction, the
  `ui-progress`/`ui-slider` idiom) — axis text is never SVG, so there is no text-measurement/
  auto-sizing machinery to port from MUI; layout around the plot is ordinary consumer CSS grid, not
  component-computed margins.
- Every series element shares one attribute surface (`key`, `label`, `highlight`, `fade`) from a
  common base class, and registers with `ui-chart`, which keeps the registrations in document order
  as its single source of truth (`chart.getSeries()`). A series' position in that list is its
  palette slot — the `--series-index`/`data-series-index` on its marks, its legend swatch and its
  tooltip row all agree, and stay put while other series are toggled. Stacking is opt-in per series
  (`stack="…"`); `<ui-chart stack-offset="none|diverging">` chooses how a stack accumulates, with
  `diverging` splitting mixed-sign values above and below the zero baseline.
- Interaction, by how the pointer resolves to a datum:
  - **Band axis** — invisible per-category hit rects (`[data-part="band"]`) cover each category, so
    hovering anywhere in the column triggers the whole column.
  - **Continuous axis** — a series type that carries its own coordinates (scatter) resolves the
    nearest datum through its own hit test; otherwise the pointer's x is inverted through the scale.
  - **A mark directly** — it paints over its band, so hovering it highlights that specific
    series+index.

  `ArrowLeft`/`ArrowRight` walk the highlighted index once the chart is focused; `Escape` clears.
  `ui-chart-legend` toggles a series' visibility and highlights it on hover; `ui-chart-tooltip` is
  a `popover="manual"` pointer-follower driven by the `highlight` event. (The band hit rects are
  `fill="transparent"` — structural, required for pointer hit-testing, the same exception as
  `fill="none"` on a stroke.)

- Events (bubble from `ui-chart`): `select` (`{series, seriesIndex, index, value}`, mark click) and
  `highlight` (`{series, seriesIndex, index}`, any highlight change — pointer, keyboard, legend).
  `ui-chart-legend` additionally emits its own `toggle` (`{series, hidden}`).
- Scope: bar, line/area, pie/donut, scatter, reference line, legend, tooltip, and a standalone
  `ui-gauge` — the MIT-licensed subset of MUI X Charts. Radar and a path-morphing animation engine
  are deferred (a stretch milestone); zoom/pan, export, heatmap, funnel, sankey,
  candlestick, geo/map, WebGL rendering, and every other Pro/Premium feature are out of scope
  entirely — none of it is MIT-licensed.
- Kernel: `chart-scale.ts` (linear/log/sqrt/time/band/point scales + ticks) and `chart-shape.ts`
  (line/area curve generators, arc paths, pie angle allocation) are a **from-scratch
  reimplementation** of the relevant d3-scale/d3-shape (ISC © Mike Bostock) subset — this package
  ships zero runtime dependencies, so nothing is vendored; both are pinned against fixtures captured
  from real d3 output (`chart-scale.dom.test.ts`, `chart-shape.dom.test.ts`).

**Known simplifications**, each noted in its module's own doc comment: d3-arc derives `padAngle`
from radius and arc length, where `arcPath` uses a simple angular inset (visually equivalent);
`cornerRadius` (rounded slice corners) is not implemented; `ui-chart-tooltip`'s pointer-follow
positioning does not yet clamp to the viewport edge.

### Entry points & bundle size

The package has four flavours of entry point (see `package.json` `exports`):

| Import                              | Effect                                                                                                                | Tree-shakes?                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `@chr33s/base-wc/elements`          | Registers **every** element up front. Use from an app shell that renders `ui-*` tags without importing their classes. | no (by design — registers every element) |
| `@chr33s/base-wc` (barrel)          | Re-exports every class/type/helper. Importing a **class** registers its element.                                      | **yes**                                  |
| `@chr33s/base-wc/select` (per-file) | One component + only the shared infra it uses. Import its **class** to register it.                                   | n/a — already minimal                    |
| `@chr33s/base-wc/src`               | TypeScript source barrel for bundlers configured to consume TypeScript dependencies directly.                         | **yes**                                  |

Each component module self-registers (`customElements.define`) when it is
**evaluated**, and a module is only evaluated if the bundler keeps it — which it
does when you import a value (class/helper) from it. So always use a **value
import**, never a bare side-effect import:

```ts
import { UISelect } from "@chr33s/base-wc"; // ✅ ~11 kB — registers ui-select
import { UISwitch } from "@chr33s/base-wc/switch"; // ✅ per-file, registers ui-switch
import "@chr33s/base-wc/switch"; // ⚠️ dropped in a tree-shaking build — registers nothing
```

That 11 kB is `UISelect` plus only the shared infra it uses; combobox / menu /
slider / toast and the rest are absent. Every non-`elements.ts` file is
side-effect-free (see `package.json` `sideEffects`), which is why the bare
`import` above registers nothing, and the shared-infra modules (`anchor`,
`dismiss`, `roving`, `focus-trap`, `transitions`, …) are pure too, so unused
helpers drop out. (Sizes are minified and not gzipped, measured by bundling a
single consumer import with Vite: about 11 kB for `UISelect`, 1.4 kB for `UISwitch`
alone, against 163.6 kB for the whole `elements.ts` set, charts included.)
Rule of thumb: **`elements.ts` when you want everything; named class imports
when bundle size matters.**

> **In non-tree-shaking contexts** (Vitest, `vp dev`) a bare
> `import ".../index.ts"` still evaluates every re-export and registers
> everything — but don't rely on that; `elements.ts` is the portable
> "register all".

Tests are colocated as `*.dom.test.ts` (happy-dom, run by `npm test`): ARIA
wiring, keyboard navigation, filtering, selection events, and the virtualization
invariant (fixed DOM-row pool while the spacer scales to the full data height).
Behaviours that need a real engine — `<form>` submission through
`ElementInternals`, the Popover-API top layer, focus trap / scroll lock, anchor
positioning (point + side), and virtualization under real layout — are covered by
`src/ui.e2e.test.ts` (Playwright/Chromium, run by `npm run test:e2e`), which
serves the library as a module into a page and drives it end-to-end.

## Toolchain

Built and checked by [Vite+](https://viteplus.dev) (`vite-plus`), which bundles
Vite, Vitest, oxlint, and oxfmt behind one CLI. `vite` is aliased to
`@voidzero-dev/vite-plus-core` in `devDependencies` and `overrides`, so Storybook
resolves the same Vite build the rest of the toolchain uses.

| Script                    | Runs                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `npm run build`           | `vp pack` — unbundled ESM + `.d.ts` modules and the aggregate CSS entry into `dist/` |
| `npm run build:storybook` | Static Storybook site into `storybook-static/`                                       |
| `npm run dev`             | Storybook dev server on port 6006                                                    |
| `npm run check`           | `vp check` — format, lint, and type check                                            |
| `npm run fix`             | `vp check --fix` — autofix formatting and lint                                       |
| `npm test`                | `vp test` — the happy-dom `*.dom.test.ts` suites                                     |
| `npm run test:e2e`        | `playwright test` — `src/ui.e2e.test.ts` in real Chromium                            |
| `npm run test:package`    | Builds and bundles consumer fixtures to enforce export and tree-shaking behavior     |

Configuration lives in `vite.config.ts` (`pack` / `test` / `lint` blocks),
`tsconfig.json`, and `playwright.config.ts`. The e2e run starts `vp dev` itself
and mounts into `index.html`, a blank host page.

## Port status

**Complete** against Base UI
[`47b4052`](https://github.com/mui/base-ui/tree/47b40521eab921c2756bf9bdb0b0f07fbfdb8c8c) — the
ref pinned in `package.json`. Every Base UI component in the
[Components](#components) table is ported, Menu through **Toast** and **Arrow**,
on the shared infrastructure modules listed above; the two tables carry the full
inventory.

Beyond Base UI, a **charts** family (bar, line/area, pie, scatter, reference
line, legend, tooltip, gauge) is ported from MUI X Charts — see
[`### ui-chart contract`](#ui-chart-contract) above.

### Base UI parity — known deltas

Intentional architectural differences remain, and there are three:

- **`Portal` + `Positioner` collapse** into the single light-DOM `*-popup`
  element (Popover-API top layer + `anchor.ts`).
- **`DirectionProvider`** is replaced by `direction.ts`'s `isRTL()`, which reads
  the authored `dir` rather than a context an ancestor has to provide.
- **`Combobox.Group` / `Combobox.GroupLabel` are not ported.** A group needs a
  real `role="group"` (or, in a grid, `rowgroup`) container wrapping its items,
  and `ui-combobox` renders every row from a **fixed recycled pool** whose
  elements are reused across the whole store — there is no per-group container
  to put the role on, and adding one would mean giving up the constant row count
  that lets the control hold 10,000+ items. Grouping is available on
  `ui-select`, whose options are authored elements. This is the same trade as
  the Portal/Positioner collapse: the port's structure differs, deliberately.

Every other Base UI _feature_ gap is closed — including the Drawer's
swipe-to-open edge zone (`[data-drawer-swipe]`) and virtual-keyboard avoidance
(`--drawer-keyboard-inset`, from the visual viewport), the Tabs indicator, the
Field's async `validate` rule, `readonly` across the combobox family, Combobox
grid mode, and press-drag-release selection.

### Change reasons

Every `open` / `close` event from the shared overlay — dialog, drawer, popover,
menu, menubar, context menu, tooltip, preview card, select, combobox,
autocomplete — carries a `detail.reason`, as do the `change` events of the
combobox family and `ui-select`. The vocabulary is the `ChangeReason` union in
`reasons.ts`: `trigger-press`, `trigger-hover`, `input-press`,
`list-navigation`, `item-press`, `clear-press`, `chip-remove-press`,
`input-change`, `input-clear`, `close-press`, `outside-press`, `escape-key`,
`focus-out`, `swipe`, `cancel-open`, `sibling-open`, and `"none"` for a
programmatic call with nothing more specific to say. Every member is one some
component actually emits, so the union stays exhaustively switchable.

## Beyond Base UI (Shopify App Home parity)

Base UI has no date/color picker, drop zone, search field, chip, banner, or data
table, but Shopify's App Home component kit does. These follow the **same
headless conventions** (light DOM, native-first where a native control exists,
and shared primitives where needed) and are the genuinely _behavioural_ gaps
worth owning here:

- **`ui-calendar` / `ui-date-field`** — a month grid with 2D roving keyboard
  navigation, and a native-first `<input type=date>` wrapper that opens it.
- **`ui-color-picker` / `ui-color-field`** — an HSV plane + hue + hex picker, and
  a native-first `<input type=color>` wrapper.
- **`ui-drop-zone`** — drag/drop over a native `<input type=file>`.
- **`ui-search-field`** — a native `<input type=search>` with a clear affordance
  and a debounced `search` event (the primitive below `ui-combobox`).
- **`ui-chip`** — the combobox's removable token, generalised to standalone.
- **`ui-banner`** — a persistent inline alert (the non-transient `ui-toast`).
- **`ui-table`** — native table enhancement for sort, selection, pagination,
  responsive-list metadata, and row click delegation.

### Deliberately out of scope

App Home's **layout** (Box, Stack, Grid, Page, Section), **typography** (Text,
Heading, Paragraph), and **content/media** (Badge, Icon, Image, Thumbnail)
components are _intentionally_ **not** ported. This is a headless _behavioural_
library — styling and composition are delegated to consumer CSS
(`src/styles.css` here is only a demo theme). Their absence is a boundary, not a
backlog.

## License

[TK: license — `package.json` has no `license` field, and this readme is precise
about the MIT boundaries of what it ports _from_ (Base UI, MUI X Charts, the
d3-scale/d3-shape reimplementation). Name the license here and add the field.]
