import data from './tr-address-data.json'
import { matchProvince, provinceKey } from './tr-provinces'

/**
 * Districts and postal codes of Türkiye, for the address forms: after a province is chosen only its districts are
 * offered (and required), and a postal code is suggested for the chosen district. Data and how it is built:
 * scripts/generate-tr-address-data.mjs (PTT data via the MIT-licensed `turkey-neighbourhoods` package).
 *
 * A postal code belongs to a neighbourhood, so a district can have several. They are listed most common first; the
 * first one is only a suggestion, the customer can pick another or type their own 5 digits.
 */

const DATA = data as Record<string, Record<string, string[]>>

/** The official province name for what was typed (the key of the data), or null */
function provinceOf(city: string | null | undefined): string | null {
  return matchProvince(city ?? '')
}

/** Districts of a province in Turkish alphabetical order; empty when the province is not recognised */
export function districtsOf(city: string | null | undefined): string[] {
  const province = provinceOf(city)
  return province && DATA[province] ? Object.keys(DATA[province]) : []
}

/** Official district name for what was typed (any casing or accents), or null when it is not a district of that province */
export function matchDistrict(city: string | null | undefined, value: string | null | undefined): string | null {
  if (!value) return null
  const key = provinceKey(value)
  if (!key) return null
  return districtsOf(city).find((d) => provinceKey(d) === key) ?? null
}

/**
 * Suggestions for the district field: an empty field lists every district of the province (A–Z); typing lists the
 * names that start with the text, then those that contain it.
 */
export function suggestDistricts(city: string | null | undefined, value: string): string[] {
  const all = districtsOf(city)
  const key = provinceKey(value)
  if (!key) return all
  const starts: string[] = []
  const contains: string[] = []
  for (const d of all) {
    const k = provinceKey(d)
    if (k.startsWith(key)) starts.push(d)
    else if (k.includes(key)) contains.push(d)
  }
  return [...starts, ...contains]
}

/** Postal codes in use in a district, most common first (empty when province or district is not recognised) */
export function postalCodesFor(city: string | null | undefined, district: string | null | undefined): string[] {
  const province = provinceOf(city)
  const official = matchDistrict(city, district)
  return province && official ? [...(DATA[province]?.[official] ?? [])] : []
}

/** The postal code to offer first for a district, or null */
export function suggestedPostalCode(city: string | null | undefined, district: string | null | undefined): string | null {
  return postalCodesFor(city, district)[0] ?? null
}

export const POSTAL_CODE_RE = /^[0-9]{5}$/

export const DISTRICT_REQUIRED_MESSAGE = 'İlçe alanı zorunludur.'
export const DISTRICT_INVALID_MESSAGE = 'Seçtiğiniz ile ait bir ilçe seçin.'
export const DISTRICT_NEEDS_CITY_MESSAGE = 'Önce il seçin.'
export const POSTAL_CODE_MESSAGE = 'Posta kodu 5 haneli bir sayı olmalıdır.'

/** Error for the district field, or '' when it holds a real district of the chosen province */
export function districtError(city: string, value: string): string {
  if (!provinceOf(city)) return DISTRICT_NEEDS_CITY_MESSAGE
  if (!value.trim()) return DISTRICT_REQUIRED_MESSAGE
  return matchDistrict(city, value) ? '' : DISTRICT_INVALID_MESSAGE
}

/** Error for the postal code field, or '' when it is 5 digits */
export function postalCodeError(value: string): string {
  return POSTAL_CODE_RE.test(value.trim()) ? '' : POSTAL_CODE_MESSAGE
}
