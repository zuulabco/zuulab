'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCartStore } from '@/store/cartStore'
import { useCartQuote } from '@/hooks/useCartQuote'
import { toast } from '@/store/toastStore'
import { formatPrice } from '@/lib/utils'
import { useShippingConfig } from '@/hooks/useShippingConfig'
import Modal from '@/components/common/Modal'
import ProductCard from '@/components/home/ProductCard'
import type { ProductListItem } from '@/types/product'
import styles from './CartPage.module.css'


interface Props {
  recommendedProducts?: ProductListItem[]
  initialFreeShippingThreshold?: number
}

export default function CartPageClient({
  recommendedProducts = [],
  initialFreeShippingThreshold = 750,
}: Props) {
  const router = useRouter()
  const {
    items,
    updateQuantity,
    removeItem,
    clearCart,
    coupon,
    discountAmount,
    applyCoupon,
    removeCoupon,
    subtotal,
  } = useCartStore()

  const shippingConfig = useShippingConfig()
  const freeShippingThreshold = shippingConfig.freeShippingThreshold ?? initialFreeShippingThreshold
  const STANDARD_SHIPPING_FEE = shippingConfig.method.price
  const [isCouponOpen, setIsCouponOpen] = useState(false)
  const [couponInput, setCouponInput] = useState('')
  const [couponError, setCouponError] = useState('')
  const [isCouponLoading, setIsCouponLoading] = useState(false)
  const [isClearModalOpen, setIsClearModalOpen] = useState(false)


  // Server quote is authoritative; the local numbers only fill the first render.
  const { quote } = useCartQuote(
    { items, couponCode: coupon?.code, shippingMethod: 'STANDARD' },
    { enabled: items.length > 0 }
  )

  // A coupon that no longer applies (cart changed, limit reached, expired) is dropped
  // with the server's reason instead of silently showing a discount that won't be given.
  useEffect(() => {
    // Only a quote priced WITH this code may reject it. Right after a code is applied
    // the page still holds the previous quote (priced without any code); reading that
    // as a rejection removed every freshly applied coupon.
    if (quote && coupon && quote.requestedCouponCode === coupon.code && !quote.coupon) {
      removeCoupon()
      toast.error(quote.couponError || 'Kupon bu sepet için artık geçerli değil.')
    }
  }, [quote, coupon, removeCoupon])

  const localSub = subtotal()
  const sub = quote?.subtotal ?? localSub
  // Coupon part only; an automatic campaign discount is shown on its own row
  const discount = quote ? (quote.couponDiscount ?? quote.discountAmount) : discountAmount
  const isFreeShipCoupon = coupon?.type === 'FREE_SHIPPING'
  const threshold = quote?.freeShippingThreshold ?? freeShippingThreshold
  const shippingFee =
    quote?.shippingAmount ?? (sub >= threshold || isFreeShipCoupon || sub === 0 ? 0 : STANDARD_SHIPPING_FEE)
  const isFreeThresholdMet = sub >= threshold
  const freeShippingRemainder = quote?.remainingForFreeShipping ?? Math.max(0, threshold - sub)
  const freeShippingProgress = threshold === 0 ? 100 : Math.min(100, (sub / threshold) * 100)
  const finalTotal = quote?.total ?? Math.max(0, sub - discount + shippingFee)

  // Filter recommendations to avoid displaying products already in the cart
  const cartProductIds = new Set(items.map((i) => i.productId))
  const filteredRecommendations = recommendedProducts
    .filter((p) => !cartProductIds.has(p.id))
    .slice(0, 4)

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault()
    setCouponError('')

    const code = couponInput.trim().toUpperCase()
    if (!code) return

    setIsCouponLoading(true)

    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          items: items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })),
          shippingMethod: 'STANDARD',
        }),
      })
      const data = await res.json()

      if (data.success && data.data?.valid) {
        applyCoupon(code, data.data.discountAmount, data.data.type || 'FIXED')
        setCouponInput('')
        setIsCouponOpen(false)
        toast.success(`"${code}" kupon kodu uygulandı`)
      } else {
        const msg = data.error || 'Geçersiz veya süresi dolmuş kupon kodu.'
        setCouponError(msg)
        toast.error(msg)
      }
    } catch {
      const msg = 'Kupon doğrulanamadı. Lütfen tekrar deneyin.'
      setCouponError(msg)
      toast.error(msg)
    } finally {
      setIsCouponLoading(false)
    }
  }

  const handleRemoveCoupon = () => {
    removeCoupon()
    toast.info('kupon kaldırıldı')
  }

  const handleRemoveItem = (productId: string, variantId?: string | null) => {
    removeItem(productId, variantId)
    toast.info('ürün sepetten çıkarıldı')
  }

  const handleConfirmClearCart = () => {
    clearCart()
    setIsClearModalOpen(false)
    toast.info('sepet temizlendi')
  }

  // ── EMPTY CART 2.0 ──────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className={styles.emptyContainer}>
        <div className={styles.emptyHeader}>
          <span className={styles.eyebrow}>sepetim</span>
          <h1 className={styles.emptyTitle}>sepetinizde henüz ürün bulunmuyor</h1>
          <p className={styles.emptyDesc}>
            atölyemizde üretilen masaüstü organizerleri, eğitici çocuk setleri ve parametrik masa lambalarını keşfedin.
          </p>
          <div className={styles.emptyActionRow}>
            <Link href="/urunler" className={styles.startShoppingBtn}>
              <span>tüm ürünleri keşfet</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        {/* Editorial Collection Discovery in Empty State */}
        <div className={styles.emptyDiscovery}>
          <span className={styles.discoveryEyebrow}>özel serilerimiz</span>
          <div className={styles.collectionGrid}>
            <Link href="/koleksiyon/zuukids" className={styles.collectionCard}>
              <span className={styles.cardTag}>çocuk dünyası</span>
              <h3 className={styles.cardTitle}>zuukids</h3>
              <p className={styles.cardDesc}>şekil eşleştirme setleri, kesir yapbozları ve eğitici oyunlar.</p>
              <span className={styles.cardLinkText}>seriyi keşfet →</span>
            </Link>

            <Link href="/koleksiyon/zuulife" className={styles.collectionCard}>
              <span className={styles.cardTag}>yaşam alanı</span>
              <h3 className={styles.cardTitle}>zuulife</h3>
              <p className={styles.cardDesc}>masaüstü ve takı organizerleri, ev objeleri.</p>
              <span className={styles.cardLinkText}>seriyi keşfet →</span>
            </Link>

            <Link href="/koleksiyon/zuulight" className={styles.collectionCard}>
              <span className={styles.cardTag}>aydınlatma</span>
              <h3 className={styles.cardTitle}>zuulight</h3>
              <p className={styles.cardDesc}>parametrik desenli masa lambaları.</p>
              <span className={styles.cardLinkText}>seriyi keşfet →</span>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── ACTIVE CART 2.0 ─────────────────────────────────────────
  return (
    <div className={styles.container}>
      {/* ── Page Header ────────────────────────────────────── */}
      <header className={styles.pageHeader}>
        <span className={styles.eyebrow}>zuulab / sepet</span>
        <h1 className={styles.pageTitle}>
          sepetim <span className={styles.pageTitleCount}>({items.length} ürün)</span>
        </h1>
      </header>

      <div className={styles.cartLayout}>
        {/* ── Left: Items List ─────────────────────────────── */}
        <section className={styles.itemsList} aria-label="Sepetteki Ürünler">
          <div className={styles.itemsHeader}>
            <span>ürün</span>
            <span>adet</span>
            <span>fiyat</span>
            <span aria-hidden="true" />
          </div>

          {items.map((item) => {
            const itemTotal = item.price * item.quantity
            const isOutOfStock = item.maxStock <= 0
            const isMaxStockReached = item.quantity >= item.maxStock
            const isLowStock = item.maxStock > 0 && item.maxStock <= 3

            return (
              <div key={`${item.productId}-${item.variantId || 'base'}`} className={styles.cartItem}>
                {/* Product Media & Info */}
                <div className={styles.itemProductCol}>
                  <Link
                    href={`/urun/${item.slug}`}
                    className={styles.itemImageWrapper}
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        fill
                        sizes="88px"
                        className={styles.itemImage}
                      />
                    ) : (
                      <div className={styles.itemNoImage}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                          <circle cx="8.5" cy="8.5" r="1.5"/>
                          <polyline points="21 15 16 10 5 21"/>
                        </svg>
                      </div>
                    )}
                  </Link>

                  <div className={styles.itemDetails}>
                    <Link href={`/urun/${item.slug}`} className={styles.itemName}>
                      {item.name.toLowerCase()}
                    </Link>

                    {item.variantLabel && (
                      <span className={styles.itemVariant}>{item.variantLabel.toLowerCase()}</span>
                    )}

                    <span className={styles.itemUnitPrice}>{formatPrice(item.price)}</span>

                    {/* Stock Status Notes */}
                    {isOutOfStock ? (
                      <span className={styles.stockNoticeOut}>bu ürün şu anda stokta yok</span>
                    ) : isLowStock ? (
                      <span className={styles.stockNoticeLow}>son {item.maxStock} ürün</span>
                    ) : isMaxStockReached ? (
                      <span className={styles.stockNoticeMax}>maksimum stok limitindesiniz ({item.maxStock})</span>
                    ) : null}

                    {/* Mobile Remove Button */}
                    <button
                      type="button"
                      className={styles.mobileRemoveBtn}
                      onClick={() => handleRemoveItem(item.productId, item.variantId)}
                      aria-label={`${item.name} ürününü sepetten çıkar`}
                    >
                      kaldır
                    </button>
                  </div>
                </div>

                {/* Quantity Controls */}
                <div className={styles.itemQtyCol}>
                  <div className={styles.qtyBox} role="group" aria-label="Adet">
                    <button
                      type="button"
                      className={styles.qtyBtn}
                      onClick={() => updateQuantity(item.productId, item.variantId, item.quantity - 1)}
                      disabled={item.quantity <= 1 || isOutOfStock}
                      aria-label={`${item.name} adedini azalt`}
                    >
                      −
                    </button>
                    <span className={styles.qtyValue} aria-live="polite">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      className={styles.qtyBtn}
                      onClick={() => updateQuantity(item.productId, item.variantId, item.quantity + 1)}
                      disabled={isMaxStockReached || isOutOfStock}
                      aria-label={`${item.name} adedini arttır`}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Line Total */}
                <div className={styles.itemTotalCol}>
                  <span className={styles.itemTotalPrice}>{formatPrice(itemTotal)}</span>
                </div>

                {/* Desktop Remove Button */}
                <div className={styles.itemRemoveCol}>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => handleRemoveItem(item.productId, item.variantId)}
                    aria-label={`${item.name} ürününü sepetten çıkar`}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })}

          <div className={styles.cartActionsRow}>
            <Link href="/urunler" className={styles.continueShoppingLink}>
              <span>← alışverişe devam et</span>
            </Link>
            <button
              type="button"
              className={styles.clearCartBtn}
              onClick={() => setIsClearModalOpen(true)}
            >
              sepeti temizle
            </button>
          </div>
        </section>

        {/* ── Right: Order Summary Sidebar ─────────────────── */}
        <aside className={styles.summarySidebar} aria-label="Sipariş Özeti">
          <h2 className={styles.summaryTitle}>sipariş özeti</h2>

          {/* Free Shipping Progress inside summary */}
          <div className={styles.shippingBarCard} role="region" aria-label="Kargo Durumu">
            <div className={styles.shippingBarText}>
              {isFreeThresholdMet || isFreeShipCoupon ? (
                <span className={styles.freeShipSuccess}>
                  ✓ <strong>ücretsiz kargo kazandınız.</strong>
                </span>
              ) : (
                <span>
                  ücretsiz kargo için <strong>{formatPrice(freeShippingRemainder)}</strong> daha ekleyin
                </span>
              )}
            </div>
            <div className={styles.progressBarTrack} aria-hidden="true">
              <div
                className={styles.progressBarFill}
                style={{ width: `${isFreeShipCoupon ? 100 : freeShippingProgress}%` }}
              />
            </div>
          </div>

          {/* Coupon Expander */}
          <div className={styles.couponSection}>
            {coupon ? (
              <div className={styles.appliedCoupon}>
                <div className={styles.couponInfo}>
                  <span className={styles.couponTag}>{coupon.code}</span>
                  <span className={styles.couponDiscount}>
                    -{formatPrice(discount)}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.removeCouponBtn}
                  onClick={handleRemoveCoupon}
                  aria-label="Kuponu kaldır"
                >
                  kaldır
                </button>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  className={styles.couponToggleBtn}
                  onClick={() => setIsCouponOpen(!isCouponOpen)}
                  aria-expanded={isCouponOpen}
                >
                  <span>indirim kodun var mı?</span>
                  <span className={styles.couponToggleIcon}>{isCouponOpen ? '−' : '+'}</span>
                </button>

                {isCouponOpen && (
                  <form onSubmit={handleApplyCoupon} className={styles.couponForm}>
                    <input
                      type="text"
                      placeholder="kod (örn. ZUULAB10)"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      className={styles.couponInput}
                      autoFocus
                      aria-label="İndirim kupon kodu"
                    />
                    <button
                      type="submit"
                      disabled={isCouponLoading || !couponInput.trim()}
                      className={styles.couponApplyBtn}
                    >
                      {isCouponLoading ? '...' : 'uygula'}
                    </button>
                  </form>
                )}
              </div>
            )}

            {couponError && <p className={styles.couponError} role="alert">{couponError}</p>}
          </div>

          {/* Price Breakdown */}
          <div className={styles.breakdown}>
            <div className={styles.breakdownRow}>
              <span>ara toplam</span>
              <span className={styles.breakdownNum}>{formatPrice(sub)}</span>
            </div>

            {(quote?.campaignDiscount ?? 0) > 0 && (
              <div className={`${styles.breakdownRow} ${styles.discountRow}`}>
                <span>kampanya ({quote?.campaign?.name})</span>
                <span className={styles.breakdownNum}>-{formatPrice(quote?.campaignDiscount ?? 0)}</span>
              </div>
            )}
            {discount > 0 && (
              <div className={`${styles.breakdownRow} ${styles.discountRow}`}>
                <span>kupon ({coupon?.code})</span>
                <span className={styles.breakdownNum}>-{formatPrice(discount)}</span>
              </div>
            )}

            <div className={styles.breakdownRow}>
              <span>kargo</span>
              <span>
                {shippingFee === 0 ? (
                  <strong className={styles.freeShipText}>ücretsiz</strong>
                ) : (
                  <span className={styles.breakdownNum}>{formatPrice(shippingFee)}</span>
                )}
              </span>
            </div>

            <div className={styles.breakdownTotal}>
              <div>
                <strong className={styles.totalLabel}>toplam</strong>
                <span className={styles.taxNote}>kdv dahil</span>
              </div>
              <strong className={styles.grandTotal}>{formatPrice(finalTotal)}</strong>
            </div>
          </div>

          {/* Checkout CTA */}
          <button
            type="button"
            className={styles.checkoutBtn}
            onClick={() => router.push('/odeme')}
          >
            <span>ödemeye geç</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>

          {/* Guarantees */}
          <div className={styles.sidebarGuarantees}>
            <span>256-bit ssl güvenli ödeme</span>
            <span>kendi atölyemizde 3d üretim</span>
            <span>14 gün koşulsuz iade güvencesi</span>
          </div>
        </aside>
      </div>

      {/* ── Cart Discovery: Related Products Grid ───────────── */}
      {filteredRecommendations.length > 0 && (
        <section className={styles.discoverySection} aria-label="Önerilen Tasarımlar">
          <div className={styles.discoveryHeader}>
            <h2 className={styles.discoveryTitle}>bunlara da bakabilirsiniz</h2>
            <p className={styles.discoverySubtitle}>
              sepetinizdeki parçalarla uyumlu diğer seçkin zuulab modelleri
            </p>
          </div>

          <div className="grid-products">
            {filteredRecommendations.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {/* ── Mobile Sticky Checkout Bar ──────────────────────── */}
      <div className={styles.mobileStickyBar} role="region" aria-label="Sipariş Özeti">
        <div className={styles.stickyPriceInfo}>
          <span className={styles.stickyTotalLabel}>toplam ({items.length} ürün)</span>
          <span className={styles.stickyPrice}>{formatPrice(finalTotal)}</span>
        </div>
        <button
          type="button"
          className={styles.stickyCheckoutBtn}
          onClick={() => router.push('/odeme')}
        >
          <span>ödemeye geç</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>

      {/* ── Clear Cart Confirmation Modal ───────────────────── */}
      <Modal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        maxWidth="460px"
        ariaLabel="Sepeti Temizleme Onayı"
      >
        <div className={styles.modalContent}>
          <h3 className={styles.modalTitle}>sepeti temizle</h3>
          <p className={styles.modalDesc}>
            sepetinizdeki tüm ürünleri çıkarmak istediğinize emin misiniz? bu işlem geri alınamaz.
          </p>
          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.modalCancelBtn}
              onClick={() => setIsClearModalOpen(false)}
            >
              vazgeç
            </button>
            <button
              type="button"
              className={styles.modalConfirmBtn}
              onClick={handleConfirmClearCart}
            >
              evet, sepeti temizle
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
