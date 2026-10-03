import { z } from 'zod'
import { matchProvince } from '@/lib/geo/tr-provinces'

/** Zod field for a Turkish province: accepts any casing/accents, outputs the official name. */
export const trProvince = (message = 'Geçerli bir il adı yazın.') =>
  z.string().transform((value, ctx) => {
    const province = matchProvince(value)
    if (!province) {
      ctx.addIssue({ code: 'custom', message: value.trim() ? message : 'İl alanı zorunludur.' })
      return z.NEVER
    }
    return province as string
  })
