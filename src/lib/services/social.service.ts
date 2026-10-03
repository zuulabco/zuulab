import 'server-only'
import { randomUUID } from 'node:crypto'
import { db } from '@/prisma/db'
import { logAuditEvent } from './admin.service'
import { DEFAULT_SOCIAL_LINKS, SOCIAL_PLATFORMS, type SocialLink, type SocialPlatform } from '@/lib/social/platforms'

/**
 * Footer social links (Vitrin → Sosyal medya), stored as one JSON setting.
 * Until something is saved the footer keeps its original three icons.
 */
const KEY = 'site.social_links'

export class SocialValidationError extends Error {
  readonly isValidation = true
}

export async function getSocialLinks(): Promise<SocialLink[]> {
  try {
    const row = await db.orm.public.Setting.select('value').where({ key: KEY }).first()
    if (!row?.value) return DEFAULT_SOCIAL_LINKS
    const parsed = JSON.parse(row.value)
    return Array.isArray(parsed) ? parsed.filter((l) => l && l.platform in SOCIAL_PLATFORMS && typeof l.url === 'string') : DEFAULT_SOCIAL_LINKS
  } catch (err) {
    console.error('[social] could not read links:', err)
    return DEFAULT_SOCIAL_LINKS
  }
}

export async function getActiveSocialLinks(): Promise<SocialLink[]> {
  return (await getSocialLinks()).filter((l) => l.active)
}

export async function saveSocialLinks(input: unknown, adminEmail = 'system'): Promise<SocialLink[]> {
  if (!Array.isArray(input)) throw new SocialValidationError('Geçersiz liste.')
  if (input.length > 12) throw new SocialValidationError('En fazla 12 bağlantı eklenebilir.')
  const links: SocialLink[] = input.map((raw, i) => {
    const platform = String(raw?.platform ?? '') as SocialPlatform
    if (!(platform in SOCIAL_PLATFORMS)) throw new SocialValidationError(`${i + 1}. satırda platform seçilmemiş.`)
    const url = String(raw?.url ?? '').trim()
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new SocialValidationError(`${SOCIAL_PLATFORMS[platform].name} bağlantısı geçerli bir adres değil.`)
    }
    if (parsed.protocol !== 'https:') {
      throw new SocialValidationError(`${SOCIAL_PLATFORMS[platform].name} bağlantısı https:// ile başlamalıdır.`)
    }
    return { id: String(raw?.id || `soc-${randomUUID().slice(0, 8)}`), platform, url: parsed.toString(), active: raw?.active !== false }
  })

  await db.runtime().execute(
    db.raw.sql`
      INSERT INTO settings (id, key, value, type, "group", label, updated_at)
      VALUES (${randomUUID()}, ${KEY}, ${JSON.stringify(links)}, 'json', 'site', 'Sosyal medya bağlantıları', now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `.affectedCount().build()
  )
  await logAuditEvent({ action: 'SOCIAL_LINKS_UPDATED', entity: 'Settings', entityId: KEY, metadata: { count: links.length, adminEmail } })
  return links
}
