import { NextResponse } from 'next/server'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { validateEnvironment } from '@/lib/config/env'

export const dynamic = 'force-dynamic'

/**
 * Readiness Probe: Checks if the application is ready to accept production traffic
 * and execute business operations. Performs a lightweight check against PostgreSQL.
 * NEVER leaks DATABASE_URL, connection strings, credentials, or stack traces.
 */
export async function GET() {
  const isProd = process.env.NODE_ENV === 'production'
  let dbStatus: 'connected' | 'disconnected' | 'not_configured' = 'disconnected'

  if (isDatabaseConfigured) {
    try {
      // Lightweight single-row query without heavy operations
      await db.orm.public.Setting.first()
      dbStatus = 'connected'
    } catch {
      dbStatus = 'disconnected'
    }
  } else {
    dbStatus = isProd ? 'disconnected' : 'not_configured'
  }

  const isReady = dbStatus === 'connected' || (!isProd && dbStatus === 'not_configured')
  // Counts only: the messages name integrations and stay in the server logs.
  const config = validateEnvironment()

  return NextResponse.json(
    {
      status: isReady ? 'ok' : 'degraded',
      readiness: isReady,
      database: dbStatus,
      configErrors: config.errors.length,
      configWarnings: config.warnings.length,
      environment: isProd ? 'production' : (process.env.NODE_ENV || 'development'),
      timestamp: new Date().toISOString(),
    },
    {
      status: isReady ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  )
}
