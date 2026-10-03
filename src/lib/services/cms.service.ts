import 'server-only'
import { randomUUID } from 'node:crypto'
import { db } from '@/prisma/db'
import { logAuditEvent } from './admin.service'
import {
  defaultHomepage,
  normalizeHomepage,
  type AnnouncementItem,
  type HomepageDocument,
} from '@/lib/cms/homepage'

/**
 * Homepage content (hero slides, sections, announcement bar) and the media library.
 *
 * Stored in the `settings` table as JSON so it survives deploys and is the same on
 * every server instance:
 *   cms.homepage.draft      what the admin is editing
 *   cms.homepage.published  what the storefront shows
 *   cms.media               uploaded image references
 * Saving changes the draft; publishing copies the draft to the published copy.
 */

export type { AnnouncementItem, HomepageDocument } from '@/lib/cms/homepage'

export interface MediaAsset {
  id: string
  name: string
  url: string
  size: string
  type: string
  dimensions?: string
  createdAt: string
  references: number
}

export interface CmsState extends HomepageDocument {
  status: 'DRAFT' | 'PUBLISHED'
  lastSavedAt: string | null
  lastPublishedAt: string | null
  /** The draft differs from what is live */
  hasUnpublishedChanges: boolean
  media: MediaAsset[]
}

const KEY_DRAFT = 'cms.homepage.draft'
const KEY_PUBLISHED = 'cms.homepage.published'
const KEY_MEDIA = 'cms.media'

interface Stored<T> {
  savedAt: string
  doc: T
}

async function readKey<T>(key: string): Promise<Stored<T> | null> {
  try {
    const row = await db.orm.public.Setting.select('value').where({ key }).first()
    if (!row?.value) return null
    const parsed = JSON.parse(row.value)
    return parsed && typeof parsed === 'object' && 'doc' in parsed ? (parsed as Stored<T>) : null
  } catch (err) {
    console.error(`[cms] could not read ${key}:`, err)
    return null
  }
}

async function writeKey<T>(key: string, doc: T, label: string): Promise<Stored<T>> {
  const stored: Stored<T> = { savedAt: new Date().toISOString(), doc }
  const value = JSON.stringify(stored)
  await db.runtime().execute(
    db.raw.sql`
      INSERT INTO settings (id, key, value, type, "group", label, updated_at)
      VALUES (${randomUUID()}, ${key}, ${value}, 'json', 'cms', ${label}, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `.affectedCount().build()
  )
  return stored
}

/** The live homepage; defaults until something has been published */
export async function getPublishedHomepageContent(): Promise<HomepageDocument> {
  const published = await readKey<HomepageDocument>(KEY_PUBLISHED)
  return published ? normalizeHomepage(published.doc) : defaultHomepage()
}

