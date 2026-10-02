import type { Instrumentation } from 'next'

/**
 * Runs once per server instance before it serves requests. Reports configuration
 * problems (missing secrets, PayTR left in test mode, …) to the logs; it never
 * stops the server, so a missing optional setting cannot take the shop offline.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  try {
    const { validateEnvironment } = await import('./lib/config/env')
    const result = validateEnvironment()
    for (const error of result.errors) {
      console.error(JSON.stringify({ level: 'error', event: 'config.invalid', message: error }))
    }
    for (const warning of result.warnings) {
      console.warn(JSON.stringify({ level: 'warn', event: 'config.warning', message: warning }))
    }
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', event: 'config.check_failed', message: String(err) }))
  }
}

/**
 * One structured log line per unhandled server error, so failures can be
 * searched in the Vercel logs by path, route and digest. No request bodies or
 * headers are logged (they can contain personal data and tokens).
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const error = err as { message?: string; digest?: string; name?: string }
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'request.error',
      method: request.method,
      path: request.path,
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: (context as { renderSource?: string }).renderSource,
      name: error?.name,
      message: error?.message,
      digest: error?.digest,
    })
  )
}
