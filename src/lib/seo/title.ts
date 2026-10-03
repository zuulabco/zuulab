import type { Metadata } from 'next'

/** Brand suffix used everywhere: "Ürünler · zuulab". The root layout's template adds it. */
export const BRAND = 'zuulab'
export const TITLE_SEPARATOR = ' · '

/** "a — b" / "a | b" / "a - b" → "a · b" (also for titles typed in the admin). */
function tidy(raw: string): string {
  return raw.replace(/\s+[—–|-]\s+/g, TITLE_SEPARATOR).replace(/\s+/g, ' ').trim()
}

/**
 * Page title for metadata. The layout template appends " · zuulab"; a title that
 * already names the brand (e.g. an SEO title set in the admin) is used as is, so
 * the brand never shows twice.
 */
export function pageTitle(raw: string): NonNullable<Metadata['title']> {
  const t = tidy(raw)
  return new RegExp(`\\b${BRAND}\\b`, 'i').test(t) ? { absolute: t } : t
}

/** Full title for Open Graph / social cards, which the template does not touch. */
export function socialTitle(raw: string): string {
  const t = tidy(raw)
  return new RegExp(`\\b${BRAND}\\b`, 'i').test(t) ? t : `${t}${TITLE_SEPARATOR}${BRAND}`
}
