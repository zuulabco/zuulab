import 'server-only'
import { getEmailProvider } from './email-provider.factory'
import { renderEmailBase } from './templates/email-base.template'
import { SITE_URL } from '@/lib/config/urls'

/** Customer-written text is untrusted; never put it into HTML unescaped. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function paragraphs(text: string): string {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Inbox that receives new tickets and contact-form messages. */
export function supportInbox(): string | null {
  return process.env.SUPPORT_INBOX_EMAIL || process.env.RESEND_FROM_EMAIL || null
}

async function send(to: string, subject: string, contentHtml: string, idempotencyKey: string) {
  const { html } = renderEmailBase({ title: subject, contentHtml })
  const result = await getEmailProvider().sendEmail({ to, subject, html, idempotencyKey })
  if (!result.success) {
    console.error('[support-email] send failed:', subject, result.error)
  }
  return result.success
}

/**
 * Tells the customer that support answered. Account tickets link to the thread;
 * contact-form senders have no account, so the reply text itself is included.
 */
export async function sendSupportReplyEmail(params: {
  to: string
  ticketId: string
  subject: string
  messageId: string
  channel: 'ACCOUNT' | 'CONTACT_FORM'
  replyBody: string
}) {
  const link = `${SITE_URL}/hesap/destek/${encodeURIComponent(params.ticketId)}`
  const content =
    params.channel === 'CONTACT_FORM'
      ? `<p>"${escapeHtml(params.subject)}" konulu mesajınıza yanıtımız:</p>
         ${paragraphs(params.replyBody)}
         <p>Bu e-postayı yanıtlayarak bize tekrar ulaşabilirsiniz.</p>`
      : `<p>"${escapeHtml(params.subject)}" konulu destek talebinize yeni bir yanıt verildi.</p>
         <p><a href="${link}">Yanıtı hesabınızda görüntüleyin</a></p>`
  return send(params.to, `Destek talebiniz yanıtlandı: ${params.subject}`, content, `support-reply:${params.messageId}`)
}

/** Alerts the support inbox about a new ticket or contact-form message. */
export async function notifySupportTeam(params: {
  ticketId: string
  subject: string
  category: string
  channel: 'ACCOUNT' | 'CONTACT_FORM'
  fromName: string
  fromEmail: string
  phone?: string | null
  message: string
}) {
  const inbox = supportInbox()
  if (!inbox) {
    console.warn('[support-email] SUPPORT_INBOX_EMAIL is not set; new ticket alert skipped.')
    return false
  }
  return send(
    inbox,
    `[${params.channel === 'CONTACT_FORM' ? 'İletişim' : 'Destek'}] ${params.subject}`,
    `<p><strong>Gönderen:</strong> ${escapeHtml(params.fromName)} &lt;${escapeHtml(params.fromEmail)}&gt;${
      params.phone ? ` · ${escapeHtml(params.phone)}` : ''
    }</p>
     <p><strong>Kategori:</strong> ${escapeHtml(params.category)}</p>
     ${paragraphs(params.message)}
     <p>Talep no: ${escapeHtml(params.ticketId)}</p>`,
    `support-new:${params.ticketId}`
  )
}
