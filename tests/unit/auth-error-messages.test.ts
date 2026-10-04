import { describe, expect, it } from 'vitest'
import { authErrorMessage, BOT_CHECK_MESSAGE, isBotCheckError } from '@/lib/auth/error-messages'

describe('auth error messages', () => {
  it('explains failed bot checks instead of blaming the password', () => {
    for (const code of ['auth/missing-recaptcha-token', 'auth/invalid-recaptcha-token', 'auth/captcha-check-failed']) {
      expect(isBotCheckError(code)).toBe(true)
      expect(authErrorMessage(code, 'x')).toBe(BOT_CHECK_MESSAGE)
    }
  })

  it('keeps the known sign-in and sign-up messages', () => {
    expect(authErrorMessage('auth/invalid-credential', 'x')).toBe('E-posta adresi veya şifre hatalı.')
    expect(authErrorMessage('auth/email-already-in-use', 'x')).toBe('Bu e-posta adresi zaten kullanımda.')
    expect(authErrorMessage('auth/too-many-requests', 'x')).toMatch(/Çok fazla deneme/)
  })

  it('falls back for unknown or missing codes', () => {
    expect(authErrorMessage('auth/something-new', 'Kayıt oluşturulamadı.')).toBe('Kayıt oluşturulamadı.')
    expect(authErrorMessage(undefined, 'Giriş yapılamadı.')).toBe('Giriş yapılamadı.')
    expect(isBotCheckError(undefined)).toBe(false)
  })
})
