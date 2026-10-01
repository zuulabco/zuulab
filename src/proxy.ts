import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  isMaintenanceModeEnabled,
  getMaintenanceAllowedIps,
  getClientIp,
  isIpAllowed,
  getMaintenanceHtml,
} from '@/lib/config/maintenance'

/**
 * ZUULAB Global Edge / Serverless Proxy (Next.js 16 file convention)
 *
 * Responsibilities:
 * 1. Checks Maintenance Mode for public storefront routes.
 * 2. Whitelists:
 *    - All API endpoints (/api/* including PayTR webhook, checkout, orders, health, crons)
 *    - Admin dashboard (/admin and /admin/*)
 *    - Next.js internal static assets (/_next/*)
 *    - Metadata and static files (favicon.ico, robots.txt, sitemap.xml, images)
 * 3. Enforces IP-based allowlist (MAINTENANCE_ALLOWED_IPS) for developer/admin preview.
 * 4. Responds with HTTP 503 Service Unavailable (with no-cache and Retry-After) to protect SEO.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Explicit Route Exclusions (Defense-in-depth)
  // Ensure that /api, /admin, webhooks, crons, health, and static files NEVER hit maintenance
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|txt|xml|woff|woff2)$/i.test(pathname)
  ) {
    return NextResponse.next()
  }

  // 2. Check Maintenance Mode status
  if (!isMaintenanceModeEnabled()) {
    return NextResponse.next()
  }

  // 3. Inspect Client IP for allowlist bypass
  const clientIp = getClientIp(request.headers)
  const allowedIps = getMaintenanceAllowedIps()

  if (isIpAllowed(clientIp, allowedIps)) {
    // Authorized developer/tester: pass through and tag header for visibility
    const response = NextResponse.next()
    response.headers.set('x-maintenance-bypass', 'allowed-ip')
    return response
  }

  // 4. Block Public Storefront with 503 Service Unavailable
  return new Response(getMaintenanceHtml(), {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Retry-After': '3600',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Maintenance-Mode': 'active',
    },
  })
}

export default proxy

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api (API routes, webhooks, health, crons)
     * - admin (Admin dashboard)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt
     */
    '/((?!api|admin|_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)',
  ],
}
