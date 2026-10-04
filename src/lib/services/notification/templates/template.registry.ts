import { renderEmailBase } from './email-base.template'
import type { NotificationEventType } from '../notification.interface'
import { BANK_ACCOUNT, formatIban } from '@/config/company'

export interface OrderTemplateData {
  orderNumber: string
  customerName: string
  totalAmount: number
  items?: Array<{
    productName: string
    quantity: number
    unitPrice: number
    totalAmount: number
  }>
  shippingAddress?: {
    fullName: string
    addressLine: string
    city: string
    district: string
  }
  carrier?: string
  trackingNumber?: string
  trackingUrl?: string
  cancellationReason?: string
  failureReason?: string
  deliveryDate?: string
  returnNumber?: string
  returnReason?: string
  refundAmount?: number
  replacementSku?: string
  /** Bank transfer orders: when the unpaid order lapses, already formatted for display */
  paymentDeadline?: string
}

export function generateEmailTemplate(
  eventType: NotificationEventType,
  data: OrderTemplateData
): { subject: string; html: string; text: string } {
  switch (eventType) {
    case 'ORDER_CONFIRMED':
    case 'ORDER_CREATED':
      return renderOrderConfirmed(data)
    case 'PAYMENT_SUCCEEDED':
      return renderPaymentSucceeded(data)
    case 'PAYMENT_FAILED':
      return renderPaymentFailed(data)
    case 'BANK_TRANSFER_AWAITING':
      return renderBankTransferAwaiting(data)
    case 'ORDER_PREPARING':
      return renderOrderPreparing(data)
    case 'SHIPMENT_CREATED':
    case 'ORDER_SHIPPED':
      return renderOrderShipped(data)
    case 'OUT_FOR_DELIVERY':
      return renderOutForDelivery(data)
    case 'ORDER_DELIVERED':
      return renderOrderDelivered(data)
    case 'ORDER_CANCELLED':
      return renderOrderCancelled(data)
    case 'RETURN_REQUESTED':
      return renderReturnRequested(data)
    case 'RETURN_APPROVED':
      return renderReturnApproved(data)
    case 'RETURN_REJECTED':
      return renderReturnRejected(data)
    case 'RETURN_SHIPMENT_CREATED':
      return renderReturnShipmentCreated(data)
    case 'RETURN_RECEIVED':
      return renderReturnReceived(data)
    case 'REFUND_ISSUED':
    case 'REFUND_PENDING':
      return renderRefundIssued(data)
    case 'EXCHANGE_APPROVED':
    case 'EXCHANGE_COMPLETED':
      return renderExchangeCompleted(data)
    case 'DELIVERY_FAILED':
    default:
      return renderDeliveryFailed(data)
  }
}

