# `@chr33s/base-wc` — headless web components

Base UI, ported to **dependency-free** custom elements. Framework-agnostic:
any server-rendered or client runtime can consume them.

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
wrap a **real native control** — the component enhances it rather than replacing
it. For server-rendered, no-JS-first pages this is the contract to reach for:

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
native element is the single source of truth for the form value — so
`ElementInternals` is **not** used in this mode, there is no double submission —
and the component follows one of two patterns:

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

| Component                                                            | No-JS baseline                   | Upgrade pattern                                             |
| -------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------- |
| `ui-switch`, `ui-checkbox`                                           | `<input type=checkbox>` required | Native style-in-place; no standalone fallback               |
| `ui-select`                                                          | `<select>`                       | Retires native select; direct `ui-select-option` is JS-only |
| `ui-number-field`                                                    | `<input type=number>`            | Native style-in-place, or standalone spinbutton             |
| `ui-slider`                                                          | Single `<input type=range>`      | Native single slider, or standalone multi-thumb range       |
| `ui-radio-group`                                                     | Native radio inputs              | Native style-in-place, or standalone radiogroup             |
| `ui-search-field`                                                    | `<input type=search>`            | Native style-in-place + clear/debounced `search`            |
| `ui-date-field`, `ui-color-field`                                    | Native date/color inputs         | Retire native input; picker writes back to it               |
| `ui-drop-zone`                                                       | `<input type=file>`              | Retire native input; drag/drop writes accepted files        |
| `ui-table`                                                           | `<table>`                        | Native table enhancer; sort/select/pagination hooks         |
| `ui-combobox`                                                        | —                                | JS store/listbox control, form-associated                   |
| `ui-autocomplete`                                                    | Authored input                   | JS suggestion listbox; input text is the form value         |
| `ui-collapsible`, `ui-accordion`, `ui-tabs`                          | Authored triggers/panels         | ARIA wiring, disclosure/roving behaviour                    |
| `ui-menu`, `ui-popover`, `ui-dialog`, `ui-drawer`, `ui-context-menu` | Authored trigger/content         | Popover top layer + JS positioning/dismissal                |
| `ui-meter`, `ui-progress`                                            | —                                | Custom ARIA elements with CSS variable fill hooks           |
| `ui-toast`, `ui-scroll-area`, `ui-preview-card`, `ui-tooltip`        | —                                | JS enhancement-only; `ui-tooltip` can degrade to `title`    |

## Shared infrastructure (`build once, reuse everywhere`)

| Module             | Role                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `id.ts`            | Document-unique id generator for ARIA cross-references.                                                                                        |
| `native.ts`        | `adoptedControl()`/`retireNative()`/`fireNativeChange()` — adopt an authored native control for no-JS fallback and propagate its value/change. |
| `lifecycle.ts`     | `connectLightDom()` waits for required authored parts and preserves wiring across reconnects.                                                  |
| `anchor.ts`        | `SUPPORTS_ANCHOR` + `anchor()` positioner (Floating UI stand-in).                                                                              |
| `dismiss.ts`       | `onOutsidePress()` capture-phase light-dismiss.                                                                                                |
| `overlay.ts`       | `overlay()` popup lifecycle: top layer + position + dismiss + exit.                                                                            |
| `combobox-core.ts` | Shared editable-combobox ARIA, active-option, overlay, dismissal, and option-delegation state.                                                 |
| `text.ts`          | `normalize()` diacritic-/case-insensitive filter key.                                                                                          |
| `focus-trap.ts`    | `trapFocus()` focus cycle + restore; `getFocusable()`.                                                                                         |
| `scroll-lock.ts`   | `lockScroll()` reference-counted background scroll freeze.                                                                                     |
| `roving.ts`        | `roving()` generalized roving-tabindex composite navigation.                                                                                   |
| `intent.ts`        | Hover-intent delay groups for tooltip/preview-card.                                                                                            |
| `transitions.ts`   | `runExit()` defers hide until the CSS exit animation finishes.                                                                                 |
| `direction.ts`     | `isRTL()` — flips horizontal arrow keys / side placement in RTL.                                                                               |

## Components

