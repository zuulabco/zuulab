import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Liveness Probe: Checks if the application process is running and responding to HTTP requests.
 * Does NOT perform database or external calls. Fast, lightweight.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      liveness: true,
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  )
}
