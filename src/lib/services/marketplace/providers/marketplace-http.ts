import type {
  ConnectionTestResult,
  MarketplaceCredential,
  MarketplaceProviderType,
  MarketplaceStore,
} from '../marketplace.interface'
import { MarketplaceError } from '../marketplace-error'

/**
 * Shared HTTP client for Trendyol and Hepsiburada. Both use HTTP Basic auth and
 * require a User-Agent identifying the seller ("{sellerId} - SelfIntegration" for
 * sellers integrating themselves); requests without it are rejected.
 */

const REQUEST_TIMEOUT_MS = 20_000

export function marketplaceHeaders(
  store: MarketplaceStore,
  credential: MarketplaceCredential | undefined
): Record<string, string> {
  if (!credential?.apiKey || !credential.apiSecret) {
    throw new MarketplaceError({
      message: `${store.name}: API anahtarları tanımlanmamış.`,
      code: 'NOT_CONFIGURED',
      provider: store.provider,
    })
  }
  return {
    Authorization: `Basic ${Buffer.from(`${credential.apiKey}:${credential.apiSecret}`).toString('base64')}`,
    'User-Agent': `${store.externalMerchantId} - SelfIntegration`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

/** First part of a provider error body, for messages. Never contains our credentials. */
async function errorSnippet(res: Response): Promise<string> {
  try {
    const text = (await res.text()).replace(/\s+/g, ' ').trim()
    return text.length > 300 ? `${text.slice(0, 300)}…` : text
  } catch {
    return ''
  }
}

export async function marketplaceFetch(
  provider: MarketplaceProviderType,
  url: string,
  init: RequestInit & { headers: Record<string, string> }
): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: 'no-store' })
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError'
    throw new MarketplaceError({
      message: timedOut ? `${provider} API ${REQUEST_TIMEOUT_MS / 1000} sn içinde yanıt vermedi.` : `${provider} API'ye ulaşılamadı.`,
      code: 'TEMPORARY_ERROR',
      provider,
      rawError: err,
    })
  }
  if (res.ok) return res

  const snippet = await errorSnippet(res)
  if (res.status === 401 || res.status === 403) {
    throw new MarketplaceError({
      message: `${provider} kimlik doğrulaması reddedildi (${res.status}). API anahtarlarını, satıcı ID'yi ve ortamı kontrol edin.${snippet ? ` Yanıt: ${snippet}` : ''}`,
      code: 'AUTHENTICATION_ERROR',
      provider,
      statusCode: res.status,
    })
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after'))
    throw new MarketplaceError({
      message: `${provider} istek sınırı aşıldı (429).`,
      code: 'RATE_LIMITED',
      provider,
      statusCode: 429,
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    })
  }
  throw new MarketplaceError({
    message: `${provider} API hatası (${res.status}).${snippet ? ` Yanıt: ${snippet}` : ''}`,
    code: res.status >= 500 ? 'TEMPORARY_ERROR' : 'PROVIDER_ERROR',
    provider,
    statusCode: res.status,
  })
}

/** Turns a failed connection probe into the result shown in the admin. */
export function connectionFailure(err: unknown): ConnectionTestResult {
  if (err instanceof MarketplaceError) {
    const code: ConnectionTestResult['code'] =
      err.code === 'AUTHENTICATION_ERROR' || err.code === 'AUTHORIZATION_ERROR'
        ? 'INVALID_CREDENTIALS'
        : err.code === 'RATE_LIMITED'
          ? 'RATE_LIMITED'
          : err.code === 'NOT_CONFIGURED'
            ? 'NOT_CONFIGURED'
            : err.code === 'TEMPORARY_ERROR' && !err.statusCode
              ? 'NETWORK_ERROR'
              : 'PROVIDER_ERROR'
    return { success: false, code, message: err.message, details: err.statusCode ? { httpStatus: err.statusCode } : undefined }
  }
  return { success: false, code: 'PROVIDER_ERROR', message: err instanceof Error ? err.message : 'Bilinmeyen hata.' }
}
