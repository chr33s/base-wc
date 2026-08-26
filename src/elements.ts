/**
 * Register **every** custom element in a single import — the eager counterpart
 * to the tree-shakeable {@link index.ts} barrel:
 *
 * ```ts
 * import "@chr33s/base-wc/elements"; // defines every ui-* element
 * ```
 *
 * Use this from an app shell (or any place that renders `ui-*` tags without
 * importing their classes) so the whole library is defined up front. When you
 * only need a few components and want the smallest bundle, import their classes
 * or files directly instead (see `readme.md` → "Bundle size").
 *
 * Each component module already self-registers (under its own tag name) when
 * it is evaluated, so this entry holds no tag-name registry of its own. The
 * constructor roster below exists purely for bundlers: it is an observable use
 * of every component class, so tree-shaking cannot drop the modules — and with
 * them their registrations — from the register-all bundle. The roster must be
 * consumed by a call no bundler can prove pure (see the bottom of this file),
 * or both it and the component modules are shaken out again.
 */
import * as ui from "./index.ts";

const constructors: readonly CustomElementConstructor[] = [
  ui.UIAccordion,
  ui.UIAccordionItem,
  ui.UIArrow,
  ui.UIAutocomplete,
  ui.UIAutocompleteEmpty,
  ui.UIAutocompleteList,
  ui.UIAutocompletePopup,
  ui.UIAvatar,
  ui.UIBanner,
  ui.UICalendar,
  ui.UICalendarPopup,
  ui.UIChart,
  ui.UIChartAxis,
  ui.UIChartBar,
  ui.UIChartGrid,
  ui.UIChartLegend,
  ui.UIChartLine,
  ui.UIChartPie,
  ui.UIChartReferenceLine,
  ui.UIChartScatter,
  ui.UIChartTooltip,
  ui.UICheckbox,
  ui.UICheckboxGroup,
  ui.UIChip,
  ui.UICollapsible,
  ui.UIColorField,
  ui.UIColorPicker,
  ui.UIColorPickerPopup,
  ui.UICombobox,
  ui.UIComboboxChip,
  ui.UIComboboxChips,
  ui.UIComboboxEmpty,
  ui.UIComboboxPopup,
  ui.UIComboboxSpacer,
  ui.UIComboboxViewport,
  ui.UIContextMenu,
  ui.UIDateField,
  ui.UIDialog,
  ui.UIDialogBackdrop,
  ui.UIDialogPopup,
  ui.UIDrawer,
  ui.UIDrawerBackdrop,
  ui.UIDrawerPopup,
  ui.UIDropZone,
  ui.UIField,
  ui.UIFieldset,
  ui.UIForm,
  ui.UIGauge,
  ui.UIMenu,
  ui.UIMenuCheckboxItem,
  ui.UIMenuGroup,
  ui.UIMenuGroupLabel,
  ui.UIMenuItem,
  ui.UIMenuPopup,
  ui.UIMenuRadioGroup,
  ui.UIMenuRadioItem,
  ui.UIMenubar,
  ui.UIMeter,
  ui.UINavContent,
  ui.UINavItem,
  ui.UINavList,
  ui.UINavigationMenu,
  ui.UINumberField,
  ui.UIOtpField,
  ui.UIPopover,
  ui.UIPopoverPopup,
  ui.UIPreviewCard,
  ui.UIPreviewCardContent,
  ui.UIProgress,
  ui.UIRadio,
  ui.UIRadioGroup,
  ui.UIScrollArea,
  ui.UIScrollScrollbar,
  ui.UIScrollThumb,
  ui.UIScrollViewport,
  ui.UISearchField,
  ui.UISelect,
  ui.UISelectGroup,
  ui.UISelectGroupLabel,
  ui.UISelectOption,
  ui.UISelectPopup,
  ui.UISeparator,
  ui.UISlider,
  ui.UISliderThumb,
  ui.UISliderTrack,
  ui.UISwitch,
  ui.UITabList,
  ui.UITable,
  ui.UITabs,
  ui.UIToast,
  ui.UIToastViewport,
  ui.UIToggle,
  ui.UIToggleGroup,
  ui.UIToolbar,
  ui.UITooltip,
  ui.UITooltipContent,
];

// A bare `void constructors` is provably pure and gets dropped (taking every
// module above with it); a `queueMicrotask` call is not, so the roster — and
// with it each module's self-registration — survives packing and re-bundling.
queueMicrotask(() => void constructors.length);