| Element                                               | Base UI         | Notes                                                                                                                                                                                                                    |
| ----------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ui-menu` (+ popup, item, checkbox/radio item, group) | Menu / Submenu  | Roving focus, typeahead, top-layer popup; `submenu` → nested side-anchored menu; `menuitemcheckbox`/`menuitemradio` items and labelled `role=group`s.                                                                    |
| `ui-menubar`                                          | Menubar         | Roving across sibling menus; arrow/hover crosses + opens the adjacent menu.                                                                                                                                              |
| `ui-context-menu`                                     | Context Menu    | Menu opened at the pointer (`openAt` virtual anchor); right-click / touch long-press.                                                                                                                                    |
| `ui-navigation-menu` (+ list/item/content)            | Navigation Menu | Hover-intent panels, one open at a time; morph size vars; RTL roving triggers.                                                                                                                                           |
| `ui-combobox` (+ popup/viewport/spacer/empty, chips)  | Combobox        | Store-backed **virtualized** listbox; fixed row pool over 10,000+ items; form-associated; `multiple` → chips + `[data-combobox-clear]`.                                                                                  |
| `ui-switch`                                           | Switch          | Form-associated `role=switch` toggle.                                                                                                                                                                                    |
| `ui-separator`                                        | Separator       | `role=separator` / decorative.                                                                                                                                                                                           |
| `ui-popover` (+ popup)                                | Popover         | Anchored **non-modal** popup; title/description labelling + `[data-popover-close]`.                                                                                                                                      |
| `ui-dialog` (+ popup, backdrop)                       | Dialog / Alert  | **Modal**: focus trap + scroll lock + `aria-modal`; `static`, or `alert` → `alertdialog`.                                                                                                                                |
| `ui-drawer` (+ popup, backdrop)                       | Drawer          | Edge-anchored modal; swipe-to-dismiss + `[data-drawer-swipe]` swipe-to-open; `side`, `--drawer-offset`, `--drawer-keyboard-inset`.                                                                                       |
| `ui-scroll-area` (+ viewport/scrollbar/thumb)         | Scroll Area     | Overlay scrollbars; overflow detection, proportional thumb, drag-to-scroll.                                                                                                                                              |
| `ui-radio-group` (+ radio)                            | Radio Group     | Roving, selection-follows-focus, single form value.                                                                                                                                                                      |
| `ui-toggle` / `ui-toggle-group`                       | Toggle (Group)  | `aria-pressed` buttons; group does single/multiple roving selection.                                                                                                                                                     |
| `ui-checkbox` (+ group)                               | Checkbox        | Form-associated tri-state; group derives a "select all" master.                                                                                                                                                          |
| `ui-select` (+ popup, option, group)                  | Select          | Trigger + listbox popup, `activedescendant` nav, typeahead, form value; labelled option groups + `data-selected` hook; `multiple` selection.                                                                             |
| `ui-autocomplete` (+ popup/list/empty)                | Autocomplete    | Combobox core, `selectionMode: none` — form value is the input text.                                                                                                                                                     |
| `ui-toolbar`                                          | Toolbar         | `role=toolbar`, one roving tab stop across mixed controls, orientation.                                                                                                                                                  |
| `ui-progress`                                         | Progress        | `role=progressbar`; determinate/indeterminate; `--progress` fill.                                                                                                                                                        |
| `ui-meter`                                            | Meter           | `role=meter`; low/high/optimum → `optimal`/`suboptimal`/`poor`.                                                                                                                                                          |
| `ui-avatar`                                           | Avatar          | Image load/error → fallback state machine (`data-state`).                                                                                                                                                                |
| `ui-tooltip` (+ content)                              | Tooltip         | Hover/focus intent + delay groups; `role=tooltip`, `aria-describedby`.                                                                                                                                                   |
| `ui-preview-card` (+ content)                         | Preview Card    | Hover-card; interactive content stays open when the pointer moves in.                                                                                                                                                    |
| `ui-number-field`                                     | Number Field    | `role=spinbutton`, steppers + keys, clamp/snap, form value; `[data-number-scrub]` drag-to-change (Pointer Lock).                                                                                                         |
| `ui-slider` (+ track, thumb)                          | Slider          | `role=slider`, keyboard + pointer, orientation, `--slider` fraction, form value; multi-thumb **range** with `min-distance`.                                                                                              |
| `ui-field`                                            | Field           | Label/description/error IDREF wiring + validity in light DOM.                                                                                                                                                            |
| `ui-fieldset`                                         | Fieldset        | `role=group` labelled legend; disabled propagation.                                                                                                                                                                      |
| `ui-form`                                             | Form            | Submit-time validation over its fields; focus first invalid, error summary.                                                                                                                                              |
| `ui-otp-field`                                        | OTP Field       | Multi-cell code input; caret movement, paste distribution, masking, form value.                                                                                                                                          |
| `ui-collapsible`                                      | Collapsible     | Single disclosure; `aria-expanded`, `data-state` for height animation.                                                                                                                                                   |
| `ui-accordion` (+ item)                               | Accordion       | Single/multiple sections; APG header arrow-nav; region cross-refs.                                                                                                                                                       |
| `ui-tabs` (+ tab-list)                                | Tabs            | `role=tablist` roving; auto/manual activation; panel cross-refs; orientation.                                                                                                                                            |
| `ui-toast` (+ viewport)                               | Toast           | Top-layer live region + manager (`add`/`dismiss`/`clear`, `toast()`); **Sonner-style stack** (peek + hover-expand, `visible` limit, swipe-to-dismiss), auto-dismiss w/ hover-pause, action/close, `role=status`/`alert`. |
| `ui-calendar` (+ popup)                               | — (beyond)      | Month `role=grid`; 2D roving nav, min/max/disabled days, form value; also the popover content for `ui-date-field`.                                                                                                       |
| `ui-date-field`                                       | — (beyond)      | Native-first `<input type=date>` enhancer: trigger opens a `ui-calendar` popover, writes the ISO pick back to the input.                                                                                                 |
| `ui-color-picker` (+ popup)                           | — (beyond)      | Saturation/brightness plane (`role=slider`) + hue range + hex input; form value (`#rrggbb`).                                                                                                                             |
| `ui-color-field`                                      | — (beyond)      | Native-first `<input type=color>` enhancer: swatch trigger opens a `ui-color-picker` popover.                                                                                                                            |
| `ui-drop-zone`                                        | — (beyond)      | Native-first `<input type=file>` drag/drop target; `accept` filtering, `data-dragging`, `change` with the accepted files.                                                                                                |
| `ui-search-field`                                     | — (beyond)      | Native-first `<input type=search>`: clear affordance, Escape-to-clear, debounced `search` event.                                                                                                                         |
| `ui-chip`                                             | — (beyond)      | Compact, optionally-removable token; `remove` event, Delete/Backspace, `[data-state]` exit.                                                                                                                              |
| `ui-banner`                                           | — (beyond)      | Persistent inline `role=status`/`alert` (the non-transient sibling of `ui-toast`); dismissible with exit animation.                                                                                                      |
| `ui-table`                                            | — (beyond)      | Enhances a native `<table>`: sortable headers, select-all/row selection, loading + pagination events, list-layout cell metadata, and row click delegation.                                                               |
| `ui-arrow`                                            | Arrow           | Caret centered on the anchor by the positioner (`data-side`); place inside any anchored popup.                                                                                                                           |

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

