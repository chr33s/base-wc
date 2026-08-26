/**
 * Popover-field controller — the shared shape of `ui-date-field` and
 * `ui-color-field` (and any future field that opens an enhanced widget in an
 * anchored popover over an adopted native input). One copy owns: trigger
 * adoption-or-generation (via {@link ensureButton}, inserted after the input),
 * the `aria-haspopup` / `aria-expanded` / `aria-controls` wiring, the CSS
 * anchor pairing ({@link pairAnchor}) with the {@link overlay} JS fallback,
 * light-dismiss, and the open/close/focus dance. The component keeps what is
 * genuinely its own: building the widget, syncing it from the input, and
 * handling picks (write-back, `fireNativeChange`, whether a pick closes).
 */
import { pairAnchor } from "./anchor.ts";
import { nextId } from "./id.ts";
import { retireNative } from "./native.ts";
import { type Overlay, overlay } from "./overlay.ts";
import { ensureButton } from "./parts.ts";

export interface PopoverFieldConfig {
  /** The adopted native input — the submitting form value. */
  input: HTMLInputElement;
  /** Names the generated popup id and the CSS anchor pair (debuggability only). */
  prefix: string;
  /** Trigger button: adopted by `marker`, generated with `label`/`text` otherwise. */
  trigger: { marker: string; label: string; text?: string };
  /** The popup shell and the enhanced widget inside it; the popup is appended to `host`. */
  build: () => { popup: HTMLElement; widget: HTMLElement };
  /** Retire the input behind the trigger (fully-replaced controls, e.g. color). */
  retireInput?: boolean;
  /** Sync the widget from the input on each open, before the popup shows. */
  onOpen: () => void;
  /** The element that receives focus once the popup is shown. */
  initialFocus: () => HTMLElement | null;
}

export interface PopoverField {
  readonly trigger: HTMLElement;
  readonly popup: HTMLElement;
  readonly widget: HTMLElement;
  readonly open: boolean;
  /** Close the popup, optionally restoring focus to the trigger. */
  close(restoreFocus: boolean): void;
}

/** Wire a native-first field's trigger + anchored popover. Call from `#wire`. */
export function popoverField(host: HTMLElement, config: PopoverFieldConfig) {
  const { input } = config;
  const trigger = ensureButton(host, {
    marker: config.trigger.marker,
    label: config.trigger.label,
    text: config.trigger.text,
    insert: (btn) => input.after(btn),
  });

  const { popup, widget } = config.build();
  host.append(popup);
  if (config.retireInput) retireNative(input);

  if (!popup.id) popup.id = nextId(`ui-${config.prefix}-popup`);
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", popup.id);

  pairAnchor(trigger, popup, config.prefix);
  let isOpen = false;
  const ov: Overlay = overlay(popup, {
    anchor: { ref: () => trigger, options: { offset: 6, padding: 8 } },
    dismiss: {
      within: () => [popup, trigger],
      onDismiss: () => close(false),
    },
  });

  const open = () => {
    if (isOpen) return;
    isOpen = true;
    config.onOpen();
    trigger.setAttribute("aria-expanded", "true");
    ov.show();
    config.initialFocus()?.focus();
  };

  const close = (restoreFocus: boolean) => {
    if (!isOpen) return;
    isOpen = false;
    trigger.setAttribute("aria-expanded", "false");
    ov.hide();
    if (restoreFocus) trigger.focus();
  };

  trigger.addEventListener("click", () => (isOpen ? close(true) : open()));

  return {
    trigger,
    popup,
    widget,
    get open() {
      return isOpen;
    },
    close,
  };
}