function renderOrderConfirmed(data: OrderTemplateData) {
  const subject = `Siparişiniz Alındı — #${data.orderNumber}`

  const itemsRows = (data.items || [])
    .map(
      (item) => `
      <tr>
        <td style="font-weight: 500;">${item.productName}</td>
        <td style="text-align: center; color: rgba(255,255,255,0.6);">${item.quantity} adet</td>
        <td style="text-align: right; font-weight: 600;">₺${item.totalAmount.toFixed(2)}</td>
      </tr>`
    )
    .join('')

  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 16px 0; letter-spacing: -0.02em;">
      Siparişiniz başarıyla oluşturuldu
    </h1>
    <p style="margin: 0 0 20px 0;">
      Merhaba <strong>${data.customerName}</strong>, 
      <br/>
      <strong>#${data.orderNumber}</strong> numaralı siparişiniz onaylandı ve üretim hazırlığına alındı.
    </p>

    <div style="background-color: #0d0f12; border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 16px; margin: 20px 0;">
      <div style="font-size: 11px; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 8px;">Sipariş Özeti</div>
      <table class="item-table">
        <thead>
          <tr>
            <th>Ürün</th>
            <th style="text-align: center;">Adet</th>
            <th style="text-align: right;">Tutar</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>
      <div style="display: flex; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px; font-weight: 700; font-size: 15px; color: #ffffff;">
        <span>Toplam:</span>
        <span>₺${data.totalAmount.toFixed(2)}</span>
      </div>
    </div>

    ${
      data.shippingAddress
        ? `
    <div style="margin: 20px 0; font-size: 13px; color: rgba(255,255,255,0.7);">
      <div style="font-weight: 600; color: #ffffff; margin-bottom: 4px;">Teslimat Adresi:</div>
      <div>${data.shippingAddress.fullName}</div>
      <div>${data.shippingAddress.addressLine}</div>
      <div>${data.shippingAddress.district} / ${data.shippingAddress.city}</div>
    </div>`
        : ''
    }

    <a href="https://zuulab.com/hesap/siparisler/${data.orderNumber}" class="btn">
      Sipariş Detayını Görüntüle →
    </a>
  `

  const text = `Merhaba ${data.customerName},\n\n#${data.orderNumber} numaralı siparişiniz onaylandı.\nToplam Tutar: ₺${data.totalAmount.toFixed(2)}\n\nSipariş takibi için: https://zuulab.com/hesap/siparisler/${data.orderNumber}`

  return {
    subject,
    html: renderEmailBase({ title: subject, contentHtml }).html,
    text,
  }
}

function renderPaymentSucceeded(data: OrderTemplateData) {
  const subject = `Ödemeniz Alındı — #${data.orderNumber}`
  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 16px 0;">
      Ödemeniz başarıyla tahsil edildi
    </h1>
    <p>
      Merhaba <strong>${data.customerName}</strong>,
      <br/>
      <strong>#${data.orderNumber}</strong> numaralı siparişinizin <strong>₺${data.totalAmount.toFixed(2)}</strong> tutarındaki ödemesi başarıyla onaylanmıştır.
    </p>
    <p style="color: rgba(255,255,255,0.7);">
      Siparişiniz atölyemizde hazırlanıp kargoya teslim edilecek; kargoya verildiğinde takip bilgisini e-postayla göndereceğiz.
    </p>
    <a href="https://zuulab.com/hesap/siparisler/${data.orderNumber}" class="btn">
      Siparişimi İncele →
    </a>
  `
  const text = `Merhaba ${data.customerName},\n#${data.orderNumber} numaralı siparişinizin ₺${data.totalAmount.toFixed(2)} tutarındaki ödemesi onaylandı.\nSiparişiniz hazırlanıp kargoya teslim edilecek; kargoya verildiğinde takip bilgisini e-postayla göndereceğiz.`
  return { subject, html: renderEmailBase({ title: subject, contentHtml }).html, text }
}

