/**
 * Colour swatches for the "Renk" product option. Shared by the admin editor, the
 * server (validation) and the product page.
 */

export interface PresetColor {
  name: string
  hex: string
}

export const PRESET_COLORS: PresetColor[] = [
  { name: 'Siyah', hex: '#1c1c1c' },
  { name: 'Beyaz', hex: '#ffffff' },
  { name: 'Krem', hex: '#f2e8d5' },
  { name: 'Bej', hex: '#d6c3a5' },
  { name: 'Gri', hex: '#9e9e9e' },
  { name: 'Gümüş', hex: '#c7c9cc' },
  { name: 'Kahverengi', hex: '#6d4c41' },
  { name: 'Kırmızı', hex: '#d32f2f' },
  { name: 'Bordo', hex: '#7b1f2b' },
  { name: 'Turuncu', hex: '#f57c00' },
  { name: 'Sarı', hex: '#fbc02d' },
  { name: 'Altın', hex: '#c9a227' },
  { name: 'Yeşil', hex: '#388e3c' },
  { name: 'Mint', hex: '#98d8c1' },
  { name: 'Turkuaz', hex: '#26a69a' },
  { name: 'Mavi', hex: '#1e88e5' },
  { name: 'Lacivert', hex: '#1a237e' },
  { name: 'Mor', hex: '#7b1fa2' },
  { name: 'Lila', hex: '#c5a3d9' },
  { name: 'Pembe', hex: '#ec407a' },
]

const HEX = /^#[0-9a-f]{6}$/i

/** Keeps 1–4 valid #rrggbb colours */
export function cleanSwatch(colors: unknown): string[] {
  if (!Array.isArray(colors)) return []
  return colors
    .map((c) => String(c).trim().toLowerCase())
    .filter((c) => HEX.test(c))
    .slice(0, 4)
}

/** The preset colour for a value name, e.g. "kırmızı" → #d32f2f */
export function presetFor(name: string): string | null {
  const key = name.trim().toLocaleLowerCase('tr-TR')
  return PRESET_COLORS.find((p) => p.name.toLocaleLowerCase('tr-TR') === key)?.hex ?? null
}

/** CSS background for a swatch: a flat colour, or a soft gradient for mixed colours */
export function swatchBackground(colors: string[] | undefined | null): string {
  const list = colors && colors.length ? colors : ['#d9d9d9']
  if (list.length === 1) return list[0]
  return `linear-gradient(135deg, ${list.map((c, i) => `${c} ${Math.round((i / (list.length - 1)) * 100)}%`).join(', ')})`
}

/** Very light colours need a visible edge on white backgrounds */
export function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b > 225
}