```ts
import "@chr33s/base-wc/elements"; // register every custom element
```

A runnable **Storybook** of every component lives alongside them — the
`*.stories.ts` files here, driven by the config in
[`.storybook/`](./.storybook/) and themed by
[`src/styles.css`](./src/styles.css), which composes the focused modules in
[`src/styles/`](./src/styles/). Run it with `npm install && npm run dev`,
or build the static site with `npm run build:storybook`
(`@storybook/web-components-vite` consumes the TypeScript sources directly). The
Storybook tooling is a `devDependency` and never ships with the components.

### Entry points & bundle size

The package has three flavours of entry point (see `package.json` `exports`):

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

`import { UISelect }` bundles ~11 kB and registers `ui-select`; combobox / menu /
slider / toast and the rest are absent. Because every non-`elements.ts` file is
side-effect-free (see `package.json` `sideEffects`), a **bare** `import` of a
component file is treeshaken away — reach for its class instead, or import
`elements.ts` for the whole set. (Sizes are minified and not gzipped, measured
by bundling a single consumer import with Vite: about 11 kB for `UISelect`,
1.4 kB for `UISwitch` alone, against 125.5 kB for the whole
`elements.ts` set.)
The shared-infra modules (`anchor`, `dismiss`, `roving`, `focus-trap`,
`transitions`, …) are pure too, so unused helpers drop out. Rule of thumb:
**`elements.ts` when you want everything; named class imports when bundle size
matters.**

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

**Complete.** Every Base UI component is ported: Menu (+ Submenu, checkbox/radio
items, groups), Menubar, Context Menu, Navigation Menu, Combobox (virtualized),
Switch, Separator, Popover, Dialog (+ Alert), Drawer, Scroll Area, Radio Group,
Toggle (+ Group), Checkbox (+ Group), Select (+ groups), Autocomplete, Toolbar,
Number Field, Slider, OTP Field, Field, Fieldset, Form, Collapsible, Accordion,
Tabs, Progress, Meter, Avatar, Tooltip, Preview Card, **Toast**, **Arrow** — on
the shared Positioner (point + side anchoring, arrow alignment) / Dismissal /
light-DOM lifecycle / combobox state / normalization / focus-trap / scroll-lock /
roving / hover-intent / transitions / direction (RTL) infrastructure.

Overlays defer their hide via `runExit` so a CSS `[data-state]` exit animation
plays out; composites flip their horizontal arrows under RTL. Logic is covered
by happy-dom `*.dom.test.ts`; layout / gesture / animation / `ElementInternals`
behaviours are verified end-to-end in `ui.e2e.test.ts` (Playwright/Chromium).

### Base UI parity — known deltas

Intentional architectural differences remain: `Portal` + `Positioner` collapse
into the single light-DOM `*-popup` element (Popover-API top layer +
`anchor.ts`), and `DirectionProvider` is replaced by `direction.ts`'s `isRTL()`.
Every Base UI _feature_ gap is now closed — including the Drawer's swipe-to-open
edge zone (`[data-drawer-swipe]`) and virtual-keyboard avoidance
(`--drawer-keyboard-inset`, from the visual viewport).

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
