'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import { formatPrice } from '@/lib/utils'
import { COD_STAGES } from '@/lib/constants/cod-stages'
import { getOrderStatusConfig, getPaymentStatusConfig } from '@/lib/constants/admin-status'
import styles from '../../admin.module.css'
import { SkeletonPage } from '@/components/common/Skeleton'

interface Parcel {
  length: number
  width: number
  height: number
  weight: number
}

interface Detail {
  order: any
  stage: string
  shipment: any | null
  offerPrice: number | null
  parcel: Parcel
  parcelTemplates: Array<Parcel & { id: string; name: string }>
  testMode: boolean
  configured: boolean
  balance: { balance: { balance: number; debt: number } | null; error?: string; topUpUrl: string }
}

const STEPS = [
  { id: 1, label: 'Geliver’e ekle' },
  { id: 2, label: 'Kargoyu hazırla' },
  { id: 3, label: 'PTT etiketi oluştur' },
  { id: 4, label: 'Kargo takibi' },
]

function stepOf(stage: string): number {
  if (stage === 'NEW') return 1
  if (stage === 'ADDED') return 2
  if (stage === 'READY') return 3
  return 4
}

function desi(p: Parcel): number {
  return Math.max(1, Math.ceil((p.length * p.width * p.height) / 3000))
}