function renderBankTransferAwaiting(data: OrderTemplateData) {
  const subject = `Havale / EFT Bilgileri — #${data.orderNumber}`
  const amount = `₺${data.totalAmount.toFixed(2)}`
  const iban = formatIban(BANK_ACCOUNT.iban)
  const row = (label: string, value: string) => `
      <tr>
        <td style="color: rgba(255,255,255,0.5); padding: 6px 0; width: 120px;">${label}</td>
        <td style="font-weight: 600; color: #ffffff; padding: 6px 0;">${value}</td>
      </tr>`
  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 16px 0;">
      Siparişiniz alındı, ödemenizi bekliyoruz
    </h1>
    <p>
      Merhaba <strong>${data.customerName}</strong>,
      <br/>
      <strong>#${data.orderNumber}</strong> numaralı siparişinizin tutarını aşağıdaki hesaba havale veya EFT ile gönderebilirsiniz.
    </p>
    <div style="background-color: #0d0f12; border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 16px; margin: 20px 0;">
      <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
        ${row('Banka', BANK_ACCOUNT.bank)}
        ${row('Alıcı', BANK_ACCOUNT.holder)}
        ${row('IBAN', iban)}
        ${row('Tutar', amount)}
      </table>
    </div>
    <p style="color: rgba(255,255,255,0.7); font-size: 13px;">
      Ürünleriniz ${data.paymentDeadline ? `<strong>${data.paymentDeadline}</strong> tarihine kadar` : '48 saat boyunca'} sizin için ayrıldı. Ödemeniz hesabımıza ulaşıp onaylandığında siparişiniz hazırlanıp kargoya teslim edilecek; onayı e-postayla bildireceğiz.
    </p>
    <a href="https://zuulab.com/hesap/siparisler/${data.orderNumber}" class="btn">
      Siparişimi İncele →
    </a>
  `
  const text = [
    `Merhaba ${data.customerName},`,
    `#${data.orderNumber} numaralı siparişinizin tutarını havale veya EFT ile gönderebilirsiniz.`,
    '',
    `Banka: ${BANK_ACCOUNT.bank}`,
    `Alıcı: ${BANK_ACCOUNT.holder}`,
    `IBAN: ${iban}`,
    `Tutar: ${amount}`,
    '',
    `Ürünleriniz ${data.paymentDeadline ? `${data.paymentDeadline} tarihine kadar` : '48 saat boyunca'} sizin için ayrıldı. Ödemeniz onaylandığında siparişiniz hazırlanıp kargoya teslim edilecek.`,
  ].join('\n')
  return { subject, html: renderEmailBase({ title: subject, contentHtml }).html, text }
}

function renderPaymentFailed(data: OrderTemplateData) {
  const subject = `Ödeme Başarısız Oldu — #${data.orderNumber}`
  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #f87171; margin: 0 0 16px 0;">
      Ödeme işlemi tamamlanamadı
    </h1>
    <p>
      Merhaba <strong>${data.customerName}</strong>,
      <br/>
      <strong>#${data.orderNumber}</strong> numaralı siparişinizin ödeme denemesi kart sağlayıcınız tarafından onaylanmadı.
    </p>
    <p style="color: rgba(255,255,255,0.6); font-size: 13px;">
      Siparişinizdeki ürünler kısa bir süre için adınıza ayrılmış durumda beklemektedir. Farklı bir kart veya ödeme yöntemi ile tekrar deneyebilirsiniz.
    </p>
    <a href="https://zuulab.com/odeme?order=${data.orderNumber}" class="btn" style="background-color: #38bdf8;">
      Ödemeyi Tekrar Dene →
    </a>
  `
  const text = `Merhaba ${data.customerName},\n#${data.orderNumber} siparişinizin ödemesi onaylanmadı. Tekrar denemek için: https://zuulab.com/odeme?order=${data.orderNumber}`
  return { subject, html: renderEmailBase({ title: subject, contentHtml }).html, text }
}

function renderOrderPreparing(data: OrderTemplateData) {
  const subject = `Siparişiniz Hazırlanıyor — #${data.orderNumber}`
  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 16px 0;">
      Siparişiniz atölyemizde hazırlanıyor
    </h1>
    <p>
      Merhaba <strong>${data.customerName}</strong>,
      <br/>
      <strong>#${data.orderNumber}</strong> numaralı siparişiniz üretim ve paketleme aşamasına geçti.
      Özenle kontrol edildikten sonra kargo firmasına teslim edilecektir.
    </p>
    <a href="https://zuulab.com/hesap/siparisler/${data.orderNumber}" class="btn">
      Durumu Takip Et →
    </a>
  `
  const text = `Merhaba ${data.customerName},\n#${data.orderNumber} numaralı siparişiniz hazırlanıyor.`
  return { subject, html: renderEmailBase({ title: subject, contentHtml }).html, text }
}

