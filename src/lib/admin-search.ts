/**
 * Text matching for the admin quick search, shared by the browser (page names)
 * and the search API (records).
 *
 * Matching ignores case and Turkish letters ("iade" finds "İadeler", "siparis"
 * finds "Sipariş") and every word typed must appear somewhere, in any order
 * ("kırmızı vazo" finds "Aura Vazo — Kırmızı").
 */

const FOLD_FROM = 'ÇĞİIÖŞÜçğıöşüÂÎÛâîû'
const FOLD_TO = 'cgiiosucgiosuaiuaiu'
const FOLD_MAP = new Map([...FOLD_FROM].map((ch, i) => [ch, FOLD_TO[i]]))

/** Lower-case ASCII-ish form of `text`: Turkish letters folded, accents dropped, spaces collapsed. */
export function foldText(text: string | null | undefined): string {
  if (!text) return ''
  let out = ''
  for (const ch of text) out += FOLD_MAP.get(ch) ?? ch
  return out
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** The words of a query, folded; empty words dropped. */
export function searchTokens(query: string): string[] {
  return foldText(query).split(' ').filter(Boolean)
}

/**
 * How well `fields` match `tokens`: 0 when some word is missing, otherwise higher
 * for words that start a field or equal it (an exact SKU or order number wins).
 */
export function matchScore(tokens: string[], fields: Array<string | null | undefined>): number {
  if (tokens.length === 0) return 0
  const folded = fields.map(foldText).filter(Boolean)
  // Digits only, so "5334251495" finds "0533 425 14 95"
  const digits = fields.map((f) => (f ?? '').replace(/\D/g, '')).filter((d) => d.length >= 4)
  let score = 0
  for (const token of tokens) {
    let best = 0
    for (const field of folded) {
      if (field === token) best = Math.max(best, 10)
      else if (field.startsWith(token)) best = Math.max(best, 4)
      else if (field.includes(` ${token}`) || field.includes(`-${token}`)) best = Math.max(best, 3)
      else if (field.includes(token)) best = Math.max(best, 1)
    }
    if (!best && /^\d{4,}$/.test(token) && digits.some((d) => d.includes(token))) best = 2
    if (!best) return 0
    score += best
  }
  return score
}

/** `items` that match every word, best first, at most `limit`. */
export function rankMatches<T>(
  items: T[],
  tokens: string[],
  fields: (item: T) => Array<string | null | undefined>,
  limit: number
): T[] {
  return items
    .map((item, index) => ({ item, index, score: matchScore(tokens, fields(item)) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((r) => r.item)
}
