/**
 * `@chr33s/base-wc` — Base UI ported to dependency-free web components.
 *
 * Every component renders in **light DOM** (so consumer CSS and cross-root ARIA
 * just work), leaf controls are **form-associated** via {@link ElementInternals},
 * popups use the **Popover API top layer** with **CSS anchor positioning** (and
 * a JS fallback), and shared DOM controllers replace framework context. See
 * `readme.md` for the port checklist and status.
 *
 * This barrel **re-exports** the classes, types, and shared infrastructure. It
 * carries no eager registration side effect, so bundlers can tree-shake it:
 * `import { UISelect } from ".../index.ts"` pulls in only Select (and its deps),
 * and importing a component's class registers its element (each module
 * self-registers on evaluation). To register **every** element in one import
 * — e.g. an app shell or a non-tree-shaking context — import `./elements.ts`.
 */
export {
  anchor,
  type AnchorOptions,
  arrowOffset,
  pairAnchor,
  rectAt,
  SUPPORTS_ANCHOR,
  type VirtualElement,
} from "./anchor.ts";
export { AriaCombobox, type AriaComboboxOptions } from "./combobox-core.ts";
export { UIArrow } from "./arrow.ts";
export {
  type ComboboxChangeDetail,
  type ComboboxCounts,
  type ComboboxItem,
  UICombobox,
  UIComboboxChip,
  UIComboboxChips,
  UIComboboxEmpty,
  UIComboboxPopup,
  UIComboboxSpacer,
  UIComboboxViewport,
} from "./combobox.ts";
export { UIAccordion, UIAccordionItem } from "./accordion.ts";
export {
  type AutocompleteChangeDetail,
  UIAutocomplete,
  UIAutocompleteEmpty,
  UIAutocompleteList,
  UIAutocompletePopup,
} from "./autocomplete.ts";
export { type AvatarState, UIAvatar } from "./avatar.ts";
export { UIBanner } from "./banner.ts";
export { type CalendarChangeDetail, UICalendar, UICalendarPopup } from "./calendar.ts";
export { UIDateField } from "./date-field.ts";
export { UIChartAxis, UIChartGrid } from "./chart-axis.ts";
export { UIChartBar } from "./chart-bar.ts";
export {
  type AxisPosition,
  type AxisRegistration,
  type ChartInvalidation,
  type ChartListener,
  type ChartRow,
  type ChartState,
  ChartStore,
  type ChartValue,
  getSeriesType,
  type HighlightScope,
  type HighlightState,
  isMarkFaded,
  isMarkHighlighted,
  isNumberValue,
  isSeriesFaded,
  isSeriesHighlighted,
  type MarkDescriptor,
  mergeExtent,
  numberAttribute,
  numericExtent,
  parseTable,
  registerSeriesType,
  type SeriesHit,
  type SeriesRegistration,
  type SeriesRenderContext,
  type SeriesTypeDefinition,
  type StackedValue,
  stackSeries,
  type StackOffset,
  toNumeric,
} from "./chart-core.ts";
export {
  type AxisScaleOptions,
  axisScale,
  categoricalDomain,
  categoryRows,
  DEFAULT_TICK_COUNT,
  seriesExtremum,
} from "./chart-domain.ts";
export { UIChartLegend, type UIChartToggleDetail } from "./chart-legend.ts";
export { UIChartLine } from "./chart-line.ts";
export { UIChartPie } from "./chart-pie.ts";
export { ChartPlot, type GridSpec } from "./chart-plot.ts";
export { UIChartReferenceLine } from "./chart-reference-line.ts";
export {
  type CategoryValue,
  categoryKey,
  type ContinuousScale,
  type DiscreteScale,
  type Scale,
  type ScaleType,
  bandScale,
  continuousScale,
  type ContinuousScaleType,
  createScale,
  isDiscreteScale,
  linearScale,
  linearTicks,
  logScale,
  niceLinearDomain,
  pointScale,
  powScale,
  sqrtScale,
  timeScale,
} from "./chart-scale.ts";
export { UIChartScatter } from "./chart-scatter.ts";
export { SERIES_ATTRIBUTES, UIChartSeries } from "./chart-series.ts";
export {
  type ArcParams,
  type CurveType,
  type PieOptions,
  type PieSlice,
  type Point,
  arcPath,
  areaPath,
  linePath,
  pieAngles,
  round,
} from "./chart-shape.ts";
export { UIChartTooltip } from "./chart-tooltip.ts";
export { UIChart, type UIChartHighlightDetail, type UIChartSelectDetail } from "./chart.ts";
export { UICheckbox, UICheckboxGroup } from "./checkbox.ts";
export { type ChipRemoveDetail, UIChip } from "./chip.ts";
export { syncDisclosure, UICollapsible } from "./collapsible.ts";
export {
  type ColorChangeDetail,
  UIColorField,
  UIColorPicker,
  UIColorPickerPopup,
} from "./color-picker.ts";
export { UIContextMenu } from "./context-menu.ts";
export { define } from "./define.ts";
export { isRTL } from "./direction.ts";
export { UIDialog, UIDialogBackdrop, UIDialogPopup } from "./dialog.ts";
export { onOutsidePress } from "./dismiss.ts";
export { UIDrawer, UIDrawerBackdrop, UIDrawerPopup } from "./drawer.ts";
export { type DropZoneChangeDetail, UIDropZone } from "./drop-zone.ts";
export { UIField } from "./field.ts";
export { UIFieldset } from "./fieldset.ts";
export { type FocusTrapOptions, getFocusable, trapFocus } from "./focus-trap.ts";
export {
  type FormControl,
  formControl,
  FORM_CONTROL_TAGS,
  type FormControlOptions,
  NativeCheckboxElement,
} from "./form-control.ts";
export { UIForm } from "./form.ts";
export { UIGauge } from "./gauge.ts";
export { labelFrom, nextId } from "./id.ts";
export {
  closeGroup,
  type HoverIntent,
  hoverIntent,
  type HoverIntentOptions,
  isGroupWarm,
  openGroup,
} from "./intent.ts";
export { connectLightDom, connectOwned } from "./lifecycle.ts";
export { type ListNav, listNav, type ListNavOptions } from "./list-nav.ts";
export { clamp, type ClampSnapBounds, clampSnap } from "./math.ts";
export { UIMeter } from "./meter.ts";
export {
  type MenuSelectDetail,
  UIMenu,
  UIMenuCheckboxItem,
  UIMenuGroup,
  UIMenuGroupLabel,
  UIMenuItem,
  UIMenuPopup,
  UIMenuRadioGroup,
  UIMenuRadioItem,
} from "./menu.ts";
export { UIMenubar } from "./menubar.ts";
export { UINavContent, UINavItem, UINavList, UINavigationMenu } from "./navigation-menu.ts";
export { adoptedControl, fireNativeChange, retireNative } from "./native.ts";
export { UINumberField } from "./number-field.ts";
export { UIOtpField } from "./otp-field.ts";
export { type Overlay, overlay, type OverlayOptions } from "./overlay.ts";
export { ensureButton, type EnsureButtonOptions } from "./parts.ts";
export { type PointerDragHandlers, trackPointerDrag } from "./pointer-drag.ts";
export { type PopoverField, popoverField, type PopoverFieldConfig } from "./popover-field.ts";
export { UIPopover, UIPopoverPopup } from "./popover.ts";
export { UIPreviewCard, UIPreviewCardContent } from "./preview-card.ts";
export { UIProgress } from "./progress.ts";
export { scopedQuery } from "./query.ts";
export { UIRadio, UIRadioGroup } from "./radio.ts";
export { rangeNumber, syncRangeState } from "./range.ts";
export {
  type NavKeyOptions,
  type Orientation,
  resolveNavKey,
  roving,
  type Roving,
  type RovingOptions,
} from "./roving.ts";
export { UIScrollArea, UIScrollScrollbar, UIScrollThumb, UIScrollViewport } from "./scroll-area.ts";
export { lockScroll } from "./scroll-lock.ts";
export { type SearchDetail, UISearchField } from "./search-field.ts";
export {
  type SelectChangeDetail,
  UISelect,
  UISelectGroup,
  UISelectGroupLabel,
  UISelectOption,
  UISelectPopup,
} from "./select.ts";
export { UISeparator } from "./separator.ts";
export { UISlider, UISliderThumb, UISliderTrack } from "./slider.ts";
export { UISwitch } from "./switch.ts";
export {
  UITable,
  type UITableHeaderFormat,
  type UITableListSlot,
  type UITablePageDetail,
  type UITableSelectionDetail,
  type UITableSortDetail,
  type UITableSortDirection,
  type UITableVariant,
} from "./table.ts";
export { UITabList, UITabs } from "./tabs.ts";
export { normalize } from "./text.ts";
export { type ToastOptions, toast, UIToast, UIToastViewport } from "./toast.ts";
export { UIToggle, UIToggleGroup } from "./toggle.ts";
export { runExit, setOpenState } from "./transitions.ts";
export { UIToolbar } from "./toolbar.ts";
export { UITooltip, UITooltipContent } from "./tooltip.ts";
