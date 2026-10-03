import 'server-only'
import { logAuditEvent } from './admin.service'

export interface HeroContent {
  brandWorld: string
  originTag: string
  headlineMain: string
  headlineItalic: string
  leadText: string
  heroImage: string
  mobileImage?: string
  imageCaptionCode: string
  imageCaptionText: string
  primaryCtaText: string
  primaryCtaHref: string
  secondaryCtaText: string
  secondaryCtaHref: string
  active: boolean
}

export interface AnnouncementItem {
  id: string
  text: string
  ctaLabel?: string
  ctaHref?: string
  active: boolean
  sortOrder: number
}

export interface HomepageSectionConfig {
  id: string
  type: string
  name: string
  enabled: boolean
  sortOrder: number
  customSettings?: Record<string, unknown>
}

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

export interface CmsStoreState {
  status: 'DRAFT' | 'PUBLISHED'
  lastPublishedAt: string | null
  lastSavedAt: string
  hero: HeroContent
  announcements: AnnouncementItem[]
  sections: HomepageSectionConfig[]
  media: MediaAsset[]
}

const DEFAULT_HERO: HeroContent = {
  brandWorld: 'zuukids · zuulife · zuulight · zuutoptan',
  originTag: 'istanbul atölye',
  headlineMain: 'üç boyutlu formlar,',
  headlineItalic: 'yaşayan mekanlar.',
  leadText:
    'sıradan seri üretim yerine, talebinize özel 0.12mm hassasiyetle 3d basılan işlevsel masa objeleri, çocuk dünyası ve aydınlatma formları.',
  heroImage:
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1600&q=85',
  imageCaptionCode: 'ref. 2026',
  imageCaptionText: 'organik katman geometrisi & biyo-pla',
  primaryCtaText: 'tüm koleksiyonlar',
  primaryCtaHref: '/koleksiyonlar',
  secondaryCtaText: 'zuukids serisi',
  secondaryCtaHref: '/koleksiyon/zuukids',
  active: true,
}

const DEFAULT_ANNOUNCEMENTS: AnnouncementItem[] = [
  {
    id: 'ann-1',
    text: 'zuukids yeni serisi yayında — çocuk güvenli pla objeleri',
    ctaLabel: 'incele',
    ctaHref: '/koleksiyon/zuukids',
    active: true,
    sortOrder: 1,
  },
  {
    id: 'ann-2',
    text: '750 ₺ ve üzeri tüm siparişlerde ücretsiz kargo',
    active: true,
    sortOrder: 2,
  },
  {
    id: 'ann-3',
    text: 'sipariş üzerine 0.12mm hassasiyetle 3d üretim',
    active: true,
    sortOrder: 3,
  },
  {
    id: 'ann-4',
    text: 'zuulight parametrik masa lambaları',
    active: true,
    sortOrder: 4,
  },
]

const DEFAULT_SECTIONS: HomepageSectionConfig[] = [
  { id: 'sec-hero', type: 'hero', name: 'Editorial Campaign Hero', enabled: true, sortOrder: 1 },
  { id: 'sec-categories', type: 'category_strip', name: 'Collection Worlds Strip', enabled: true, sortOrder: 2 },
  { id: 'sec-best-sellers', type: 'best_sellers', name: 'En Çok Tercih Edilenler', enabled: true, sortOrder: 3, customSettings: { limit: 4 } },
  { id: 'sec-zuukids', type: 'zuukids_spotlight', name: 'ZuuKids Koleksiyon Vitrini', enabled: true, sortOrder: 4 },
  { id: 'sec-banner-light', type: 'collection_banner_light', name: 'ZuuLight Kampanya Bannerı', enabled: true, sortOrder: 5 },
  { id: 'sec-new-arrivals', type: 'new_arrivals', name: 'Yeni Eklenen Tasarımlar', enabled: true, sortOrder: 6 },
  { id: 'sec-banner-life', type: 'collection_banner_life', name: 'ZuuLife Çalışma Alanı Bannerı', enabled: true, sortOrder: 7 },
  { id: 'sec-process', type: 'process', name: '4 Aşamalı 3D Üretim Süreci', enabled: true, sortOrder: 8 },
  { id: 'sec-lifestyle', type: 'lifestyle_grid', name: 'Yaşam Alanı Görsel Grid', enabled: true, sortOrder: 9 },
  { id: 'sec-newsletter', type: 'newsletter', name: 'Bülten & İletişim', enabled: true, sortOrder: 10 },
]

