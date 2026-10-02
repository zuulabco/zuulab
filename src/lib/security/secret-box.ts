import 'server-only'
import crypto from 'crypto'

/**
 * Authenticated encryption (AES-256-GCM) for secrets stored in the database, such
 * as marketplace API credentials.
 *
 * Key: MARKETPLACE_CREDENTIALS_KEY, 32 random bytes as base64 or hex
 * (e.g. `openssl rand -base64 32`). Losing the key makes stored secrets
 * unreadable; they must then be re-entered in the admin.
 *
 * Format: `v1:<iv b64>:<tag b64>:<ciphertext b64>`. GCM's tag makes any tampering
 * with the stored value fail decryption instead of yielding garbage.
 */

const VERSION = 'v1'

function loadKey(): Buffer {
  const raw = process.env.MARKETPLACE_CREDENTIALS_KEY?.trim()
  if (!raw) {
    throw new Error('SECRET_KEY_MISSING: MARKETPLACE_CREDENTIALS_KEY tanımlı değil.')
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('SECRET_KEY_INVALID: MARKETPLACE_CREDENTIALS_KEY 32 bayt (base64 veya hex) olmalıdır.')
  }
  return key
}

export function isSecretBoxConfigured(): boolean {
  try {
    loadKey()
    return true
  } catch {
    return false
  }
}

export function sealSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', loadKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':')
}

export function openSecret(sealed: string): string {
  const [version, iv, tag, ciphertext] = sealed.split(':')
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error('SECRET_FORMAT_INVALID: Şifreli değer okunamadı.')
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', loadKey(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8')
}
