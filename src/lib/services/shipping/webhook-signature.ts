import 'server-only'
import crypto from 'crypto'

/**
 * Single authentication policy for inbound carrier webhooks.
 *
 * Signature: hex HMAC-SHA256 of the raw request body, keyed with
 * `<PROVIDER>_WEBHOOK_SECRET` or the shared `SHIPPING_WEBHOOK_SECRET`
 * (an optional `sha256=` prefix is accepted).
 *
 * In production a secret and a matching signature are mandatory and the MOCK
 * provider is rejected, because a forged event can mark orders shipped/delivered.
 * Outside production, without a secret, the provider's own (mock) verifier is used.
 */
export function verifyCarrierWebhook(params: {
  provider: string
  rawBody: string
  signature?: string | null
  providerVerifier?: (rawBody: string, signature: string) => boolean
}): { ok: true } | { ok: false; reason: string } {
  const provider = params.provider.toUpperCase()
  const signature = (params.signature || '').trim().replace(/^Bearer\s+/i, '').replace(/^sha256=/i, '')
  const isProduction = process.env.NODE_ENV === 'production'

  if (isProduction && provider === 'MOCK') {
    return { ok: false, reason: 'MOCK kargo sağlayıcısı için webhook imzası kabul edilmez.' }
  }

  const secret = process.env[`${provider}_WEBHOOK_SECRET`] || process.env.SHIPPING_WEBHOOK_SECRET

  if (secret) {
    if (!signature) return { ok: false, reason: 'Webhook imzası eksik.' }
    const expected = crypto.createHmac('sha256', secret).update(params.rawBody).digest('hex')
    const sigBuf = Buffer.from(signature)
    const expBuf = Buffer.from(expected)
    const valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)
    return valid ? { ok: true } : { ok: false, reason: 'Geçersiz webhook imzası.' }
  }

  if (isProduction) {
    return { ok: false, reason: 'Webhook imza anahtarı (SHIPPING_WEBHOOK_SECRET) yapılandırılmamış.' }
  }

  if (signature && params.providerVerifier && !params.providerVerifier(params.rawBody, signature)) {
    return { ok: false, reason: 'Geçersiz webhook imzası.' }
  }
  return { ok: true }
}