const DEFAULT_MEDIA: MediaAsset[] = [
  {
    id: 'med-1',
    name: 'hero_main_lifestyle.webp',
    url: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1600&q=85',
    size: '142 KB',
    type: 'image/webp',
    dimensions: '1600x1067',
    createdAt: new Date(Date.now() - 3600000 * 24 * 10).toISOString(),
    references: 2,
  },
  {
    id: 'med-2',
    name: 'zuukids_spotlight_spread.webp',
    url: 'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?auto=format&fit=crop&w=1200&q=85',
    size: '98 KB',
    type: 'image/webp',
    dimensions: '1200x800',
    createdAt: new Date(Date.now() - 3600000 * 24 * 7).toISOString(),
    references: 1,
  },
  {
    id: 'med-3',
    name: 'zuulight_ambient_lamp.webp',
    url: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1400&q=85',
    size: '115 KB',
    type: 'image/webp',
    dimensions: '1400x933',
    createdAt: new Date(Date.now() - 3600000 * 24 * 5).toISOString(),
    references: 1,
  },
]

// Current working copy (DRAFT)
let draftCmsState: CmsStoreState = {
  status: 'DRAFT',
  lastPublishedAt: new Date().toISOString(),
  lastSavedAt: new Date().toISOString(),
  hero: { ...DEFAULT_HERO },
  announcements: [...DEFAULT_ANNOUNCEMENTS],
  sections: [...DEFAULT_SECTIONS],
  media: [...DEFAULT_MEDIA],
}

// Live production copy (PUBLISHED)
let publishedCmsState: CmsStoreState = {
  ...draftCmsState,
  status: 'PUBLISHED',
}

/**
 * Retrieves the published CMS content consumed safely by public storefront
 */
export async function getPublishedHomepageContent(): Promise<CmsStoreState> {
  return publishedCmsState
}

/**
 * Retrieves the active announcement ticker messages for public storefront
 */
export async function getPublishedAnnouncements(): Promise<AnnouncementItem[]> {
  return publishedCmsState.announcements
    .filter((a) => a.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * Retrieves CMS content for the admin panel (draft or published)
 */
export async function adminGetCms(mode: 'DRAFT' | 'PUBLISHED' = 'DRAFT'): Promise<CmsStoreState> {
  return mode === 'PUBLISHED' ? publishedCmsState : draftCmsState
}

/**
 * Saves draft changes made in the admin panel
 */
export async function adminSaveDraftCms(
  payload: Partial<CmsStoreState>,
  adminEmail = 'system'
): Promise<CmsStoreState> {
  draftCmsState = {
    ...draftCmsState,
    ...payload,
    status: 'DRAFT',
    lastSavedAt: new Date().toISOString(),
  }

  await logAuditEvent({
    action: 'CONTENT_SAVED_DRAFT',
    entity: 'CMS',
    entityId: 'homepage',
    metadata: { adminEmail },
  })

  return draftCmsState
}

/**
 * Publishes draft changes to the live public website
 */
export async function adminPublishCms(adminEmail = 'system'): Promise<CmsStoreState> {
  const now = new Date().toISOString()
  publishedCmsState = {
    ...draftCmsState,
    status: 'PUBLISHED',
    lastPublishedAt: now,
  }
  draftCmsState.lastPublishedAt = now

  await logAuditEvent({
    action: 'CONTENT_PUBLISHED',
    entity: 'CMS',
    entityId: 'homepage',
    metadata: {
      adminEmail,
      publishedAt: now,
      activeSections: publishedCmsState.sections.filter((s) => s.enabled).length,
    },
  })

  return publishedCmsState
}

/**
 * Adds an uploaded asset to the media library
 */
export async function adminAddMediaAsset(
  asset: Omit<MediaAsset, 'id' | 'createdAt' | 'references'>,
  adminEmail = 'system'
): Promise<MediaAsset> {
  const newAsset: MediaAsset = {
    id: `med-${Date.now()}`,
    ...asset,
    createdAt: new Date().toISOString(),
    references: 0,
  }
  draftCmsState.media.unshift(newAsset)
  publishedCmsState.media.unshift(newAsset)

  await logAuditEvent({
    action: 'MEDIA_UPLOADED',
    entity: 'Media',
    entityId: newAsset.id,
    metadata: { name: newAsset.name, url: newAsset.url, adminEmail },
  })

  return newAsset
}

/**
 * Deletes a media asset if not referenced
 */
export async function adminDeleteMediaAsset(
  id: string,
  adminEmail = 'system'
): Promise<{ success: boolean; error?: string }> {
  const asset = draftCmsState.media.find((m) => m.id === id)
  if (!asset) return { success: false, error: 'Medya dosyası bulunamadı.' }

  if (asset.references > 0) {
    return {
      success: false,
      error: `Bu görsel ${asset.references} aktif içerikte kullanılmaktadır. Silinemez.`,
    }
  }

  draftCmsState.media = draftCmsState.media.filter((m) => m.id !== id)
  publishedCmsState.media = publishedCmsState.media.filter((m) => m.id !== id)

  await logAuditEvent({
    action: 'MEDIA_DELETED',
    entity: 'Media',
    entityId: id,
    metadata: { name: asset.name, adminEmail },
  })

  return { success: true }
}
