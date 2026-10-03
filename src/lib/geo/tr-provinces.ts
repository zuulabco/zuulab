/** The 81 provinces of Türkiye, in Turkish alphabetical order. */
export const TR_PROVINCES = [
  'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya', 'Ankara', 'Antalya', 'Ardahan', 'Artvin',
  'Aydın', 'Balıkesir', 'Bartın', 'Batman', 'Bayburt', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur',
  'Bursa', 'Çanakkale', 'Çankırı', 'Çorum', 'Denizli', 'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan',
  'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Iğdır', 'Isparta', 'İstanbul',
  'İzmir', 'Kahramanmaraş', 'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri', 'Kilis', 'Kırıkkale', 'Kırklareli',
  'Kırşehir', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Mardin', 'Mersin', 'Muğla', 'Muş',
  'Nevşehir', 'Niğde', 'Ordu', 'Osmaniye', 'Rize', 'Sakarya', 'Samsun', 'Şanlıurfa', 'Siirt', 'Sinop',
  'Sivas', 'Şırnak', 'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Uşak', 'Van', 'Yalova', 'Yozgat',
  'Zonguldak',
] as const

export type TrProvince = (typeof TR_PROVINCES)[number]

/**
 * Comparison key that ignores case and Turkish letters, so "istanbul", "İSTANBUL"
 * and "Istanbul" all meet. Uses Turkish lowercasing first (İ→i, I→ı) and then
 * folds the special letters to plain ASCII.
 */
export function provinceKey(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[ıİ]/g, 'i')
    .replace(/i̇/g, 'i')
    .replace(/[öÖ]/g, 'o')
    .replace(/[şŞ]/g, 's')
    .replace(/[üÜ]/g, 'u')
    .replace(/[âÂ]/g, 'a')
    .replace(/[îÎ]/g, 'i')
    .replace(/[ûÛ]/g, 'u')
    .replace(/[^a-z]/g, '')
}

// Everyday short names people type for a province
const ALIASES: Record<string, TrProvince> = {
  afyon: 'Afyonkarahisar',
  antep: 'Gaziantep',
  maras: 'Kahramanmaraş',
  kmaras: 'Kahramanmaraş',
  urfa: 'Şanlıurfa',
  icel: 'Mersin',
}

const BY_KEY = new Map<string, TrProvince>(TR_PROVINCES.map((p) => [provinceKey(p), p]))

/** Official province name for what was typed, or null when it is not a province. */
export function matchProvince(value: string | null | undefined): TrProvince | null {
  if (!value) return null
  const key = provinceKey(value)
  if (!key) return null
  return BY_KEY.get(key) ?? ALIASES[key] ?? null
}

// Most populous first: what most customers are looking for before they type anything
const POPULAR: TrProvince[] = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya']

/** All 81 for an empty field: the five largest first, then the rest A–Z. */
export const PROVINCES_POPULAR_FIRST: readonly TrProvince[] = [
  ...POPULAR,
  ...TR_PROVINCES.filter((p) => !POPULAR.includes(p)),
]

/**
 * Suggestions for the city field. Empty → all provinces, popular first. Typing →
 * names that start with the text, then names containing it (plus short names like
 * "urfa" → Şanlıurfa).
 */
export function suggestProvinces(value: string): TrProvince[] {
  const key = provinceKey(value)
  if (!key) return [...PROVINCES_POPULAR_FIRST]
  const starts: TrProvince[] = []
  const contains: TrProvince[] = []
  for (const p of TR_PROVINCES) {
    const k = provinceKey(p)
    if (k.startsWith(key)) starts.push(p)
    else if (k.includes(key)) contains.push(p)
  }
  const alias = ALIASES[key]
  const out = [...starts, ...contains]
  if (alias && !out.includes(alias)) out.unshift(alias)
  return out
}
