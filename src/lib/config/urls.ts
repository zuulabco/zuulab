/**
 * The admin panel lives on its own subdomain; zuulab.com/admin only redirects there
 * (src/proxy.ts). Link to it with a plain <a>: a Next <Link> would prefetch /admin
 * with fetch(), follow the cross-origin redirect and be blocked by connect-src.
 */
export const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'https://dashboard.zuulab.com'
