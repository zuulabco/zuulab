/**
 * Pure text helpers for marketplace listings (no database access), shared by the
 * listings service and unit-tested on their own.
 */

const TR_MAP: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i̇: 'i', ö: 'o', ş: 's', ü: 'u' }
const STOP_WORDS = new Set(['ve', 'ile', 'icin', 'seti', 'set', 'adet', 'li', 'lu', 'the'])

export function nameTokens(text: string): Set<string> {
  const normalized = text
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]|i̇/g, (c) => TR_MAP[c] ?? c)
    .replace(/[^a-z0-9]+/g, ' ')
  return new Set(normalized.split(' ').filter((t) => t.length >= 3 && !STOP_WORDS.has(t)))
}

/** Dice coefficient over word sets, 0..1. */
export function nameSimilarity(a: string, b: string): number {
  const ta = nameTokens(a)
  const tb = nameTokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  return (2 * shared) / (ta.size + tb.size)
}

/** Trendyol descriptions are HTML; the storefront shows plain text. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, i, all) => line || (i > 0 && all[i - 1]))
    .join('\n')
    .trim()
}

const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/lamba|aydınlatma|aydinlatma|aplik|abajur|gece ışığı/i, 'aydinlatmalar'],
  [/anahtarlık|anahtarlik|plaka/i, 'anahtarliklar'],
  [/organizer|organizatör|düzenleyici|takı/i, 'masaustu-organizer'],
  [/yapboz|puzzle|oyun|eşleştirme|küp|zeka|eğitici|montessori/i, 'oyun-eglence'],
  [/figür|figur|heykel|biblo/i, 'figurler'],
  [/saksı|saksi|vazo/i, 'saksi-dekorasyon'],
  [/ayraç|ayrac/i, 'kitap-ayraci'],
  [/havlu|askı|aski|banyo|mutfak/i, 'ev-yasam'],
]

export function guessCategorySlug(title: string, categoryName: string | null): string {
  const text = `${categoryName ?? ''} ${title}`
  return CATEGORY_RULES.find(([re]) => re.test(text))?.[1] ?? 'ozel-tasarim'
}

export function guessCollectionSlug(title: string): string | null {
  const m = /^(zuulight|zuulife|zuukids)\b/i.exec(title.trim())
  return m ? m[1].toLowerCase() : null
}
