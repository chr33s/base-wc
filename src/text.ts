/**
 * Case- and diacritic-insensitive normalizer used for combobox/autocomplete
 * filtering and listbox typeahead, so a query of `jose` matches `José`.
 *
 * Case folding is **locale-aware**. `String.prototype.toLowerCase` applies the
 * Unicode default casing rules, which are wrong in Turkish and Azeri: there,
 * `I` lowercases to the dotless `ı` and `İ` to `i`, so a default-cased `i`
 * query matches `Isparta` and misses `İzmir` — exactly backwards. Callers pass
 * the locale (components read a `lang`/`locale` attribute, falling back to the
 * document's), and it reaches `toLocaleLowerCase`.
 *
 * Diacritic stripping is the other half, and it is deliberately *not* locale
 * aware: NFD-decomposing and dropping combining marks is what lets `jose`
 * match `José`. In languages where an accented character is a distinct letter
 * rather than a variant (Swedish `å`/`ä`/`ö`), this makes the filter more
 * permissive, never less — the exact match still ranks as a match.
 */

/**
 * Resolve the locale to fold with. An explicit `locale`/`lang` on the element
 * or any ancestor wins; otherwise the document language, and finally the
 * runtime default (`undefined`, which `toLocaleLowerCase` reads as the host's).
 */
export function localeOf(element: Element | null | undefined): string | undefined {
  const tagged =
    element?.closest?.("[lang]")?.getAttribute("lang") ||
    (typeof document === "undefined" ? undefined : document.documentElement.getAttribute("lang"));
  if (!tagged) return undefined;
  // A malformed tag (`en_US`, `english`) would make `toLocaleLowerCase` throw
  // on every keystroke; fall back to the runtime default instead.
  try {
    return Intl.getCanonicalLocales(tagged)[0];
  } catch {
    return undefined;
  }
}

/** Fold `value` for comparison: locale-lowercased, diacritics dropped, trimmed. */
export function normalize(value: string, locale?: string) {
  const lowered = locale ? value.toLocaleLowerCase(locale) : value.toLowerCase();
  return lowered
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}