function renderOrderShipped(data: OrderTemplateData) {
  const subject = `Siparişiniz Kargoya Verildi — #${data.orderNumber}`
  const trackingLink = data.trackingUrl || `https://zuulab.com/hesap/siparisler/${data.orderNumber}`

  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 16px 0;">
      Siparişiniz kargoya teslim edildi
    </h1>
    <p>
      Merhaba <strong>${data.customerName}</strong>,
      <br/>
      <strong>#${data.orderNumber}</strong> numaralı paketiniz kargo taşıyıcısına teslim edildi ve yola çıktı.
    </p>

    <div style="background-color: #0d0f12; border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 18px; margin: 24px 0;">
      <div style="font-size: 11px; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 6px;">Kargo Bilgileri</div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="color: rgba(255,255,255,0.6);">Kargo Firması:</span>
        <span style="font-weight: 600; color: #ffffff;">${data.carrier || 'Yurtiçi Kargo'}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: rgba(255,255,255,0.6);">Takip Numarası:</span>
        <span style="font-family: monospace; font-weight: 600; color: #38bdf8;">${data.trackingNumber || 'Sorgulanıyor'}</span>
      </div>
    </div>

    <a href="${trackingLink}" class="btn">
      Kargoyu Canlı Takip Et →
    </a>
  `
  const text = `Merhaba ${data.customerName},\n#${data.orderNumber} kargoya verildi.\nKargo Firması: ${data.carrier || 'Yurtiçi Kargo'}\nTakip No: ${data.trackingNumber}\nTakip Linki: ${trackingLink}`
  return { subject, html: renderEmailBase({ title: subject, contentHtml }).html, text }
}

function renderOutForDelivery(data: OrderTemplateData) {
  const subject = `Kargonuz Dağıtıma Çıktı — #${data.orderNumber}`
  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #38bdf8; margin: 0 0 16px 0;">
      Paketiniz bugün dağıtımda
    </h1>
    <p>
      Merhaba <strong>${data.customerName}</strong>,
      <br/>
      <strong>#${data.orderNumber}</strong> numaralı siparişiniz kurye tarafından teslimat adresinize ulaştırılmak üzere dağıtıma çıkarılmıştır.
    </p>
    <a href="https://zuulab.com/hesap/siparisler/${data.orderNumber}" class="btn">
      Teslimat Durumunu Gör →
    </a>
  `
  const text = `Merhaba ${data.customerName},\n#${data.orderNumber} numaralı kargonuz bugün dağıtıma çıktı.`
  return { subject, html: renderEmailBase({ title: subject, contentHtml }).html, text }
}

function renderOrderDelivered(data: OrderTemplateData) {
  const subject = `Siparişiniz Teslim Edildi — #${data.orderNumber}`
  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #34d399; margin: 0 0 16px 0;">
      Paketiniz teslim edildi
    </h1>
    <p>
      Merhaba <strong>${data.customerName}</strong>,
      <br/>
      <strong>#${data.orderNumber}</strong> numaralı siparişiniz başarıyla teslim edilmiştir.
      Ürünlerimizi güzel günlerde kullanmanızı dileriz.
    </p>
    <p style="color: rgba(255,255,255,0.6); font-size: 13px; margin-top: 16px;">
      Siparişiniz veya ürünlerinizle ilgili her türlü geri bildirim ve destek için hesabınız üzerinden bize ulaşabilirsiniz.
    </p>
    <a href="https://zuulab.com/hesap/siparisler/${data.orderNumber}" class="btn">
      Siparişi Değerlendir / İncele →
    </a>
  `
  const text = `Merhaba ${data.customerName},\n#${data.orderNumber} numaralı siparişiniz teslim edildi. Teşekkür ederiz!`
  return { subject, html: renderEmailBase({ title: subject, contentHtml }).html, text }
}