export async function getPublishedAnnouncements(): Promise<AnnouncementItem[]> {
  return (await getPublishedHomepageContent()).announcements
    .filter((a) => a.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

async function readMedia(): Promise<MediaAsset[]> {
  return (await readKey<MediaAsset[]>(KEY_MEDIA))?.doc ?? []
}

export async function adminGetCms(mode: 'DRAFT' | 'PUBLISHED' = 'DRAFT'): Promise<CmsState> {
  const [draft, published, media] = await Promise.all([
    readKey<HomepageDocument>(KEY_DRAFT),
    readKey<HomepageDocument>(KEY_PUBLISHED),
    readMedia(),
  ])
  const publishedDoc = published ? normalizeHomepage(published.doc) : defaultHomepage()
  const draftDoc = draft ? normalizeHomepage(draft.doc) : publishedDoc
  const doc = mode === 'PUBLISHED' ? publishedDoc : draftDoc
  return {
    ...doc,
    status: mode,
    lastSavedAt: draft?.savedAt ?? null,
    lastPublishedAt: published?.savedAt ?? null,
    hasUnpublishedChanges: JSON.stringify(draftDoc) !== JSON.stringify(publishedDoc),
    media,
  }
}

/** Saves the editor's changes as the draft (the site does not change yet). */
export async function adminSaveDraftCms(payload: Partial<HomepageDocument>, adminEmail = 'system'): Promise<CmsState> {
  const current = await adminGetCms('DRAFT')
  const next = normalizeHomepage({
    hero: payload.hero ?? current.hero,
    sections: payload.sections ?? current.sections,
    announcements: payload.announcements ?? current.announcements,
  })
  await writeKey(KEY_DRAFT, next, 'Ana sayfa taslağı')
  await logAuditEvent({ action: 'CONTENT_SAVED_DRAFT', entity: 'CMS', entityId: 'homepage', metadata: { adminEmail } })
  return adminGetCms('DRAFT')
}

/** Puts the draft live. */
export async function adminPublishCms(adminEmail = 'system'): Promise<CmsState> {
  const draft = await adminGetCms('DRAFT')
  const doc = normalizeHomepage(draft)
  await writeKey(KEY_DRAFT, doc, 'Ana sayfa taslağı')
  await writeKey(KEY_PUBLISHED, doc, 'Yayındaki ana sayfa')
  await logAuditEvent({
    action: 'CONTENT_PUBLISHED',
    entity: 'CMS',
    entityId: 'homepage',
    metadata: { adminEmail, activeSections: doc.sections.filter((s) => s.enabled).length },
  })
  return adminGetCms('PUBLISHED')
}

/**
 * Announcement bar changes go live at once: the bar is updated in both the draft and
 * the published copy, without publishing other unfinished homepage edits.
 */
export async function adminSetAnnouncements(list: AnnouncementItem[], adminEmail = 'system'): Promise<AnnouncementItem[]> {
  const [draft, published] = await Promise.all([adminGetCms('DRAFT'), adminGetCms('PUBLISHED')])
  const announcements = normalizeHomepage({ announcements: list }).announcements
  await writeKey(KEY_DRAFT, normalizeHomepage({ ...draft, announcements }), 'Ana sayfa taslağı')
  await writeKey(KEY_PUBLISHED, normalizeHomepage({ ...published, announcements }), 'Yayındaki ana sayfa')
  await logAuditEvent({
    action: 'ANNOUNCEMENTS_UPDATED',
    entity: 'CMS',
    entityId: 'announcements',
    metadata: { count: announcements.length, adminEmail },
  })
  return announcements
}

export async function adminAddMediaAsset(
  asset: Omit<MediaAsset, 'id' | 'createdAt' | 'references'>,
  adminEmail = 'system'
): Promise<MediaAsset> {
  const newAsset: MediaAsset = { id: `med-${Date.now()}`, ...asset, createdAt: new Date().toISOString(), references: 0 }
  await writeKey(KEY_MEDIA, [newAsset, ...(await readMedia())], 'Medya kütüphanesi')
  await logAuditEvent({
    action: 'MEDIA_UPLOADED',
    entity: 'Media',
    entityId: newAsset.id,
    metadata: { name: newAsset.name, url: newAsset.url, adminEmail },
  })
  return newAsset
}

/** Removes a library entry unless the published homepage still shows that image. */
export async function adminDeleteMediaAsset(id: string, adminEmail = 'system'): Promise<{ success: boolean; error?: string }> {
  const media = await readMedia()
  const asset = media.find((m) => m.id === id)
  if (!asset) return { success: false, error: 'Medya dosyası bulunamadı.' }

  const live = JSON.stringify(await getPublishedHomepageContent())
  if (live.includes(asset.url)) {
    return { success: false, error: 'Bu görsel yayındaki ana sayfada kullanılıyor. Önce oradan kaldırın.' }
  }

  await writeKey(KEY_MEDIA, media.filter((m) => m.id !== id), 'Medya kütüphanesi')
  await logAuditEvent({ action: 'MEDIA_DELETED', entity: 'Media', entityId: id, metadata: { name: asset.name, adminEmail } })
  return { success: true }
}
