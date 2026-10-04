import Link from 'next/link'
import { COMPANY, SALES_TERMS } from '@/config/company'
import { formatPrice } from '@/lib/utils'
import styles from './PreInformationSummary.module.css'

interface Line {
  name: string
  variantLabel: string | null
  quantity: number
  price: number
}

/**
 * The pre-information form filled in with this order (Mesafeli Sözleşmeler
 * Yönetmeliği m.5): seller, items with prices, totals, delivery address and the
 * withdrawal right. Shown on the payment step, right above the consent box.
 */
export default function PreInformationSummary({
  lines,
  subtotal,
  discount,
  shipping,
  total,
  buyer,
}: {
  lines: Line[]
  subtotal: number
  discount: number
  shipping: number
  total: number
  buyer: { name: string; email: string; phone: string; address: string }
}) {
  const T = SALES_TERMS
  return (
    <details className={styles.box}>
      <summary>siparişinize özel ön bilgilendirme formunu görüntüle</summary>
      <div className={styles.body}>
        <h4>Satıcı</h4>
        <p>
          {COMPANY.tradeName} · {COMPANY.address} · {COMPANY.taxOffice}
          {COMPANY.showTaxId ? ` · VKN ${COMPANY.taxId}` : ''} · {COMPANY.phoneDisplay} · {COMPANY.email} · KEP {COMPANY.kep}
        </p>

        <h4>Alıcı ve teslimat</h4>
        <p>
          {buyer.name || '—'} · {buyer.email || '—'} · {buyer.phone || '—'}
          <br />
          {buyer.address || 'Teslimat adresi henüz girilmedi'}
        </p>

        <h4>Ürünler</h4>
        <table className={styles.table}>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>
                  {l.name}
                  {l.variantLabel ? ` (${l.variantLabel})` : ''} × {l.quantity}
                </td>
                <td className={styles.num}>{formatPrice(l.price * l.quantity)}</td>
              </tr>
            ))}
            <tr>
              <td>Ara toplam</td>
              <td className={styles.num}>{formatPrice(subtotal)}</td>
            </tr>
            {discount > 0 && (
              <tr>
                <td>İndirim</td>
                <td className={styles.num}>−{formatPrice(discount)}</td>
              </tr>
            )}
            <tr>
              <td>Kargo</td>
              <td className={styles.num}>{shipping > 0 ? formatPrice(shipping) : 'Ücretsiz'}</td>
            </tr>
            <tr className={styles.total}>
              <td>Toplam (KDV dahil)</td>
              <td className={styles.num}>{formatPrice(total)}</td>
            </tr>
          </tbody>
        </table>

        <h4>Ödeme, teslimat ve cayma</h4>
        <ul>
          <li>Ödeme: {T.paymentMethods.join(', ')}.</li>
          <li>
            Kargoya veriliş: stoktaki ürünler {T.stockDispatchDays}, sipariş üzerine üretilenler {T.madeToOrderDays}; en geç{' '}
            {T.maxDeliveryDays} gün içinde teslim.
          </li>
          <li>
            Teslimden itibaren {T.withdrawalDays} gün içinde gerekçesiz cayma hakkı; iade kargosu ücretsiz, para iadesi en geç{' '}
            {T.refundDays} gün içinde. Kişiye özel üretilen ürünlerde cayma hakkı yoktur (kusur ve siparişe aykırılık hariç).
          </li>
          <li>Ayıplı mallarda teslimden itibaren {T.warrantyYears} yıl boyunca yasal haklarınız geçerlidir.</li>
        </ul>
        <p className={styles.more}>
          Tam metinler: <Link href="/on-bilgilendirme-formu" target="_blank">ön bilgilendirme formu</Link> ·{' '}
          <Link href="/mesafeli-satis-sozlesmesi" target="_blank">mesafeli satış sözleşmesi</Link>
        </p>
      </div>
    </details>
  )
}