function renderOrderCancelled(data: OrderTemplateData) {
  const subject = `Sipariş İptal Edildi — #${data.orderNumber}`
  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #f87171; margin: 0 0 16px 0;">
      Siparişiniz iptal edildi
    </h1>
    <p>
      Merhaba <strong>${data.customerName}</strong>,
      <br/>
      <strong>#${data.orderNumber}</strong> numaralı siparişiniz iptal edilmiştir.
    </p>
    ${
      data.cancellationReason
        ? `<div style="padding: 12px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 4px; color: #f87171; font-size: 12px; margin: 16px 0;">${data.cancellationReason}</div>`
        : ''
    }
    <p style="color: rgba(255,255,255,0.6); font-size: 13px;">
      Ödemeniz yapılmışsa ilgili tutar bankanızın iade prosedürüne uygun olarak hesabınıza yansıtılacaktır.
    </p>
    <a href="https://zuulab.com/hesap/siparisler/${data.orderNumber}" class="btn">
      Sipariş Detayı →
    </a>
  `
  const text = `Merhaba ${data.customerName},\n#${data.orderNumber} numaralı siparişiniz iptal edildi.`
  return { subject, html: renderEmailBase({ title: subject, contentHtml }).html, text }
}

function renderDeliveryFailed(data: OrderTemplateData) {
  const subject = `Teslimat Tamamlanamadı — #${data.orderNumber}`
  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #fbbf24; margin: 0 0 16px 0;">
      Teslimat adreste tamamlanamadı
    </h1>
    <p>
      Merhaba <strong>${data.customerName}</strong>,
      <br/>
      <strong>#${data.orderNumber}</strong> numaralı siparişiniz teslim edilmeye çalışılmış ancak adreste bulunulamamıştır.
      Paketiniz en yakın kargo şubesinde bekletilmektedir.
    </p>
    <a href="https://zuulab.com/hesap/siparisler/${data.orderNumber}" class="btn">
      Kargo Detaylarını İncele →
    </a>
  `
  const text = `Merhaba ${data.customerName},\n#${data.orderNumber} teslimatı adreste tamamlanamadı. Şubeden teslim alabilirsiniz.`
  return { subject, html: renderEmailBase({ title: subject, contentHtml }).html, text }
}

function renderReturnRequested(data: OrderTemplateData) {
  const rma = data.returnNumber || `RMA-${data.orderNumber}`
  const subject = `İade / Değişim Talebiniz Alındı — ${rma}`
  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #fff; margin: 0 0 16px 0;">
      İade talebiniz başarıyla oluşturuldu
    </h1>
    <p>
      Merhaba <strong>${data.customerName}</strong>,
      <br/>
      <strong>#${data.orderNumber}</strong> numaralı siparişiniz için <strong>${rma}</strong> kodlu iade/değişim talebiniz tarafımıza ulaşmıştır.
    </p>
    <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 16px; margin: 20px 0;">
      <div style="font-size: 13px; color: rgba(255,255,255,0.6); margin-bottom: 4px;">Talep Kodu</div>
      <div style="font-size: 15px; font-weight: 600; color: #fff; font-family: monospace;">${rma}</div>
      ${data.returnReason ? `<div style="font-size: 13px; color: rgba(255,255,255,0.5); margin-top: 8px;">Neden: ${data.returnReason}</div>` : ''}
    </div>
    <p style="color: rgba(255,255,255,0.6); font-size: 13px;">
      Talebiniz operasyon ekibimiz tarafından incelenmektedir. Onaylandığında kargo gönderi kodu e-posta ile paylaşılacaktır.
    </p>
    <a href="https://zuulab.com/hesap/siparisler/${data.orderNumber}" class="btn">
      Talebi İncele →
    </a>
  `
  const text = `Merhaba ${data.customerName},\n#${data.orderNumber} için ${rma} kodlu iade talebiniz inceleniyor.`
  return { subject, html: renderEmailBase({ title: subject, contentHtml }).html, text }
}

