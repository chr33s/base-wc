/**
 * Diacritic- and case-insensitive normalizer used for combobox/autocomplete
 * filtering, so a query of `jose` matches `José`. NFD-decomposes, strips
 * combining marks, trims surrounding whitespace, and lowercases.
 */
export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}
