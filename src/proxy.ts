import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  isMaintenanceModeEnabled,
  getMaintenanceAllowedIps,
  getClientIp,
  isIpAllowed,
  isLocalRequest,
  getMaintenanceHtml,
  getCachedMaintenanceState,
  setCachedMaintenanceState,
} from '@/lib/config/maintenance'

/**
 * In-memory edge cache with 5-second TTL to avoid repeated subrequests
 * while keeping edge isolates closely synchronized with database updates.
 */
interface EdgeMaintenanceCache {
  enabled: boolean
  expiresAt: number
}

let _edgeMaintenanceCache: EdgeMaintenanceCache | null = null

export function resetProxyCache(): void {
  _edgeMaintenanceCache = null
}

/**
 * Resolves maintenance mode status for Edge / Serverless requests.
 *
 * 1. Checks in-memory edge cache (5s TTL).
 * 2. If same-process cache is already populated, uses it.
 * 3. Otherwise, queries the internal /api/maintenance/status endpoint.
 * 4. Falls back to environment variable if fetch fails or times out.
 */
async function resolveMaintenanceStatus(request: NextRequest): Promise<boolean> {
  const now = Date.now()

  // 1. Same-process memory cache check (for unit tests / local dev / same lambda)
  const inMemory = getCachedMaintenanceState()
  if (inMemory.enabled !== null) {
    return inMemory.enabled
  }

  // 2. Fast in-memory edge cache hit
  if (_edgeMaintenanceCache && now < _edgeMaintenanceCache.expiresAt) {
    return _edgeMaintenanceCache.enabled
  }

  // 3. Query internal lightweight status endpoint (edge-compatible)
  try {
    const origin = request.nextUrl.origin
    const res = await fetch(`${origin}/api/maintenance/status`, {
      signal: AbortSignal.timeout(1500),
      headers: { 'x-proxy-check': '1' },
    })

    if (res.ok) {
      const data = await res.json()
      if (typeof data.enabled === 'boolean') {
        _edgeMaintenanceCache = {
          enabled: data.enabled,
          expiresAt: now + 5000, // 5 seconds TTL
        }
        return data.enabled
      }
    }
  } catch {
    // Network / timeout / offline test runner fallback
  }

  // 4. Stale-while-error fallback
  if (_edgeMaintenanceCache) {
    return _edgeMaintenanceCache.enabled
  }

  // 5. Ultimate fallback to environment variable
  return isMaintenanceModeEnabled()
}

/**
 * ZUULAB Global Edge / Serverless Proxy (Next.js 16 file convention)
 *
 * Responsibilities:
 * 1. Dashboard Subdomain Routing (dashboard.zuulab.com):
 *    - Canonical 308 redirect from /admin and /admin/* to clean paths (e.g. /admin/orders -> /orders).
 *    - Internal Next.js rewrite from clean paths to /admin/* (e.g. /orders -> /admin/orders).
 *    - Guarantees browser URL NEVER exposes /admin.
 *    - Excluded from maintenance mode (always accessible).
 *
 * 2. Storefront Canonical Admin Redirect (zuulab.com/admin -> dashboard.zuulab.com):
 *    - Canonical 308 redirect to dashboard.zuulab.com (e.g. zuulab.com/admin/orders -> dashboard.zuulab.com/orders).
 *
 * 3. Storefront Maintenance Mode Enforcement:
 *    - Evaluates PostgreSQL database state as Single Source of Truth via /api/maintenance/status.
 *    - Respects DB = false overriding ENV = true.
 *    - Whitelists developer/admin preview via MAINTENANCE_ALLOWED_IPS.
 *    - Returns HTTP 503 Service Unavailable with Retry-After for SEO protection.
 *
 * 4. Defense-in-Depth Exemptions:
 *    - /api/* (including PayTR webhook, checkout, orders, health, crons)
 *    - Next.js internal static assets (/_next/*)
 *    - Metadata and static files (favicon.ico, robots.txt, sitemap.xml, images, fonts)
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const rawHost = request.headers.get('host') || request.nextUrl.host || ''
  const hostname = rawHost.split(':')[0].toLowerCase()

  // 0. Defense-in-depth: Immediately pass through all API routes and Next.js internal assets
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|txt|xml|woff|woff2)$/i.test(pathname)
  ) {
    return NextResponse.next()
  }

  const isDashboardSubdomain = hostname === 'dashboard.zuulab.com' || hostname.startsWith('dashboard.')

  // 1. CANONICAL ADMIN REDIRECTS:
  // Case A: User arrives at dashboard subdomain with /admin prefix
  // https://dashboard.zuulab.com/admin -> https://dashboard.zuulab.com/
  // https://dashboard.zuulab.com/admin/orders -> https://dashboard.zuulab.com/orders
  if (isDashboardSubdomain && (pathname === '/admin' || pathname.startsWith('/admin/'))) {
    const cleanPath = pathname.replace(/^\/admin/, '') || '/'
    const targetUrl = new URL(`https://dashboard.zuulab.com${cleanPath}${search}`)
    return NextResponse.redirect(targetUrl, 308)
  }

  // Case B: User arrives at storefront domain with /admin prefix
  // https://zuulab.com/admin -> https://dashboard.zuulab.com/
  // https://zuulab.com/admin/orders -> https://dashboard.zuulab.com/orders
  // https://www.zuulab.com/admin -> https://dashboard.zuulab.com/
  // https://www.zuulab.com/admin/orders -> https://dashboard.zuulab.com/orders
  if (!isDashboardSubdomain && (pathname === '/admin' || pathname.startsWith('/admin/'))) {
    const cleanPath = pathname.replace(/^\/admin/, '') || '/'
    const targetUrl = new URL(`https://dashboard.zuulab.com${cleanPath}${search}`)
    return NextResponse.redirect(targetUrl, 308)
  }

  // 2. DASHBOARD SUBDOMAIN INTERNAL REWRITE:
  // dashboard.zuulab.com/          -> internal Next.js /admin
  // dashboard.zuulab.com/orders    -> internal Next.js /admin/orders
  // dashboard.zuulab.com/products  -> internal Next.js /admin/products
  // dashboard.zuulab.com/settings  -> internal Next.js /admin/settings
  // (Browser URL remains https://dashboard.zuulab.com/orders without /admin)
  // Dashboard is ALWAYS EXEMPT from storefront maintenance mode.
  if (isDashboardSubdomain) {
    const adminUrl = request.nextUrl.clone()
    if (pathname === '/' || pathname === '') {
      adminUrl.pathname = '/admin'
    } else {
      adminUrl.pathname = `/admin${pathname}`
    }
    return NextResponse.rewrite(adminUrl)
  }

  // 3. STOREFRONT MAINTENANCE MODE EVALUATION:
  const isMaintenanceActive = await resolveMaintenanceStatus(request)
  if (!isMaintenanceActive) {
    return NextResponse.next()
  }

  // 4. Inspect Client IP for Allowlist Bypass
  const clientIp = getClientIp(request.headers)
  const allowedIps = getMaintenanceAllowedIps()

  if (isIpAllowed(clientIp, allowedIps) || isLocalRequest(request.nextUrl.hostname, clientIp)) {
    const response = NextResponse.next()
    response.headers.set('x-maintenance-bypass', 'allowed-ip')
    return response
  }

  // 5. Block Public Storefront with HTTP 503 Service Unavailable
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
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt, and image/font extensions
     */
    '/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)',
  ],
}
