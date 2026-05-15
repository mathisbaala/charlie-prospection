/**
 * Convert an arbitrary string to a URL-safe slug. Strips diacritics, lowercases,
 * replaces non-alphanumeric runs with `-`, and trims leading/trailing dashes.
 *
 * Examples:
 *   slugify('Cabinet Dupont Patrimoine')  → 'cabinet-dupont-patrimoine'
 *   slugify('Société Générale')           → 'societe-generale'
 *   slugify('CGP & Associés')             → 'cgp-associes'
 *
 * Used for org slugs at signup/create-org and for doctolib URL slugs. Was
 * previously duplicated across three callers with two different regexes for
 * diacritic stripping — consolidated here on `\p{Mn}` (Mark, Nonspacing
 * Unicode property class) which is more robust than a raw combining-character
 * range and matches the convention in `lib/prospect-search/naf-mapper.ts`.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
