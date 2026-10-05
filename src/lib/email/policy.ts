/**
 * Master switch for commercial e-mail (newsletter campaigns and the automatic reminder / review
 * mails). It is OFF unless the environment variable COMMERCIAL_EMAIL_ENABLED is "true", so nothing
 * commercial can be sent by a click in the admin before the business is ready (İYS registration
 * and the lawyer's approval of the consent texts).
 *
 * Not affected: order, payment and shipping mails (they are not commercial), the sample / test
 * mails an admin sends to their own address, and everything that reads or counts.
 */
export function commercialEmailEnabled(): boolean {
  return process.env.COMMERCIAL_EMAIL_ENABLED?.trim().toLowerCase() === 'true'
}

export const COMMERCIAL_EMAIL_OFF_MESSAGE =
  'Ticari e-posta gönderimi şu an kapalı (İYS kaydı tamamlanana kadar). Sipariş ve kargo bilgilendirmeleri etkilenmez. Açmak için Vercel’de COMMERCIAL_EMAIL_ENABLED=true tanımlayın.'
