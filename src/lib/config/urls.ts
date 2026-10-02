/**
 * The admin panel lives on its own subdomain; zuulab.com/admin only redirects there
 * (src/proxy.ts). Link to it with a plain <a>: a Next <Link> would prefetch /admin
 * with fetch(), follow the cross-origin redirect and be blocked by connect-src.
 */
export const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'https://dashboard.zuulab.com'

/**
 * Canonical public site URL for sitemap, robots and metadata. zuulab.com
 * redirects to www.zuulab.com, so the www host is the canonical one.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.zuulab.com').replace(/\/$/, '')
