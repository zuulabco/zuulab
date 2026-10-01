import { NextResponse } from 'next/server'
import { getMaintenanceModeStatus } from '@/lib/services/settings/maintenance-settings.service'

export const dynamic = 'force-dynamic'

/**
 * Public lightweight endpoint: GET /api/maintenance/status
 *
 * Used by Edge Proxy and client health checks to determine whether
 * storefront maintenance mode is currently active.
 *
 * Returns:
 * {
 *   success: true,
 *   enabled: boolean,
 *   source: 'database' | 'env' | 'default'
 * }
 *
 * Never exposes allowed IPs, admin credentials, or internal connection strings.
 * Includes Cache-Control for fast edge caching with stale-while-revalidate.
 */
export async function GET() {
  try {
    const status = await getMaintenanceModeStatus()

    return NextResponse.json(
      {
        success: true,
        enabled: status.enabled,
        source: status.source,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10',
          'Content-Type': 'application/json',
        },
      }
    )
  } catch (error) {
    console.error('[api/maintenance/status] Error querying maintenance status:', error)
    return NextResponse.json(
      {
        success: false,
        enabled: false,
        source: 'error',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache',
        },
      }
    )
  }
}