export default function AdminCodDetailPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>()
  const { token, canFetch } = useAuthStore()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const [showPrepare, setShowPrepare] = useState(false)
  const [address, setAddress] = useState({ fullName: '', phone: '', addressLine: '', city: '', district: '', postalCode: '' })
  const [parcel, setParcel] = useState({ length: '25', width: '20', height: '15', weight: '1' })
  const [showBuy, setShowBuy] = useState(false)

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const load = useCallback(() => {
    if (!canFetch || !orderNumber) return
    fetch(`/api/admin/cod/${orderNumber}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setDetail(d)
          setError(null)
        } else setError(d.error || 'Sipariş bilgisi alınamadı.')
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canFetch, orderNumber])

  useEffect(load, [load])

  // Once the label exists, the carrier status is pulled in when the page opens
  useEffect(() => {
    if (!detail || !['LABEL', 'SHIPPED'].includes(detail.stage)) return
    fetch(`/api/admin/orders/${orderNumber}/shipping`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => d.success && d.shipment && load())
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.stage])

  const act = async (action: 'add' | 'remove', okMessage?: string) => {
    setBusy(action)
    setLastError(null)
    try {
      const res = await fetch(`/api/admin/cod/${orderNumber}`, { method: 'POST', headers, body: JSON.stringify({ action }) })
      const data = await res.json()
      if (data.success) {
        toast.success(okMessage || data.message)
        setShowBuy(false)
        load()
      } else {
        setLastError(data.error || 'İşlem yapılamadı.')
        setShowBuy(false)
      }
    } catch {
      setLastError('Bağlantı hatası oluştu.')
    } finally {
      setBusy(null)
    }
  }

  const openPrepare = () => {
    if (!detail) return
    const a = detail.order.shippingAddressSnapshot
    setAddress({
      fullName: a.fullName || '',
      phone: a.phone || '',
      addressLine: a.addressLine || '',
      city: a.city || '',
      district: a.district || '',
      postalCode: a.postalCode || '',
    })
    setParcel({
      length: String(detail.parcel.length),
      width: String(detail.parcel.width),
      height: String(detail.parcel.height),
      weight: String(detail.parcel.weight),
    })
    setLastError(null)
    setShowPrepare(true)
  }

  const savePrepare = async () => {
    setBusy('prepare')
    try {
      const res = await fetch(`/api/admin/cod/${orderNumber}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'prepare',
          address,
          parcel: {
            length: Number(parcel.length.replace(',', '.')),
            width: Number(parcel.width.replace(',', '.')),
            height: Number(parcel.height.replace(',', '.')),
            weight: Number(parcel.weight.replace(',', '.')),
          },
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Kargo bilgileri eklendi.')
        setShowPrepare(false)
        load()
      } else {
        toast.error(data.error || 'Kargo bilgileri kaydedilemedi.')
      }
    } catch {
      toast.error('Bağlantı hatası oluştu.')
    } finally {
      setBusy(null)
    }
  }

  // The PDF is opened in a new tab to print; the window is opened before the await so it is not blocked
  const openLabel = async () => {
    const win = window.open('', '_blank')
    setBusy('label')
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/shipping/label`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok || !res.headers.get('content-type')?.includes('pdf')) {
        const data = await res.json().catch(() => ({}))
        win?.close()
        toast.error(data.error || 'Kargo etiketi alınamadı.')
        return
      }
      const url = URL.createObjectURL(await res.blob())
      if (win) win.location.href = url
      else window.location.href = url
    } catch {
      win?.close()
      toast.error('Etiket indirilirken bağlantı hatası oluştu.')
    } finally {
      setBusy(null)
    }
  }

  // Buys the label, then opens the PDF at once; the window is opened first so the popup is not blocked
  const buyAndOpenLabel = async () => {
    const win = window.open('', '_blank')
    setBusy('buy')
    setLastError(null)
    try {
      const res = await fetch(`/api/admin/cod/${orderNumber}`, { method: 'POST', headers, body: JSON.stringify({ action: 'buy' }) })
      const data = await res.json()
      setShowBuy(false)
      if (!data.success) {
        win?.close()
        setLastError(data.error || 'Etiket oluşturulamadı.')
        return
      }
      toast.success(data.message)
      load()
      const labelRes = await fetch(`/api/admin/orders/${orderNumber}/shipping/label`, { headers: { Authorization: `Bearer ${token}` } })
      if (labelRes.ok && labelRes.headers.get('content-type')?.includes('pdf')) {
        const url = URL.createObjectURL(await labelRes.blob())
        if (win) win.location.href = url
        else window.location.href = url
      } else {
        win?.close()
        toast.error('Etiket satın alındı ama PDF henüz hazır değil; “Etiketi indir” ile tekrar deneyin.')
      }
    } catch {
      win?.close()
      setShowBuy(false)
      setLastError('Bağlantı hatası oluştu. Sayfayı yenileyip durumu kontrol edin: etiket satın alınmış olabilir.')
    } finally {
      setBusy(null)
    }
  }

  const syncStatus = async () => {
    setBusy('sync')
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/shipping/sync`, { method: 'POST', headers })
      const data = await res.json()
      if (data.success) {
        toast.success('Kargo durumu Geliver ile eşitlendi.')
        load()
      } else toast.error(data.error || 'Kargo durumu alınamadı.')
    } catch {
      toast.error('Bağlantı hatası oluştu.')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <SkeletonPage />
  if (!detail) {
    return (
      <div className={styles.formCard} style={{ textAlign: 'center', padding: 40 }}>
        <h2 style={{ fontSize: 16, color: '#dc2626', margin: '0 0 10px' }}>Sipariş açılamadı</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>{error}</p>
        <Link href="/admin/cod" className={`${styles.btn} ${styles.btnSecondary}`}>← Kapıda ödeme listesi</Link>
      </div>
    )
  }

  const { order, stage, shipment } = detail
  const step = stepOf(stage)
  const stageCfg = COD_STAGES[stage] ?? COD_STAGES.NEW
  const orderCfg = getOrderStatusConfig(order.status)
  const payCfg = getPaymentStatusConfig(order.paymentStatus)
  const addr = order.shippingAddressSnapshot
  const bal = detail.balance.balance
  const price = detail.offerPrice
  const enoughBalance = !bal || price == null || bal.balance >= price
  const cancelled = stage === 'CANCELLED'
  const editable = ['NEW', 'ADDED', 'READY'].includes(stage)
  const pNum = { length: Number(parcel.length.replace(',', '.')), width: Number(parcel.width.replace(',', '.')), height: Number(parcel.height.replace(',', '.')), weight: Number(parcel.weight.replace(',', '.')) }

  return (
    <div className={styles.pageContainer} style={{ maxWidth: 1160 }}>
      <div className={styles.pageHeader}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
            <Link href="/admin/cod" style={{ color: 'inherit', textDecoration: 'none' }}>← Kapıda ödeme listesi</Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h1 className={styles.pageTitle} style={{ fontFamily: 'monospace' }}>#{order.orderNumber}</h1>
            <span className={`${styles.badge} ${styles[stageCfg.badge]}`}>{stageCfg.label}</span>
            {detail.testMode && <span className={`${styles.badge} ${styles.badgeWarning}`}>Geliver test modu</span>}
          </div>
          <p className={styles.pageSubtitle}>
            Oluşturulma: {new Date(order.createdAt).toLocaleString('tr-TR')} · Kapıda tahsil edilecek: <strong>{formatPrice(order.totalAmount)}</strong>
          </p>
        </div>
        <Link href={`/admin/orders/${order.orderNumber}`} className={`${styles.btn} ${styles.btnSecondary}`}>
          Siparişler sayfasındaki detay ↗
        </Link>
      </div>

      <div className={styles.detailGrid}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Steps */}
          <div className={styles.formCard}>
            <h2 className={styles.formCardTitle}>Kargo adımları</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {STEPS.map((s) => {
                const done = !cancelled && step > s.id
                const current = !cancelled && step === s.id
                return (
                  <div
                    key={s.id}
                    style={{
                      flex: '1 1 140px',
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${current ? 'var(--zuu-blue)' : 'var(--border)'}`,
                      background: done ? 'var(--surface-1)' : 'transparent',
                      opacity: !done && !current ? 0.55 : 1,
                      fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{done ? '✓' : s.id}. {s.label}</div>
                  </div>
                )
              })}
            </div>

            {lastError && (
              <div style={{ padding: '10px 12px', background: '#fef2f2', color: '#b91c1c', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
                {lastError}
              </div>
            )}

            {cancelled && <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>Sipariş iptal edildi; kargo işlemi yapılamaz.</p>}

            {stage === 'NEW' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Sipariş henüz Geliver sistemine düşmedi. “Geliver’e ekle” siparişi Geliver’de taslak gönderi olarak açar; bu adımda ücret kesilmez.
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" disabled={!!busy || !detail.configured} onClick={() => act('add')} className={`${styles.btn} ${styles.btnPrimary}`}>
                    {busy === 'add' ? 'Ekleniyor…' : 'Geliver’e ekle'}
                  </button>
                  <button type="button" disabled={!!busy} onClick={openPrepare} className={`${styles.btn} ${styles.btnSecondary}`}>
                    Önce adresi / ölçüyü düzenle
                  </button>
                </div>
              </div>
            )}

            {stage === 'ADDED' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#047857', fontWeight: 600 }}>✓ Sipariş Geliver’e eklendi.</p>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Şimdi alıcının adresini ve koli ölçülerini kontrol edin. Geliver eksik ya da hatalı adresle etiket satın almaya izin vermez.
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" disabled={!!busy} onClick={openPrepare} className={`${styles.btn} ${styles.btnPrimary}`}>Kargoyu hazırla</button>
                  <button type="button" disabled={!!busy} onClick={() => act('remove')} className={`${styles.btn} ${styles.btnSecondary}`}>
                    {busy === 'remove' ? 'Kaldırılıyor…' : 'Geliver’den kaldır'}
                  </button>
                </div>
              </div>
            )}

            {stage === 'READY' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#047857', fontWeight: 600 }}>✓ Kargo bilgileri eklendi.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, background: 'var(--surface-1)', padding: 12, borderRadius: 'var(--radius-sm)' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Koli</div>
                    <div style={{ fontWeight: 600 }}>{detail.parcel.length}×{detail.parcel.width}×{detail.parcel.height} cm · {detail.parcel.weight} kg</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{desi(detail.parcel)} desi</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>PTT kapıda ödeme ücreti</div>
                    <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{price != null ? formatPrice(price) : '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Geliver bakiyesi</div>
                    <div style={{ fontWeight: 700, color: enoughBalance ? 'inherit' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                      {bal ? formatPrice(bal.balance) : 'Görüntülenemiyor'}
                    </div>
                  </div>
                </div>
                {!enoughBalance && (
                  <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>
                    Bakiye yetersiz.{' '}
                    <a href={detail.balance.topUpUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', fontWeight: 700 }}>Geliver’de bakiye yükle ↗</a>
                  </p>
                )}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" disabled={!!busy || !enoughBalance} onClick={() => setShowBuy(true)} className={`${styles.btn} ${styles.btnPrimary}`}>
                    PTT etiketi oluştur
                  </button>
                  <button type="button" disabled={!!busy} onClick={openPrepare} className={`${styles.btn} ${styles.btnSecondary}`}>Bilgileri düzenle</button>
                  <button type="button" disabled={!!busy} onClick={() => act('remove')} className={`${styles.btn} ${styles.btnSecondary}`}>
                    {busy === 'remove' ? 'Kaldırılıyor…' : 'Geliver’den kaldır'}
                  </button>
                </div>
              </div>
            )}

            {['LABEL', 'SHIPPED', 'DELIVERED', 'FAILED'].includes(stage) && shipment && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, background: 'var(--surface-1)', padding: 12, borderRadius: 'var(--radius-sm)' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Kargo</div>
                    <div style={{ fontWeight: 600 }}>PTT Kargo · kapıda ödeme</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Barkod / takip no</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--zuu-blue)' }}>{shipment.trackingNumber || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tahsilat</div>
                    <div style={{ fontWeight: 600 }}>{stage === 'DELIVERED' ? 'Teslimatta tahsil edildi' : `Teslimatta ${formatPrice(order.totalAmount)}`}</div>
                  </div>
                </div>
                {stage === 'LABEL' && (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Etiketi yazdırıp paketin üzerine yapıştırın ve PTT’ye teslim edin. PTT paketi kabul edince Geliver bildirir; sipariş otomatik “Kargoya verildi” olur ve müşteriye e-posta gider. Teslim edilince de aynı şekilde.
                  </p>
                )}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" disabled={!!busy} onClick={openLabel} className={`${styles.btn} ${styles.btnPrimary}`}>
                    {busy === 'label' ? 'Etiket açılıyor…' : 'Etiketi indir / yazdır'}
                  </button>
                  <button type="button" disabled={!!busy} onClick={syncStatus} className={`${styles.btn} ${styles.btnSecondary}`}>
                    {busy === 'sync' ? 'Eşitleniyor…' : 'Kargo durumunu güncelle'}
                  </button>
                  {shipment.trackingUrl && (
                    <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className={`${styles.btn} ${styles.btnSecondary}`}>
                      ↗ PTT takip sayfası
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Items */}
          <div className={styles.formCard}>
            <h2 className={styles.formCardTitle}>Sipariş kalemleri ({order.items?.length || 0})</h2>
            <div className={styles.tableWrapper}>
              <table className={styles.adminTable}>
                <thead>
                  <tr>
                    <th>Ürün</th>
                    <th style={{ textAlign: 'center' }}>Adet</th>
                    <th style={{ textAlign: 'right' }}>Toplam</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items?.map((item: any, i: number) => (
                    <tr key={i}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{item.productName}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{item.sku || '—'}</div>
                      </td>
                      <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatPrice(item.totalAmount ?? item.unitPrice * item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Shipment history */}
          {shipment?.events?.length > 0 && stage !== 'NEW' && (
            <div className={styles.formCard}>
              <h2 className={styles.formCardTitle}>Kargo geçmişi</h2>
              <div className={styles.timeline}>
                {[...shipment.events].reverse().map((ev: any) => (
                  <div key={ev.id} className={styles.timelineItem}>
                    <div className={styles.timelineDot} />
                    <div className={styles.timelineContent}>
                      <div className={styles.timelineHeader}>
                        <span className={styles.timelineStatus}>{ev.description}</span>
                        <span className={styles.timelineTime}>
                          {new Date(ev.eventAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {ev.location && <div className={styles.timelineNote}>{ev.location}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className={styles.formCard}>
            <h2 className={styles.formCardTitle}>Durum</h2>
            <div className={styles.orderSummaryBox}>
              <div className={styles.summaryRow}>
                <span>Sipariş:</span>
                <span className={`${styles.badge} ${styles[orderCfg.badgeClass] || styles.badgeNeutral}`}>{orderCfg.label}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Ödeme:</span>
                <span className={`${styles.badge} ${styles[payCfg.badgeClass] || styles.badgeNeutral}`}>{payCfg.label}</span>
              </div>
              <div className={styles.summaryRowTotal}>
                <span>Kapıda tahsil:</span>
                <span style={{ color: 'var(--zuu-blue)', fontVariantNumeric: 'tabular-nums' }}>{formatPrice(order.totalAmount)}</span>
              </div>
            </div>
          </div>

          <div className={styles.formCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className={styles.formCardTitle} style={{ margin: 0 }}>Alıcı</h2>
              {editable && (
                <button type="button" onClick={openPrepare} className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}>Düzenle</button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, marginTop: 12 }}>
              <div style={{ fontWeight: 600 }}>{addr.fullName}</div>
              <div style={{ fontVariantNumeric: 'tabular-nums' }}>{addr.phone || '—'}</div>
              <div>{order.customerEmail || '—'}</div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                {addr.addressLine}
                <br />
                {addr.district}, {addr.city} {addr.postalCode}
              </div>
              {order.customerNote && (
                <div style={{ padding: '8px 10px', background: 'var(--surface-1)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                  <strong>Müşteri notu:</strong> “{order.customerNote}”
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Prepare modal */}
      <Modal isOpen={showPrepare} onClose={() => !busy && setShowPrepare(false)} ariaLabel="Kargoyu hazırla" maxWidth={640}>
        <div style={{ padding: '8px 4px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>Kargoyu hazırla</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
            Alıcı bilgilerini ve koli ölçülerini kontrol edin. Kaydedince Geliver bunları doğrular ve PTT ücretini bildirir. Adreste yaptığınız düzeltme siparişe de işlenir.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Ad soyad</label>
              <input className={styles.formInput} value={address.fullName} onChange={(e) => setAddress({ ...address, fullName: e.target.value })} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Cep telefonu</label>
              <input className={styles.formInput} value={address.phone} placeholder="05XX XXX XX XX" onChange={(e) => setAddress({ ...address, phone: e.target.value })} />
            </div>
            <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
              <label className={styles.formLabel}>Açık adres</label>
              <textarea
                className={styles.formInput}
                rows={3}
                value={address.addressLine}
                onChange={(e) => setAddress({ ...address, addressLine: e.target.value })}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>İl</label>
              <input className={styles.formInput} value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>İlçe</label>
              <input className={styles.formInput} value={address.district} onChange={(e) => setAddress({ ...address, district: e.target.value })} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Posta kodu</label>
              <input className={styles.formInput} value={address.postalCode} onChange={(e) => setAddress({ ...address, postalCode: e.target.value })} />
            </div>
          </div>

          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Koli ölçüleri</div>
            {detail.parcelTemplates.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>Geliver’deki hazır ölçüler:</span>
                {detail.parcelTemplates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
                    onClick={() =>
                      setParcel({ length: String(t.length), width: String(t.width), height: String(t.height), weight: String(t.weight) })
                    }
                  >
                    {t.name} ({t.length}×{t.width}×{t.height}, {t.weight} kg)
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {(
                [
                  ['length', 'Boy (cm)'],
                  ['width', 'En (cm)'],
                  ['height', 'Yükseklik (cm)'],
                  ['weight', 'Ağırlık (kg)'],
                ] as const
              ).map(([key, label]) => (
                <div className={styles.formGroup} key={key}>
                  <label className={styles.formLabel}>{label}</label>
                  <input className={styles.formInput} inputMode="decimal" value={parcel[key]} onChange={(e) => setParcel({ ...parcel, [key]: e.target.value })} />
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Hesaplanan desi: {Number.isFinite(pNum.length * pNum.width * pNum.height) ? desi(pNum) : '—'}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setShowPrepare(false)} disabled={busy === 'prepare'}>
              Vazgeç
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={savePrepare} disabled={busy === 'prepare'}>
              {busy === 'prepare' ? 'Geliver doğruluyor…' : 'Kaydet'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Buy confirmation */}
      <Modal isOpen={showBuy} onClose={() => busy !== 'buy' && setShowBuy(false)} ariaLabel="PTT etiketi oluştur" maxWidth={460}>
        <div style={{ padding: '8px 4px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>PTT etiketi oluşturulsun mu?</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 16px' }}>
            #{order.orderNumber} için PTT kapıda ödeme kargosu Geliver bakiyenizden satın alınır
            {price != null && <> (<strong>{formatPrice(price)}</strong>)</>} ve etiket oluşturulur. Satın alınan etiket sonradan iptal edilebilir ancak iade Geliver kurallarına bağlıdır.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setShowBuy(false)} disabled={busy === 'buy'}>Vazgeç</button>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={buyAndOpenLabel} disabled={busy === 'buy'}>
              {busy === 'buy' ? 'Satın alınıyor…' : 'Satın al ve etiketi oluştur'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
