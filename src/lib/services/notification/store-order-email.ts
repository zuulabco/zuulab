import 'server-only'
import { db } from '@/prisma/db'
import { formatPrice } from '@/lib/utils'
import { fromDbTimestamp } from '@/lib/db/time'
import { DASHBOARD_URL } from '@/lib/config/urls'
import { getEmailProvider } from './email-provider.factory'
import { renderEmailBase } from './templates/email-base.template'
import { escapeHtml } from './support-email'
import { formatTrMobile } from '@/lib/validations/phone'

/**
 * Where "Sipariş Geldi!" alerts go. ORDER_NOTIFY_EMAIL if set, otherwise the support
 * inbox. Deliberately not RESEND_FROM_EMAIL: that is a sending-only address.
 */
function storeInbox(): string | null {
  return process.env.ORDER_NOTIFY_EMAIL || process.env.SUPPORT_INBOX_EMAIL || null
}

const row = (label: string, value: string) =>
  `<tr><td style="padding: 4px 16px 4px 0; color: rgba(255,255,255,0.5); white-space: nowrap; vertical-align: top;">${label}</td><td style="padding: 4px 0; color: #e5e7eb;">${value}</td></tr>`

/**
 * Tells the shop owner a paid order came in: who ordered, when, what. Called once
 * per order, right after the payment is confirmed (an abandoned checkout sends
 * nothing). Never throws: a failed alert must not affect the payment callback.
 *
 * `bank-transfer` is the heads-up for a havale/EFT order placed but not yet paid:
 * same details, so the owner can match the incoming transfer and confirm it in the
 * panel. The usual "Sipariş Geldi!" follows once it is confirmed.
 *
 * `cash-on-delivery`: a kapıda ödeme order, confirmed and ready to pack; PTT collects
 * the total at the door, so the label is created from the order page (Geliver).
 */
export async function sendNewOrderAlert(orderId: string, kind: 'paid' | 'bank-transfer' | 'cash-on-delivery' = 'paid'): Promise<void> {
  try {
    const to = storeInbox()
    if (!to) {
      console.warn('[store-order-email] No ORDER_NOTIFY_EMAIL / SUPPORT_INBOX_EMAIL; new-order alert skipped.')
      return
    }

    const order = await db.orm.public.Order.where({ id: orderId }).first()
    if (!order) return
    const items = await db.orm.public.OrderItem.where({ orderId }).all()
    const user = await db.orm.public.User.select('email', 'name', 'firebaseUid').where({ id: order.userId }).first()

    const placedAt = (fromDbTimestamp(order.createdAt) ?? new Date()).toLocaleString('tr-TR', {
      timeZone: 'Europe/Istanbul',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    const email = order.email || user?.email || '—'
    const customerType = user?.firebaseUid ? 'üye' : 'misafir'
    const address = [order.shipToAddress, `${order.shipToDistrict} / ${order.shipToCity}`, order.shipToPostal]
      .filter(Boolean)
      .map((p) => escapeHtml(String(p)))
      .join('<br>')

    const itemRows = items
      .map(
        (it) => `<tr>
          <td>${escapeHtml(it.productName)}${it.variantInfo ? `<br><span style="color: rgba(255,255,255,0.5); font-size: 12px;">${escapeHtml(it.variantInfo)}</span>` : ''}</td>
          <td style="text-align: center;">${it.quantity}</td>
          <td style="text-align: right; white-space: nowrap;">${formatPrice(Number(it.total))}</td>
        </tr>`
      )
      .join('')

    const discount = Number(order.discountAmount)
    const awaiting = kind === 'bank-transfer'
    const cod = kind === 'cash-on-delivery'
    const subject = awaiting
      ? `Havale Bekleniyor: #${order.orderNumber} · ${formatPrice(Number(order.total))}`
      : cod
        ? `Sipariş Geldi! (Kapıda Ödeme) #${order.orderNumber} · ${formatPrice(Number(order.total))}`
        : `Sipariş Geldi! #${order.orderNumber} · ${formatPrice(Number(order.total))}`
    const contentHtml = `
      <p style="font-size: 18px; color: #ffffff; margin: 0 0 16px;"><strong>${awaiting ? 'Havale/EFT ile yeni sipariş' : 'Yeni sipariş'}: #${escapeHtml(order.orderNumber)}</strong></p>
      ${cod ? `<p style="margin: 0 0 16px;"><strong>Kapıda ödeme</strong>: ${formatPrice(Number(order.total))} teslimatta PTT Kargo tarafından tahsil edilecek. Paketi hazırlayınca siparişi panelde açıp <strong>"Kargo oluştur"</strong> ile etiketi al.</p>` : ''}
      ${awaiting ? `<p style="margin: 0 0 16px;">Ödeme henüz gelmedi. <strong>${formatPrice(Number(order.total))}</strong> hesabına ulaştığında siparişi panelde açıp <strong>"havale ödemesi geldi"</strong> ile onayla; onaylanmayan sipariş 48 saat sonra düşer ve stok serbest kalır.</p>` : ''}
      <table style="font-size: 13px; border-collapse: collapse; margin-bottom: 8px;">
        ${row('Tarih', placedAt)}
        ${row('Müşteri', `${escapeHtml(order.shipToName)} <span style="color: rgba(255,255,255,0.5);">(${customerType})</span>`)}
        ${row('E-posta', escapeHtml(email))}
        ${row('Telefon', escapeHtml(formatTrMobile(order.shipToPhone)))}
        ${row('Teslimat', address)}
        ${order.customerNote ? row('Not', escapeHtml(order.customerNote)) : ''}
      </table>
      <table class="item-table">
        <thead><tr><th>Ürün</th><th style="text-align: center;">Adet</th><th style="text-align: right;">Tutar</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <table style="font-size: 13px; border-collapse: collapse; margin-left: auto;">
        ${row('Ara toplam', formatPrice(Number(order.subtotal)))}
        ${discount > 0 ? row('İndirim', `-${formatPrice(discount)}${order.couponCode ? ` (${escapeHtml(order.couponCode)})` : ''}`) : ''}
        ${row('Kargo', Number(order.shippingCost) > 0 ? formatPrice(Number(order.shippingCost)) : 'ücretsiz')}
        ${row('<strong>Toplam</strong>', `<strong>${formatPrice(Number(order.total))}</strong>`)}
      </table>
      <p><a class="btn" href="${DASHBOARD_URL}/orders/${encodeURIComponent(order.orderNumber)}">siparişi panelde aç</a></p>`

    const { html } = renderEmailBase({
      title: subject,
      contentHtml,
      footerHtml: awaiting
        ? '<div>Bu e-posta, sitenize havale/EFT ile ödenecek yeni bir sipariş geldiğinde otomatik gönderilir.</div>'
        : cod
          ? '<div>Bu e-posta, sitenize kapıda ödemeli yeni bir sipariş geldiğinde otomatik gönderilir.</div>'
          : '<div>Bu e-posta, sitenize ödemesi tamamlanmış yeni bir sipariş geldiğinde otomatik gönderilir.</div>',
    })
    const result = await getEmailProvider().sendEmail({
      to,
      subject,
      html,
      replyTo: email !== '—' ? email : undefined,
      idempotencyKey: `${awaiting ? 'store-bank-transfer' : 'store-new-order'}:${order.orderNumber}`,
    })
    if (!result.success) console.error('[store-order-email] send failed:', order.orderNumber, result.error)
  } catch (err) {
    console.error('[store-order-email] alert failed:', err)
  }
}
