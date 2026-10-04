'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCartStore } from '@/store/cartStore'
import { useAuthStore } from '@/store/authStore'
import { formatPrice } from '@/lib/utils'
import { BANK_ACCOUNT, formatIban } from '@/config/company'
import styles from '../basarili/Basarili.module.css'
import own from './Havale.module.css'

const PAID = new Set(['PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED'])

interface TransferOrder {
  totalAmount: number
  paymentExpiresAt: string | null
}

/**
 * Shown after a havale/EFT order is placed: the bank details to pay to, the amount
 * and the deadline (the same details are e-mailed). The order is read through the
 * payment status API, so only the customer's own browser or account sees it. An
 * order that is already paid, or paid by card, goes to the regular result pages.
 */
export default function HavaleClient() {
  const router = useRouter()
  const orderNumber = useSearchParams().get('order') || ''
  const { clearCart } = useCartStore()
  const { token } = useAuthStore()
  const [order, setOrder] = useState<TransferOrder | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!orderNumber) return
    const order = encodeURIComponent(orderNumber)
    let live = true
    // The order-access cookie of the checkout browser, or the signed-in owner
    fetch(`/api/payments/status?order=${order}`, {
      cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((res) => res.json())
      .then((data) => {
        if (!live) return
        if (!data.success) return setMissing(true)
        if (PAID.has(data.status) || data.paymentMethod !== 'BANK_TRANSFER') {
          router.replace(`/odeme/${data.status === 'PAYMENT_FAILED' ? 'basarisiz' : 'basarili'}?order=${order}`)
          return
        }
        // The order is placed; what was in the cart now waits for the transfer
        clearCart()
        setOrder({ totalAmount: data.totalAmount, paymentExpiresAt: data.paymentExpiresAt })
      })
      .catch(() => live && setMissing(true))
    return () => {
      live = false
    }
  }, [orderNumber, clearCart, router, token])

  if (!orderNumber || missing) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>sipariş bulunamadı.</h1>
        <p className={styles.subtitle}>
          havale bilgileri sipariş e-postanda da var. sorun yaşarsan bize iletişim sayfasından ulaşabilirsin.
        </p>
        <div className={styles.actionsRow}>
          <Link href="/iletisim" className={styles.secondaryBtn}>iletişim</Link>
        </div>
      </div>
    )
  }

  const deadline = order?.paymentExpiresAt
    ? new Date(order.paymentExpiresAt).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className={styles.container}>
      <div className={styles.statusIconWrap} aria-hidden="true">₺</div>
      <h1 className={styles.title}>siparişin alındı.</h1>
      <p className={styles.subtitle}>
        tutarı aşağıdaki hesaba havale veya EFT ile gönder. ödemen onaylandığında siparişin hazırlanıp kargoya
        teslim edilecek; onayı e-postayla bildireceğiz.
      </p>

      <div className={styles.receiptCard}>
        <div className={styles.receiptRow}>
          <span className={styles.receiptLabel}>sipariş numarası</span>
          <span className={styles.receiptOrderNumber}>#{orderNumber}</span>
        </div>
        <div className={styles.receiptRow}>
          <span className={styles.receiptLabel}>banka</span>
          <span className={own.value}>{BANK_ACCOUNT.bank}</span>
        </div>
        <div className={styles.receiptRow}>
          <span className={styles.receiptLabel}>alıcı</span>
          <span className={own.value}>{BANK_ACCOUNT.holder}</span>
        </div>
        <div className={own.ibanRow}>
          <span className={styles.receiptLabel}>iban</span>
          <span className={own.iban}>{formatIban(BANK_ACCOUNT.iban)}</span>
          <CopyButton text={BANK_ACCOUNT.iban} label="IBAN'ı kopyala" />
        </div>
        {order && (
          <div className={styles.receiptTotalRow}>
            <span className={styles.receiptTotalLabel}>gönderilecek tutar</span>
            <span className={styles.receiptTotalVal}>{formatPrice(order.totalAmount)}</span>
          </div>
        )}
      </div>

      {deadline && (
        <p className={own.note}>
          ürünlerin <strong>{deadline}</strong> tarihine kadar senin için ayrıldı. bu süre içinde ulaşmayan ödemelerde
          sipariş iptal olur.
        </p>
      )}

      <div className={styles.actionsRow}>
        {token && (
          <Link href={`/hesap/siparisler/${orderNumber}`} className={styles.primaryBtn}>
            siparişi görüntüle
          </Link>
        )}
        <Link href="/urunler" className={styles.secondaryBtn}>
          alışverişe devam et
        </Link>
      </div>
    </div>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard blocked; the IBAN stays selectable
    }
  }
  return (
    <button type="button" className={own.copy} onClick={copy} aria-label={label}>
      <span aria-live="polite">{copied ? 'kopyalandı' : 'kopyala'}</span>
    </button>
  )
}
