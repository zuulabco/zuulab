import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/config/urls'
import { BRAND, pageTitle, socialTitle } from './title'

/** Shared card image (src/app/og/route.tsx) for pages without a photo of their own. */
export const DEFAULT_OG_IMAGE = { url: '/og', width: 1200, height: 630, alt: 'zuulab · 3D baskı tasarım objeleri' }

/** Absolute URL on the canonical host: "/urun/x" → "https://www.zuulab.com/urun/x". */
export function absoluteUrl(path = '/'): string {
  if (/^https?:\/\//i.test(path)) return path
  const p = path.startsWith('/') ? path : `/${path}`
  return p === '/' ? SITE_URL : `${SITE_URL}${p}`
}

/**
 * Meta description (up to ~200 characters, the range search engines use): whitespace collapsed, markup
 * removed, cut at a word boundary near `max` characters.
 */
export function metaDescription(text: string | null | undefined, max = 200): string {
  const clean = (text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#*_`>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–-]+$/, '')}…`
}

/**
 * The best one-paragraph summary of a product: the SEO description typed in the
 * admin, else the short description when it says enough, else the full text
 * (many short descriptions are a single clipped line).
 */
export function productSummary(p: { seoDescription?: string | null; shortDescription: string; description: string }): string {
  if (p.seoDescription) return p.seoDescription
  const short = p.shortDescription.replace(/…$/, '').trim()
  return short.length >= 90 || !p.description ? p.shortDescription : p.description
}

interface PageMetadataInput {
  /** Page name without the brand; the layout template adds " · zuulab". */
  title: string
  description: string
  /** Canonical path, e.g. "/urunler". */
  path: string
  images?: Array<string | { url: string; alt?: string; width?: number; height?: number }>
  type?: 'website' | 'article'
  /** Keep the page out of search results (it still passes link equity unless follow is false). */
  noindex?: boolean
}

/**
 * Full metadata for a public page. Next merges metadata shallowly, so a page that
 * sets `openGraph` loses the layout's site name, locale and image; this always
 * sends the complete set, plus the canonical URL.
 */
export function pageMetadata({ title, description, path, images, type = 'website', noindex }: PageMetadataInput): Metadata {
  const desc = metaDescription(description)
  const ogImages = images && images.length > 0 ? images : [DEFAULT_OG_IMAGE]
  const social = socialTitle(title)
  return {
    title: pageTitle(title),
    description: desc,
    alternates: { canonical: path },
    openGraph: {
      type,
      locale: 'tr_TR',
      siteName: BRAND,
      url: path,
      title: social,
      description: desc,
      images: ogImages,
    },
    twitter: {
      card: 'summary_large_image',
      title: social,
      description: desc,
      images: ogImages.map((i) => (typeof i === 'string' ? i : i.url)),
    },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  }
}