function renderReturnApproved(data: OrderTemplateData) {
  const rma = data.returnNumber || `RMA-${data.orderNumber}`
  const subject = `İade Talebiniz Onaylandı — ${rma}`
  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #4ade80; margin: 0 0 16px 0;">
      İade talebiniz onaylandı
    </h1>
    <p>
      Merhaba <strong>${data.customerName}</strong>,
      <br/>
      <strong>${rma}</strong> numaralı iade talebiniz onaylanmıştır. Ürünü orijinal ambalajında güvenli bir şekilde paketleyerek tarafımıza gönderebilirsiniz.
    </p>
    ${
      data.trackingNumber
        ? `
      <div style="background: rgba(74, 222, 128, 0.05); border: 1px solid rgba(74, 222, 128, 0.2); border-radius: 8px; padding: 16px; margin: 20px 0;">
        <div style="font-size: 12px; color: rgba(255,255,255,0.6);">İade Kargo Taşıyıcısı: <strong>${data.carrier || 'Kargo'}</strong></div>
        <div style="font-size: 14px; font-weight: 600; color: #4ade80; font-family: monospace; margin-top: 4px;">Kargo İade Kodu: ${data.trackingNumber}</div>
        <div style="font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 6px;">Kargo şubesine gittiğinizde bu kodu ileterek ücretsiz gönderim yapabilirsiniz.</div>
      </div>
    `
        : ''
    }
    <a href="https://zuulab.com/hesap/siparisler/${data.orderNumber}" class="btn">
      İade Detayı →
    </a>
  `
  const text = `Merhaba ${data.customerName},\n${rma} numaralı iade talebiniz onaylandı.`
  return { subject, html: renderEmailBase({ title: subject, contentHtml }).html, text }
}

function renderReturnRejected(data: OrderTemplateData) {
  const rma = data.returnNumber || `RMA-${data.orderNumber}`
  const subject = `İade Talebiniz Hakkında — ${rma}`
  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #f87171; margin: 0 0 16px 0;">
      İade talebiniz onaylanamadı
    </h1>
    <p>
      Merhaba <strong>${data.customerName}</strong>,
      <br/>
      <strong>${rma}</strong> kodlu iade/değişim talebiniz incelenmiş ve maalesef iade şartlarını karşılamadığı için onaylanamamıştır.
    </p>
    ${data.cancellationReason ? `<p style="color: #f87171; font-size: 13px;">Gerekçe: ${data.cancellationReason}</p>` : ''}
    <a href="https://zuulab.com/hesap/siparisler/${data.orderNumber}" class="btn">
      Sipariş Detayı →
    </a>
  `
  const text = `Merhaba ${data.customerName},\n${rma} kodlu iade talebiniz onaylanamadı.`
  return { subject, html: renderEmailBase({ title: subject, contentHtml }).html, text }
}

function renderReturnShipmentCreated(data: OrderTemplateData) {
  const rma = data.returnNumber || `RMA-${data.orderNumber}`
  const subject = `İade Kargo Kodunuz Hazır — ${rma}`
  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #38bdf8; margin: 0 0 16px 0;">
      İade kargo barkodunuz oluşturuldu
    </h1>
    <p>
      Merhaba <strong>${data.customerName}</strong>,
      <br/>
      <strong>${rma}</strong> kodlu iadeniz için <strong>${data.carrier || 'Kargo'}</strong> iade gönderi kodu üretilmiştir.
    </p>
    <div style="background: rgba(56, 189, 248, 0.05); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 8px; padding: 16px; margin: 20px 0;">
      <div style="font-size: 12px; color: rgba(255,255,255,0.6);">Taşıyıcı: ${data.carrier || 'Kargo'}</div>
      <div style="font-size: 16px; font-weight: 700; color: #38bdf8; font-family: monospace; margin: 6px 0;">Takip Kodu: ${data.trackingNumber}</div>
      <div style="font-size: 12px; color: rgba(255,255,255,0.5);">Paketinizi en yakın kargo şubesine teslim edebilirsiniz.</div>
    </div>
    <a href="${data.trackingUrl || `https://zuulab.com/hesap/siparisler/${data.orderNumber}`}" class="btn">
      Kargoyu Takip Et →
    </a>
  `
  const text = `Merhaba ${data.customerName},\n${rma} için kargo takip kodunuz: ${data.trackingNumber}`
  return { subject, html: renderEmailBase({ title: subject, contentHtml }).html, text }
}

function renderReturnReceived(data: OrderTemplateData) {
  const rma = data.returnNumber || `RMA-${data.orderNumber}`
  const subject = `İade Ürününüz Tarafımıza Ulaştı — ${rma}`
  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #fff; margin: 0 0 16px 0;">
      İade paketiniz depomuza ulaştı
    </h1>
    <p>
      Merhaba <strong>${data.customerName}</strong>,
      <br/>
      <strong>${rma}</strong> kodlu iade paketiniz ZUULAB Lojistik Merkezine teslim alınmıştır.
      Kalite kontrol ve inceleme ekibimiz ürününüzü inceledikten sonra işlem (iade/değişim) tamamlanacaktır.
    </p>
    <a href="https://zuulab.com/hesap/siparisler/${data.orderNumber}" class="btn">
      İade Durumu →
    </a>
  `
  const text = `Merhaba ${data.customerName},\n${rma} kodlu iade paketiniz depomuza teslim alınmıştır.`
  return { subject, html: renderEmailBase({ title: subject, contentHtml }).html, text }
}

