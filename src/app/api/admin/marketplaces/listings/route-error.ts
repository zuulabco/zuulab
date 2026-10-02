import { NextResponse } from 'next/server'

/** Maps service errors (auth, MarketplaceError codes) to JSON responses. */
export function listingErrorResponse(err: unknown, fallback: string) {
  const error = err as { message?: string; code?: string }
  const message = error.message || fallback
  const status =
    message.includes('FORBIDDEN') || message.includes('UNAUTHORIZED')
      ? 403
      : error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'VALIDATION_ERROR'
          ? 400
          : error.code === 'AUTHENTICATION_ERROR' || error.code === 'NOT_CONFIGURED'
            ? 502
            : error.code === 'RATE_LIMITED'
              ? 429
              : 500
  return NextResponse.json({ success: false, error: message }, { status })
}
