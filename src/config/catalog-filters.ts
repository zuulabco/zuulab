/**
 * ZUULAB Catalog Color Definitions
 * Used for color swatch filters in the product catalog.
 */

export interface ColorDef {
  slug: string
  label: string
  hex: string
  /** Hex for the visible border — useful for near-white swatches */
  border?: string
}

export const CATALOG_COLORS: ColorDef[] = [
  { slug: 'siyah',    label: 'Siyah',    hex: '#111111' },
  { slug: 'antrasit', label: 'Antrasit', hex: '#3a3d42' },
  { slug: 'gri',      label: 'Gri',      hex: '#8a8a8a' },
  { slug: 'beyaz',    label: 'Beyaz',    hex: '#f5f4f0', border: '#d0cfc8' },
  { slug: 'krem',     label: 'Krem',     hex: '#e8e0d0', border: '#c8beaa' },
  { slug: 'seffaf',   label: 'Şeffaf',   hex: '#d4eaf7', border: '#a9cde2' },
  { slug: 'amber',    label: 'Amber',    hex: '#f59e0b' },
  { slug: 'sari',     label: 'Sarı',     hex: '#fec80f' },
  { slug: 'turuncu',  label: 'Turuncu',  hex: '#f97316' },
  { slug: 'kirmizi',  label: 'Kırmızı',  hex: '#ef4444' },
  { slug: 'pembe',    label: 'Pembe',    hex: '#ec4899' },
  { slug: 'mor',      label: 'Mor',      hex: '#8b5cf6' },
  { slug: 'mavi',     label: 'Mavi',     hex: '#0080c4' },
  { slug: 'yesil',    label: 'Yeşil',    hex: '#22c55e' },
]

/** Lookup by slug */
export function getColorDef(slug: string): ColorDef | undefined {
  return CATALOG_COLORS.find((c) => c.slug === slug)
}

/** All unique material slugs & display labels used across the catalog */
export const CATALOG_MATERIALS: Array<{ slug: string; label: string }> = [
  { slug: 'pla',   label: 'PLA' },
  { slug: 'pla+',  label: 'PLA+' },
  { slug: 'petg',  label: 'PETG' },
  { slug: 'biyopla', label: 'Biyo-PLA' },
]

/** Extracts simplified material slug from a raw material string */
export function extractMaterialSlug(material: string): string | null {
  const m = material.toLowerCase()
  if (m.includes('petg')) return 'petg'
  if (m.includes('bio') || m.includes('biyo') || m.includes('biyopla')) return 'biyopla'
  if (m.includes('pla+')) return 'pla+'
  if (m.includes('pla')) return 'pla'
  return null
}
