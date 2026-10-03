import { z } from 'zod'

/**
 * Turkish mobile numbers as people actually type them: "0 555 555 55 55",
 * "(0555) 555-55-55", "+90 555 555 5555", "5555555555". Separators are dropped
 * and the country/trunk prefix folded so everything is stored as 05XXXXXXXXX.
 * Returns null when the input isn't a Turkish mobile number.
 */
export function normalizeTrMobile(input: string): string | null {
  let digits = String(input ?? '').replace(/[\s().\-/]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  if (!/^\d+$/.test(digits)) return null
  if (digits.startsWith('0090')) digits = digits.slice(4)
  else if (digits.startsWith('90') && digits.length === 12) digits = digits.slice(2)
  else if (digits.startsWith('0')) digits = digits.slice(1)
  return /^5\d{9}$/.test(digits) ? `0${digits}` : null
}

/** "05555555555" → "0555 555 55 55" for display. */
export function formatTrMobile(phone: string): string {
  const n = normalizeTrMobile(phone)
  if (!n) return phone
  return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7, 9)} ${n.slice(9)}`
}

/** Zod field: accepts any common spacing and outputs the normalized 05XXXXXXXXX. */
export const trMobilePhone = (message = 'Geçerli bir cep telefonu numarası giriniz (0555 555 55 55).') =>
  z.string().transform((value, ctx) => {
    const normalized = normalizeTrMobile(value)
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message })
      return z.NEVER
    }
    return normalized
  })
