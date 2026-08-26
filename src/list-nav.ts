/**
 * List navigation — the one listbox keyboard + typeahead engine shared by every
 * list-shaped popup (Menu's roving-focus items, Select's
 * `aria-activedescendant` options, Combobox/Autocomplete's virtual rows).
 *
 * The engine is index-based and model-agnostic: the caller supplies the live
 * `count`, the current `activeIndex`, and an `onActive` that moves the active
 * item however its focus model demands (real focus, `aria-activedescendant`,
 * a recycled virtual row). Arrow/Home/End arithmetic routes through
 * {@link resolveNavKey} — one copy of the math library-wide — with wrap-vs-clamp
 * as an explicit `loop` policy. Typeahead (when a `label` accessor is given)
 * matches diacritic-/case-insensitively via {@link normalize}, restarts its
 * buffer after 500 ms, searches from the item *after* the active one (wrapping
 * to the top), and lets `Space` extend a pending search so multi-word labels
 * stay reachable — `Space` only commits when no search is in progress.
 */
import { resolveNavKey } from "./roving.ts";
import { normalize } from "./text.ts";

export interface ListNavOptions {
  /** Live count of navigable items. */
  count: () => number;
  /** Current active index (`-1` = none). */
  activeIndex: () => number;
  /** Move the active item — focus it, point `aria-activedescendant`, etc. */
  onActive: (index: number) => void;
  /** Wrap past the ends (menus, comboboxes) vs clamp (select). Default true. */
  loop?: boolean;
  /** Commit the active item (`Enter`, or bare `Space` when typeahead is on). */
  onCommit?: (index: number) => void;
  /** `Escape` pressed — close/cancel. The engine calls `preventDefault`. */
  onCancel?: (event: KeyboardEvent) => void;
  /** `Tab` pressed — close without trapping (default action proceeds). */
  onTab?: (event: KeyboardEvent) => void;
  /** Rows per `PageUp`/`PageDown` jump (clamped); omit to leave paging alone. */
  page?: () => number;
  /** Handle `Home`/`End` (default true; text inputs keep them for the caret). */
  homeEnd?: boolean;
  /** Typeahead label per index; omit to disable typeahead (text inputs). */
  label?: (index: number) => string;
}

export interface ListNav {
  /** Handle a listbox keydown. Returns whether the key was consumed. */
  handle(event: KeyboardEvent): boolean;
}

/** Create a listbox keyboard + typeahead engine over an indexed item model. */
export function listNav(options: ListNavOptions) {
  const loop = options.loop ?? true;
  const homeEnd = options.homeEnd ?? true;
  let typeahead = "";
  let typeaheadTimer = 0;

  const typeaheadTo = (char: string) => {
    const label = options.label;
    if (!label) return;
    clearTimeout(typeaheadTimer);
    typeahead += char;
    typeaheadTimer = window.setTimeout(() => (typeahead = ""), 500);
    const q = normalize(typeahead);
    if (!q) return;
    const count = options.count();
    const start = options.activeIndex() + 1; // search from the item after the active one
    for (let n = 0; n < count; n++) {
      const i = (start + n) % count;
      if (normalize(label(i)).startsWith(q)) {
        options.onActive(i);
        return;
      }
    }
  };

  const commit = (event: KeyboardEvent) => {
    if (!options.onCommit) return false;
    const index = options.activeIndex();
    if (index < 0) return false;
    event.preventDefault();
    options.onCommit(index);
    return true;
  };

  return {
    handle(event: KeyboardEvent) {
      if (event.key === "Escape" && options.onCancel) {
        event.preventDefault();
        options.onCancel(event);
        return true;
      }
      if (event.key === "Tab" && options.onTab) {
        options.onTab(event); // no preventDefault — Tab proceeds
        return true;
      }
      if (event.key === "Enter") return commit(event);
      if (event.key === " " && options.label) {
        event.preventDefault();
        // Space extends a pending typeahead search (so multi-word labels are
        // reachable); it only commits when no search is in progress.
        if (typeahead) typeaheadTo(" ");
        else commit(event);
        return true;
      }
      const count = options.count();
      const current = options.activeIndex();
      if (options.page && (event.key === "PageDown" || event.key === "PageUp") && count > 0) {
        event.preventDefault();
        const delta = options.page() * (event.key === "PageDown" ? 1 : -1);
        options.onActive(Math.max(0, Math.min(current + delta, count - 1)));
        return true;
      }
      if (!homeEnd && (event.key === "Home" || event.key === "End")) return false;
      if (count > 0) {
        // With nothing active yet, the arrows enter the list at its ends.
        if (current < 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
          event.preventDefault();
          options.onActive(event.key === "ArrowDown" ? 0 : count - 1);
          return true;
        }
        const target = resolveNavKey(event.key, count, Math.max(0, current), {
          orientation: "vertical",
          loop,
        });
        if (target !== null) {
          event.preventDefault();
          options.onActive(target);
          return true;
        }
      }
      if (event.key.length === 1 && event.key !== " " && options.label) {
        typeaheadTo(event.key);
        return true;
      }
      return false;
    },
  };
}
