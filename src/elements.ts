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
 * Each component module self-registers when it is evaluated. The explicit
 * registry below also gives bundlers an observable use of every constructor,
 * so the register-all entry cannot lose component modules during tree-shaking.
 */
import * as ui from "./index.ts";

const definitions = [
  ["ui-accordion", ui.UIAccordion],
  ["ui-accordion-item", ui.UIAccordionItem],
  ["ui-arrow", ui.UIArrow],
  ["ui-autocomplete", ui.UIAutocomplete],
  ["ui-autocomplete-empty", ui.UIAutocompleteEmpty],
  ["ui-autocomplete-list", ui.UIAutocompleteList],
  ["ui-autocomplete-popup", ui.UIAutocompletePopup],
  ["ui-avatar", ui.UIAvatar],
  ["ui-banner", ui.UIBanner],
  ["ui-calendar", ui.UICalendar],
  ["ui-calendar-popup", ui.UICalendarPopup],
  ["ui-checkbox", ui.UICheckbox],
  ["ui-checkbox-group", ui.UICheckboxGroup],
  ["ui-chip", ui.UIChip],
  ["ui-collapsible", ui.UICollapsible],
  ["ui-color-field", ui.UIColorField],
  ["ui-color-picker", ui.UIColorPicker],
  ["ui-color-picker-popup", ui.UIColorPickerPopup],
  ["ui-combobox", ui.UICombobox],
  ["ui-combobox-chip", ui.UIComboboxChip],
  ["ui-combobox-chips", ui.UIComboboxChips],
  ["ui-combobox-empty", ui.UIComboboxEmpty],
  ["ui-combobox-popup", ui.UIComboboxPopup],
  ["ui-combobox-spacer", ui.UIComboboxSpacer],
  ["ui-combobox-viewport", ui.UIComboboxViewport],
  ["ui-context-menu", ui.UIContextMenu],
  ["ui-date-field", ui.UIDateField],
  ["ui-dialog", ui.UIDialog],
  ["ui-dialog-backdrop", ui.UIDialogBackdrop],
  ["ui-dialog-popup", ui.UIDialogPopup],
  ["ui-drawer", ui.UIDrawer],
  ["ui-drawer-backdrop", ui.UIDrawerBackdrop],
  ["ui-drawer-popup", ui.UIDrawerPopup],
  ["ui-drop-zone", ui.UIDropZone],
  ["ui-field", ui.UIField],
  ["ui-fieldset", ui.UIFieldset],
  ["ui-form", ui.UIForm],
  ["ui-menu", ui.UIMenu],
  ["ui-menu-checkbox-item", ui.UIMenuCheckboxItem],
  ["ui-menu-group", ui.UIMenuGroup],
  ["ui-menu-group-label", ui.UIMenuGroupLabel],
  ["ui-menu-item", ui.UIMenuItem],
  ["ui-menu-popup", ui.UIMenuPopup],
  ["ui-menu-radio-group", ui.UIMenuRadioGroup],
  ["ui-menu-radio-item", ui.UIMenuRadioItem],
  ["ui-menubar", ui.UIMenubar],
  ["ui-meter", ui.UIMeter],
  ["ui-nav-content", ui.UINavContent],
  ["ui-nav-item", ui.UINavItem],
  ["ui-nav-list", ui.UINavList],
  ["ui-navigation-menu", ui.UINavigationMenu],
  ["ui-number-field", ui.UINumberField],
  ["ui-otp-field", ui.UIOtpField],
  ["ui-popover", ui.UIPopover],
  ["ui-popover-popup", ui.UIPopoverPopup],
  ["ui-preview-card", ui.UIPreviewCard],
  ["ui-preview-card-content", ui.UIPreviewCardContent],
  ["ui-progress", ui.UIProgress],
  ["ui-radio", ui.UIRadio],
  ["ui-radio-group", ui.UIRadioGroup],
  ["ui-scroll-area", ui.UIScrollArea],
  ["ui-scroll-scrollbar", ui.UIScrollScrollbar],
  ["ui-scroll-thumb", ui.UIScrollThumb],
  ["ui-scroll-viewport", ui.UIScrollViewport],
  ["ui-search-field", ui.UISearchField],
  ["ui-select", ui.UISelect],
  ["ui-select-group", ui.UISelectGroup],
  ["ui-select-group-label", ui.UISelectGroupLabel],
  ["ui-select-option", ui.UISelectOption],
  ["ui-select-popup", ui.UISelectPopup],
  ["ui-separator", ui.UISeparator],
  ["ui-slider", ui.UISlider],
  ["ui-slider-thumb", ui.UISliderThumb],
  ["ui-slider-track", ui.UISliderTrack],
  ["ui-switch", ui.UISwitch],
  ["ui-tab-list", ui.UITabList],
  ["ui-table", ui.UITable],
  ["ui-tabs", ui.UITabs],
  ["ui-toast", ui.UIToast],
  ["ui-toast-viewport", ui.UIToastViewport],
  ["ui-toggle", ui.UIToggle],
  ["ui-toggle-group", ui.UIToggleGroup],
  ["ui-toolbar", ui.UIToolbar],
  ["ui-tooltip", ui.UITooltip],
  ["ui-tooltip-content", ui.UITooltipContent],
] as const satisfies ReadonlyArray<readonly [string, CustomElementConstructor]>;

for (const [name, constructor] of definitions) {
  if (!customElements.get(name)) customElements.define(name, constructor);
}
