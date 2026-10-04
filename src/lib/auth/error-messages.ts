/**
 * Turkish messages for Firebase Auth error codes on the email/password forms.
 * Bot-check failures get their own wording so a real person knows to retry
 * instead of doubting their password.
 */

const BOT_CHECK_CODES = new Set([
  'auth/missing-recaptcha-token',
  'auth/invalid-recaptcha-token',
  'auth/invalid-recaptcha-action',
  'auth/missing-recaptcha-version',
  'auth/invalid-recaptcha-version',
  'auth/captcha-check-failed',
  'auth/recaptcha-not-enabled',
])

export const BOT_CHECK_MESSAGE =
  'Güvenlik doğrulaması tamamlanamadı. Sayfayı yenileyip tekrar dene; reklam veya içerik engelleyici kullanıyorsan bu site için kapat.'

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'E-posta adresi veya şifre hatalı.',
  'auth/wrong-password': 'E-posta adresi veya şifre hatalı.',
  'auth/user-not-found': 'Bu e-posta adresiyle kayıtlı kullanıcı bulunamadı.',
  'auth/invalid-email': 'Geçerli bir e-posta adresi gir.',
  'auth/user-disabled': 'Bu hesap kullanıma kapatılmış.',
  'auth/email-already-in-use': 'Bu e-posta adresi zaten kullanımda.',
  'auth/weak-password': 'Şifre en az 6 karakter olmalıdır.',
  'auth/too-many-requests': 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.',
  'auth/network-request-failed': 'Bağlantı kurulamadı. İnternet bağlantını kontrol edip tekrar dene.',
}

export function isBotCheckError(code: unknown): boolean {
  return typeof code === 'string' && BOT_CHECK_CODES.has(code)
}

export function authErrorMessage(code: unknown, fallback: string): string {
  if (isBotCheckError(code)) return BOT_CHECK_MESSAGE
  return (typeof code === 'string' && MESSAGES[code]) || fallback
}