function renderRefundIssued(data: OrderTemplateData) {
  const rma = data.returnNumber || `RMA-${data.orderNumber}`
  const subject = `Para İadeniz Gerçekleştirildi — ${rma}`
  const refundFormatted = data.refundAmount
    ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(data.refundAmount)
    : 'İade Tutarı'

  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #4ade80; margin: 0 0 16px 0;">
      İade ödemeniz bankanıza aktarıldı
    </h1>
    <p>
      Merhaba <strong>${data.customerName}</strong>,
      <br/>
      <strong>${rma}</strong> kodlu iadenizin incelemesi tamamlanmış ve <strong>${refundFormatted}</strong> tutarındaki ödemeniz ödeme yaptığınız karta/hesaba iade edilmiştir.
    </p>
    <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 16px; margin: 20px 0;">
      <div style="font-size: 12px; color: rgba(255,255,255,0.6);">İade Edilen Tutar</div>
      <div style="font-size: 18px; font-weight: 700; color: #fff;">${refundFormatted}</div>
    </div>
    <p style="color: rgba(255,255,255,0.5); font-size: 12px;">
      Tutarın hesabınıza yansıma süresi bankanıza bağlı olarak 1-7 iş günü arasında değişiklik gösterebilir.
    </p>
    <a href="https://zuulab.com/hesap/siparisler/${data.orderNumber}" class="btn">
      Sipariş Detayı →
    </a>
  `
  const text = `Merhaba ${data.customerName},\n${rma} kodlu iadeniz için ${refundFormatted} tutarındaki iade bankanıza aktarıldı.`
  return { subject, html: renderEmailBase({ title: subject, contentHtml }).html, text }
}

function renderExchangeCompleted(data: OrderTemplateData) {
  const rma = data.returnNumber || `RMA-${data.orderNumber}`
  const subject = `Değişim İşleminiz Tamamlandı — ${rma}`
  const contentHtml = `
    <h1 style="font-size: 20px; font-weight: 700; color: #4ade80; margin: 0 0 16px 0;">
      Değişim ürününüz hazırlanıyor
    </h1>
    <p>
      Merhaba <strong>${data.customerName}</strong>,
      <br/>
      <strong>${rma}</strong> kodlu değişim talebiniz onaylanmış ve değişim ürününüz hazırlanmak üzere sıraya alınmıştır.
    </p>
    <a href="https://zuulab.com/hesap/siparisler/${data.orderNumber}" class="btn">
      Detayları Gör →
    </a>
  `
  const text = `Merhaba ${data.customerName},\n${rma} kodlu değişim talebiniz tamamlandı ve yeni ürününüz hazırlanıyor.`
  return { subject, html: renderEmailBase({ title: subject, contentHtml }).html, text }
}
