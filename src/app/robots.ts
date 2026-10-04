import { headers } from 'next/headers'
import { SITE_URL } from '@/lib/config/urls'
import type { MetadataRoute } from 'next'

/**
 * robots.txt. The storefront is open to every crawler, AI assistants and answer
 * engines included (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot,
 * Google-Extended…): a single "*" group covers them, so their rules can never
 * drift from Googlebot's. Private and transactional pages stay out.
 *
 * The admin panel answers on dashboard.zuulab.com from the same app; there the
 * whole host is closed.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = ((await headers()).get('host') ?? '').toLowerCase()
  if (host.startsWith('dashboard.')) {
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Prefix rules: "/hesap" also covers "/hesap/siparisler".
        disallow: ['/admin', '/hesap', '/sepet', '/odeme', '/api/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
