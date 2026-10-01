import { NextResponse } from 'next/server'
import { db, isDatabaseConfigured } from '@/prisma/db'

export const dynamic = 'force-dynamic'

/**
 * Standard Health Check Endpoint: /api/health
 * Returns high-level application and database operational status.
 * Never exposes credentials, connection strings, or internal errors.
 */
export async function GET() {
  const isProd = process.env.NODE_ENV === 'production'
  let dbStatus: 'connected' | 'disconnected' | 'not_configured' = 'disconnected'

  if (isDatabaseConfigured) {
    try {
      await (db.orm.public.Setting as any).findFirst({
        select: { id: true },
      })
      dbStatus = 'connected'
    } catch {
      dbStatus = 'disconnected'
    }
  } else {
    dbStatus = isProd ? 'disconnected' : 'not_configured'
  }

  const isHealthy = dbStatus === 'connected' || (!isProd && dbStatus === 'not_configured')

  return NextResponse.json(
    {
      status: isHealthy ? 'ok' : 'degraded',
      database: dbStatus,
      timestamp: new Date().toISOString(),
    },
    {
      status: isHealthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  )
}
