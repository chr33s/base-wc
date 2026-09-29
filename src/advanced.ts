/** Supported low-level API for authors composing or extending components. */
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
export { ChartChildElement } from "./chart-child.ts";
export {
  type AxisPosition,
  type AxisRegistration,
  type ChartDimension,
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
export { ChartPlot, type GridSpec } from "./chart-plot.ts";
export {
  type CategoryValue,
  categoryKey,
  type ContinuousScale,
  type ScaleOptions,
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
export { SERIES_ATTRIBUTES, UIChartSeries } from "./chart-series.ts";
export {
  type ArcParams,
  type CurveType,
  type GapPolicy,
  type PieOptions,
  type PieSlice,
  type Point,
  arcPath,
  areaPath,
  linePath,
  pieAngles,
  round,
} from "./chart-shape.ts";
export { syncDisclosure } from "./collapsible.ts";
export { define } from "./define.ts";
export { isRTL } from "./direction.ts";
export { onOutsidePress } from "./dismiss.ts";
export { type FocusTrapOptions, getFocusable, trapFocus } from "./focus-trap.ts";
export {
  type FormControl,
  formControl,
  FORM_CONTROL_TAGS,
  FormAssociatedElement,
  type FormControlOptions,
  NativeCheckboxElement,
} from "./form-control.ts";
export { labelFrom, nextId } from "./id.ts";
export {
  closeGroup,
  type HoverIntent,
  hoverIntent,
  type HoverIntentOptions,
  isGroupWarm,
  onPointerMoved,
  openGroup,
} from "./intent.ts";
export { connectLightDom, connectOwned, LightDomElement } from "./lifecycle.ts";
export { type ListNav, listNav, type ListNavOptions } from "./list-nav.ts";
export { clamp, type ClampSnapBounds, clampSnap, numberAttribute, toNumber } from "./math.ts";
export { adoptedControl, fireNativeChange, managedDisabled, retireNative } from "./native.ts";
export { type Overlay, overlay, type OverlayOptions } from "./overlay.ts";
export { ensureButton, type EnsureButtonOptions } from "./parts.ts";
export {
  type DragAxis,
  type DragDirection,
  type PointerDragOptions,
  trackPointerDrag,
} from "./pointer-drag.ts";
export { type PopoverField, popoverField, type PopoverFieldConfig } from "./popover-field.ts";
export { UIModalPopupElement, UIPopupElement } from "./popup.ts";
export { HoverCardElement } from "./hover-card.ts";
export { isOwnedBy, scopedFirst, scopedQuery } from "./query.ts";
export { syncRangeState } from "./range.ts";
export { type ChangeReason, type OpenChangeDetail } from "./reasons.ts";
export {
  type NavKeyOptions,
  isDisabled,
  type Orientation,
  resolveNavKey,
  roving,
  type Roving,
  RovingElement,
  type RovingOptions,
} from "./roving.ts";
export { lockScroll } from "./scroll-lock.ts";
export { localeOf, normalize } from "./text.ts";
export { runExit, setOpenState } from "./transitions.ts";
