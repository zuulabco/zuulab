'use client'

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCartStore } from '@/store/cartStore'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import { formatPrice } from '@/lib/utils'
import { calculateShipping, FREE_SHIPPING_THRESHOLD } from '@/lib/services/shipping.service'
import styles from './Checkout.module.css'

const CITIES = [
  'İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Adana', 'Konya',
  'Gaziantep', 'Kocaeli', 'Eskişehir', 'Mersin', 'Kayseri', 'Samsun',
  'Denizli', 'Trabzon', 'Diyarbakır', 'Muğla', 'Tekirdağ', 'Aydın', 'Balıkesir'
]

export default function CheckoutClient() {
  const router = useRouter()
  const { items, coupon, discountAmount, applyCoupon, removeCoupon, subtotal } = useCartStore()
  const { user, token, openAuthModal } = useAuthStore()

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false)
  const submittingRef = useRef(false)

  // Delivery & Customer state
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('İstanbul')
  const [district, setDistrict] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [postalCode, setPostalCode] = useState('34000')
  const [addressLine, setAddressLine] = useState('')
  const [customerNote, setCustomerNote] = useState('')
  const [showNoteField, setShowNoteField] = useState(false)

  // Billing Address
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true)
  const [billingFullName, setBillingFullName] = useState('')
  const [billingTaxNumber, setBillingTaxNumber] = useState('')
  const [billingTaxOffice, setBillingTaxOffice] = useState('')

  // Shipping Method
  const [shippingMethod, setShippingMethod] = useState<'STANDARD' | 'EXPRESS'>('STANDARD')

  // Payment Form (Simulated Card with Card Brand Detection)
  const [cardNumber, setCardNumber] = useState('5555 5555 5555 0000')
  const [cardHolder, setCardHolder] = useState('')
  const [cardExpiry, setCardExpiry] = useState('12/28')
  const [cardCvv, setCardCvv] = useState('123')

  // Legal Consent Checkbox
  const [agreementAccepted, setAgreementAccepted] = useState(true)

  // Coupon state
  const [couponInput, setCouponInput] = useState('')
  const [couponError, setCouponError] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)

  // Saved addresses for logged in user
  const [savedAddresses, setSavedAddresses] = useState<any[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)

  // Global Modal for adding new address
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('Ev')
  const [modalFirstName, setModalFirstName] = useState('')
  const [modalLastName, setModalLastName] = useState('')
  const [modalPhone, setModalPhone] = useState('')
  const [modalCity, setModalCity] = useState('İstanbul')
  const [modalDistrict, setModalDistrict] = useState('')
  const [modalAddressLine, setModalAddressLine] = useState('')
  const [modalPostalCode, setModalPostalCode] = useState('34000')
  const [modalIsDefault, setModalIsDefault] = useState(false)
  const [modalSaving, setModalSaving] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Auto-fill logged in user info
  useEffect(() => {
    if (user) {
      if (user.email && !email) setEmail(user.email)
      if (user.name && !fullName) {
        setFullName(user.name)
        if (!cardHolder) setCardHolder(user.name)
      }
    }
  }, [user, email, fullName, cardHolder])

  // Fetch saved addresses if logged in
  const fetchSavedAddresses = async () => {
    if (!token) return
    try {
      const res = await fetch('/api/account/addresses', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success && Array.isArray(data.addresses) && data.addresses.length > 0) {
        setSavedAddresses(data.addresses)
        const defaultAddr = data.addresses.find((a: any) => a.isDefault) || data.addresses[0]
        if (defaultAddr && !selectedAddressId) {
          selectAddress(defaultAddr)
        }
      }
    } catch {
      // Graceful fallback to manual address input
    }
  }

  useEffect(() => {
    fetchSavedAddresses()
  }, [token])

  const selectAddress = (addr: any) => {
    setSelectedAddressId(addr.id)
    setFullName(`${addr.firstName} ${addr.lastName}`)
    setPhone(addr.phone)
    setCity(addr.city)
    setDistrict(addr.district)
    setAddressLine(addr.addressLine1 + (addr.addressLine2 ? ` ${addr.addressLine2}` : ''))
    setPostalCode(addr.postalCode || '34000')
    if (!cardHolder) setCardHolder(`${addr.firstName} ${addr.lastName}`)
    // Clear any inline field errors for address
    setFieldErrors((prev) => ({
      ...prev,
      fullName: '',
      phone: '',
      city: '',
      district: '',
      addressLine: '',
    }))
  }

  // Handle opening New Address Modal
  const handleOpenAddAddressModal = () => {
    setModalTitle('Ev')
    const nameParts = fullName.trim().split(' ')
    setModalFirstName(nameParts[0] || (user?.name?.split(' ')[0] ?? ''))
    setModalLastName(nameParts.slice(1).join(' ') || (user?.name?.split(' ').slice(1).join(' ') ?? ''))
    setModalPhone(phone || '')
    setModalCity(city || 'İstanbul')
    setModalDistrict(district || '')
    setModalAddressLine('')
    setModalPostalCode(postalCode || '34000')
    setModalIsDefault(savedAddresses.length === 0)
    setModalError(null)
    setIsAddressModalOpen(true)
  }

  // Save new address in modal
  const handleSaveModalAddress = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) {
      toast.error('Adres kaydetmek için lütfen giriş yapın.')
      return
    }

    if (!modalFirstName.trim() || !modalLastName.trim() || !modalPhone.trim() || !modalAddressLine.trim() || !modalDistrict.trim()) {
      setModalError('Lütfen tüm zorunlu alanları doldurun.')
      return
    }

    setModalSaving(true)
    setModalError(null)

    try {
      const payload = {
        title: modalTitle.trim() || 'Adres',
        firstName: modalFirstName.trim(),
        lastName: modalLastName.trim(),
        phone: modalPhone.trim(),
        city: modalCity,
        district: modalDistrict.trim(),
        postalCode: modalPostalCode.trim() || '34000',
        addressLine1: modalAddressLine.trim(),
        addressLine2: null,
        country: 'Türkiye',
        isDefault: modalIsDefault,
      }

      const res = await fetch('/api/account/addresses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.success && data.address) {
        toast.success('Yeni teslimat adresiniz kaydedildi.')
        setSavedAddresses((prev) => [data.address, ...prev])
        selectAddress(data.address)
        setIsAddressModalOpen(false)
      } else {
        setModalError(data.error || 'Adres kaydedilemedi.')
      }
    } catch {
      setModalError('Sunucu bağlantısı sırasında bir hata oluştu.')
    } finally {
      setModalSaving(false)
    }
  }

  if (!mounted) return null

  // Empty cart view
  if (items.length === 0) {
    return (
      <div className={styles.emptyContainer} role="region" aria-label="Boş Sepet">
        <div className={styles.emptyIconWrap} aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
        </div>
        <h2 className={styles.emptyTitle}>sepetiniz henüz boş</h2>
        <p className={styles.emptyDesc}>
          ödeme adımına geçebilmek için mağazamızdaki tasarım objelerinden sepetinize ekleyebilirsiniz.
        </p>
        <Link href="/urunler" className={styles.catalogBtn}>
          ürünleri keşfet →
        </Link>
      </div>
    )
  }

  const sub = subtotal()
  const isFreeShipCoupon = coupon?.type === 'FREE_SHIPPING'
  const shippingCalc = calculateShipping(sub, shippingMethod, isFreeShipCoupon)
  const effectiveShipping = shippingCalc.shippingFee
  const grandTotal = Math.max(0, sub - discountAmount + effectiveShipping)
  const remainingForFree = shippingCalc.remainingForFreeShipping
  const freeShippingProgress = Math.min(100, Math.round((sub / FREE_SHIPPING_THRESHOLD) * 100))

  // Card brand detection
  const cleanCardNumber = cardNumber.replace(/\s+/g, '')
  let cardBrand: 'visa' | 'mastercard' | 'troy' | null = null
  if (cleanCardNumber.startsWith('4')) {
    cardBrand = 'visa'
  } else if (/^(5[1-5]|2[2-7])/.test(cleanCardNumber)) {
    cardBrand = 'mastercard'
  } else if (cleanCardNumber.startsWith('9792')) {
    cardBrand = 'troy'
  }

  // Card formatting helpers
  const handleCardNumberChange = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 16)
    const formatted = raw.replace(/(.{4})/g, '$1 ').trim()
    setCardNumber(formatted)
    if (fieldErrors.cardNumber) {
      setFieldErrors((prev) => ({ ...prev, cardNumber: '' }))
    }
  }

  const handleExpiryChange = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 4)
    if (raw.length >= 3) {
      setCardExpiry(`${raw.slice(0, 2)}/${raw.slice(2)}`)
    } else {
      setCardExpiry(raw)
    }
    if (fieldErrors.cardExpiry) {
      setFieldErrors((prev) => ({ ...prev, cardExpiry: '' }))
    }
  }

  const handleCvvChange = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 4)
    setCardCvv(raw)
    if (fieldErrors.cardCvv) {
      setFieldErrors((prev) => ({ ...prev, cardCvv: '' }))
    }
  }

  // Authoritative Coupon handling via backend
  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault()
    setCouponError('')
    const code = couponInput.trim().toUpperCase()
    if (!code) return

    setCouponLoading(true)
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal: sub }),
      })
      const data = await res.json()
      if (data.success && data.data?.valid) {
        applyCoupon(code, data.data.discountAmount, data.data.type || 'FIXED')
        setCouponInput('')
        toast.success(`"${code}" kupon kodu uygulandı`)
      } else {
        const errorMsg = data.error || 'Geçersiz veya süresi dolmuş kupon kodu.'
        setCouponError(errorMsg)
        toast.error(errorMsg)
      }
    } catch {
      const errorMsg = 'Kupon doğrulanamadı. Lütfen tekrar deneyin.'
      setCouponError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setCouponLoading(false)
    }
  }

  const handleRemoveCoupon = () => {
    const code = coupon?.code
    removeCoupon()
    if (code) toast.info(`"${code}" kuponu kaldırıldı`)
  }

  // Validate fields before submitting
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {}

    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      errors.email = 'Geçerli bir e-posta adresi giriniz.'
    }
    if (!fullName.trim()) {
      errors.fullName = 'Ad soyad alanı zorunludur.'
    }
    if (!phone.trim() || phone.replace(/\D/g, '').length < 10) {
      errors.phone = 'Geçerli bir cep telefonu numarası giriniz (en az 10 hane).'
    }
    if (!district.trim()) {
      errors.district = 'İlçe alanı zorunludur.'
    }
    if (!addressLine.trim() || addressLine.trim().length < 8) {
      errors.addressLine = 'Lütfen cadde, sokak ve bina içeren açık adresinizi giriniz.'
    }

    if (!cardHolder.trim()) {
      errors.cardHolder = 'Kart üzerindeki isim zorunludur.'
    }
    if (cleanCardNumber.length < 16) {
      errors.cardNumber = '16 haneli kart numaranızı eksiksiz giriniz.'
    }
    if (!/^\d{2}\/\d{2}$/.test(cardExpiry)) {
      errors.cardExpiry = 'AA/YY formatında giriniz.'
    }
    if (cardCvv.length < 3) {
      errors.cardCvv = 'En az 3 haneli güvenlik kodunu giriniz.'
    }

    if (!agreementAccepted) {
      errors.agreement = 'Devam edebilmek için mesafeli satış sözleşmesini onaylamanız gerekmektedir.'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submittingRef.current || loading) return

    setErrorMessage(null)

    if (!validateForm()) {
      const firstErrorKey = Object.keys(fieldErrors)[0]
      const el = document.getElementById(`checkout-${firstErrorKey}`) || document.getElementById('checkout-form')
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      toast.error('Lütfen formdaki eksik veya hatalı bilgileri kontrol edin.')
      return
    }

    submittingRef.current = true
    setLoading(true)

    try {
      // 1. Initiate checkout and create pending order
      const res = await fetch('/api/checkout/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          email: email.trim(),
          shippingAddress: {
            fullName: fullName.trim(),
            phone: phone.trim(),
            city,
            district: district.trim(),
            neighborhood: neighborhood.trim() || undefined,
            postalCode: postalCode.trim() || '34000',
            addressLine: addressLine.trim(),
          },
          billingSameAsShipping,
          billingAddress: billingSameAsShipping
            ? undefined
            : {
                fullName: billingFullName.trim() || fullName.trim(),
                phone: phone.trim(),
                city,
                district: district.trim(),
                postalCode: postalCode.trim() || '34000',
                addressLine: addressLine.trim(),
                taxNumber: billingTaxNumber.trim() || undefined,
                taxOffice: billingTaxOffice.trim() || undefined,
              },
          shippingMethod,
          couponCode: coupon?.code || null,
          customerNote: customerNote.trim() || null,
          savedAddressId: selectedAddressId || undefined,
          expectedTotal: grandTotal,
          items: items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
          })),
        }),
      })

      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || 'Ödeme oturumu başlatılamadı.')
      }

      const { orderNumber, paymentId } = data

      // 2. Process Sandbox Payment
      // Test Card Rule: Card ending with 9999 simulates failure, others simulate success
      const isSimulatedFailure = cleanCardNumber.endsWith('9999')

      const payRes = await fetch('/api/payments/process-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber,
          paymentId,
          simulateStatus: isSimulatedFailure ? 'FAILED' : 'SUCCESS',
          failureReason: isSimulatedFailure
            ? 'Banka kart limiti yetersiz veya işlem onaylanmadı.'
            : undefined,
        }),
      })

      const payData = await payRes.json()

      if (isSimulatedFailure || !payData.success) {
        router.push(
          `/odeme/basarisiz?order=${encodeURIComponent(orderNumber)}&reason=${encodeURIComponent(
            payData.message || 'Ödeme tamamlanamadı.'
          )}`
        )
      } else {
        router.push(`/odeme/basarili?order=${encodeURIComponent(orderNumber)}`)
      }
    } catch (err: any) {
      console.error('[checkout] Submit error:', err)
      const msg = err.message || 'İşlem sırasında beklenmeyen bir hata oluştu. Lütfen bilgilerinizi kontrol ediniz.'
      setErrorMessage(msg)
      toast.error(msg)
      setLoading(false)
      submittingRef.current = false
    }
  }

  // Step completion indicators
  const isDeliveryComplete = Boolean(
    email && fullName && phone && city && district && addressLine
  )
  const isShippingComplete = Boolean(shippingMethod)
  const isPaymentFilled = Boolean(
    cardHolder && cleanCardNumber.length === 16 && cardExpiry.length === 5 && cardCvv.length >= 3
  )

  return (
    <div className={styles.checkoutContainer}>
      {/* Editorial Progress Indicator */}
      <nav className={styles.progressContainer} aria-label="Ödeme adımları">
        <div className={`${styles.progressStep} ${styles.progressStepActive}`}>
          <span className={styles.progressStepNum}>01</span>
          <span className={styles.progressStepLabel}>teslimat</span>
          {isDeliveryComplete && <span className={styles.progressStepCheck} aria-hidden="true">✓</span>}
        </div>
        <div className={styles.progressDivider} aria-hidden="true" />
        <div className={`${styles.progressStep} ${isDeliveryComplete ? styles.progressStepActive : ''}`}>
          <span className={styles.progressStepNum}>02</span>
          <span className={styles.progressStepLabel}>kargo</span>
          {isShippingComplete && <span className={styles.progressStepCheck} aria-hidden="true">✓</span>}
        </div>
        <div className={styles.progressDivider} aria-hidden="true" />
        <div className={`${styles.progressStep} ${isDeliveryComplete && isShippingComplete ? styles.progressStepActive : ''}`}>
          <span className={styles.progressStepNum}>03</span>
          <span className={styles.progressStepLabel}>ödeme</span>
          {isPaymentFilled && <span className={styles.progressStepCheck} aria-hidden="true">✓</span>}
        </div>
      </nav>

      {/* Mobile Summary Disclosure Bar */}
      <div
        className={styles.mobileSummaryBar}
        onClick={() => setMobileSummaryOpen(!mobileSummaryOpen)}
        role="button"
        tabIndex={0}
        aria-expanded={mobileSummaryOpen}
        aria-controls="checkout-order-summary"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setMobileSummaryOpen(!mobileSummaryOpen)
          }
        }}
      >
        <span className={styles.mobileSummaryLabel}>
          <span>{mobileSummaryOpen ? 'sipariş özetini gizle' : `sipariş özeti (${items.length} ürün)`}</span>
          <span className={styles.mobileSummaryCaret} aria-hidden="true">{mobileSummaryOpen ? '▲' : '▼'}</span>
        </span>
        <span className={styles.mobileSummaryTotal}>{formatPrice(grandTotal)}</span>
      </div>

      <div className={styles.checkoutLayout}>
        {/* Left Column: Form Steps */}
        <form id="checkout-form" onSubmit={handleSubmitOrder} className={styles.stepsColumn} noValidate>
          {errorMessage && (
            <div className={styles.errorBanner} role="alert" aria-live="assertive">
              <span className={styles.errorIcon} aria-hidden="true">!</span>
              <div className={styles.errorContent}>
                <span className={styles.errorTitle}>sipariş oluşturulamadı</span>
                <span className={styles.errorText}>{errorMessage}</span>
              </div>
            </div>
          )}

          {/* STEP 1: Teslimat Bilgileri */}
          <section className={styles.stepSection} aria-labelledby="step-delivery-heading">
            <div className={styles.stepHeader}>
              <div className={styles.stepHeaderLeft}>
                <span className={styles.stepBadge} aria-hidden="true">01</span>
                <h2 id="step-delivery-heading" className={styles.stepTitle}>teslimat adresi</h2>
              </div>
              {!user ? (
                <div className={styles.guestAuthPrompt}>
                  <span>hesabınız var mı?</span>
                  <button type="button" onClick={openAuthModal} className={styles.guestLoginLink}>
                    giriş yap
                  </button>
                </div>
              ) : (
                <div className={styles.userBadgeWrap}>
                  <span className={styles.userBadge}>{user.email}</span>
                </div>
              )}
            </div>

            {/* Saved Addresses list (for authenticated users) */}
            {savedAddresses.length > 0 && (
              <div className={styles.savedAddressesBox}>
                <div className={styles.savedAddressesTop}>
                  <span className={styles.sectionSublabel}>kayıtlı adresleriniz</span>
                  <button
                    type="button"
                    onClick={handleOpenAddAddressModal}
                    className={styles.addAddressInlineBtn}
                  >
                    + yeni adres ekle
                  </button>
                </div>

                <div className={styles.savedAddressesGrid} role="radiogroup" aria-label="Kayıtlı Adresler">
                  {savedAddresses.map((addr) => {
                    const isSelected = selectedAddressId === addr.id
                    return (
                      <div
                        key={addr.id}
                        className={`${styles.savedAddressCard} ${isSelected ? styles.savedAddressCardActive : ''}`}
                        onClick={() => selectAddress(addr)}
                        role="radio"
                        aria-checked={isSelected}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault()
                            selectAddress(addr)
                          }
                        }}
                      >
                        <div className={styles.savedAddressHeader}>
                          <span className={styles.savedAddressTitle}>{addr.title || 'Adres'}</span>
                          {isSelected ? (
                            <span className={styles.selectedPill} aria-label="Seçili adres">seçili</span>
                          ) : addr.isDefault ? (
                            <span className={styles.defaultBadge}>varsayılan</span>
                          ) : null}
                        </div>
                        <p className={styles.savedAddressRecipient}>{addr.firstName} {addr.lastName}</p>
                        <p className={styles.savedAddressLine}>{addr.addressLine1}, {addr.district} / {addr.city}</p>
                        <p className={styles.savedAddressPhone}>{addr.phone}</p>
                      </div>
                    )
                  })}

                  <div
                    className={`${styles.savedAddressCard} ${styles.newAddressActionCard}`}
                    onClick={handleOpenAddAddressModal}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault()
                        handleOpenAddAddressModal()
                      }
                    }}
                  >
                    <span className={styles.newAddressIcon} aria-hidden="true">+</span>
                    <span className={styles.newAddressText}>yeni bir adres tanımla</span>
                  </div>
                </div>
              </div>
            )}

            {/* Address Form Inputs (For Guests or when no saved addresses exist) */}
            {savedAddresses.length === 0 && (
              <div className={styles.formGrid}>
                <div className={`${styles.formGroup} ${styles.colSpan2}`}>
                  <label className={styles.label} htmlFor="checkout-email">
                    e-posta adresi <span className={styles.reqMark}>*</span>
                  </label>
                  <input
                    id="checkout-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="ornek@zuulab.com"
                    className={`${styles.input} ${fieldErrors.email ? styles.inputErrorBorder : ''}`}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: '' }))
                    }}
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? 'checkout-email-error' : undefined}
                  />
                  {fieldErrors.email && (
                    <span id="checkout-email-error" className={styles.fieldErrorText} role="alert">
                      {fieldErrors.email}
                    </span>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="checkout-fullName">
                    ad soyad <span className={styles.reqMark}>*</span>
                  </label>
                  <input
                    id="checkout-fullName"
                    type="text"
                    required
                    autoComplete="name"
                    placeholder="Ahmet Yılmaz"
                    className={`${styles.input} ${fieldErrors.fullName ? styles.inputErrorBorder : ''}`}
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value)
                      if (!cardHolder) setCardHolder(e.target.value)
                      if (fieldErrors.fullName) setFieldErrors((p) => ({ ...p, fullName: '' }))
                    }}
                    aria-invalid={Boolean(fieldErrors.fullName)}
                    aria-describedby={fieldErrors.fullName ? 'checkout-fullname-error' : undefined}
                  />
                  {fieldErrors.fullName && (
                    <span id="checkout-fullname-error" className={styles.fieldErrorText} role="alert">
                      {fieldErrors.fullName}
                    </span>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="checkout-phone">
                    cep telefonu <span className={styles.reqMark}>*</span>
                  </label>
                  <input
                    id="checkout-phone"
                    type="tel"
                    required
                    autoComplete="tel"
                    placeholder="05xx xxx xx xx"
                    className={`${styles.input} ${fieldErrors.phone ? styles.inputErrorBorder : ''}`}
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value)
                      if (fieldErrors.phone) setFieldErrors((p) => ({ ...p, phone: '' }))
                    }}
                    aria-invalid={Boolean(fieldErrors.phone)}
                    aria-describedby={fieldErrors.phone ? 'checkout-phone-error' : undefined}
                  />
                  {fieldErrors.phone && (
                    <span id="checkout-phone-error" className={styles.fieldErrorText} role="alert">
                      {fieldErrors.phone}
                    </span>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="checkout-city">
                    şehir <span className={styles.reqMark}>*</span>
                  </label>
                  <select
                    id="checkout-city"
                    autoComplete="address-level1"
                    className={styles.select}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  >
                    {CITIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="checkout-district">
                    ilçe <span className={styles.reqMark}>*</span>
                  </label>
                  <input
                    id="checkout-district"
                    type="text"
                    required
                    autoComplete="address-level2"
                    placeholder="Kadıköy"
                    className={`${styles.input} ${fieldErrors.district ? styles.inputErrorBorder : ''}`}
                    value={district}
                    onChange={(e) => {
                      setDistrict(e.target.value)
                      if (fieldErrors.district) setFieldErrors((p) => ({ ...p, district: '' }))
                    }}
                    aria-invalid={Boolean(fieldErrors.district)}
                    aria-describedby={fieldErrors.district ? 'checkout-district-error' : undefined}
                  />
                  {fieldErrors.district && (
                    <span id="checkout-district-error" className={styles.fieldErrorText} role="alert">
                      {fieldErrors.district}
                    </span>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="checkout-neighborhood">
                    mahalle (opsiyonel)
                  </label>
                  <input
                    id="checkout-neighborhood"
                    type="text"
                    placeholder="Moda Mah."
                    className={styles.input}
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="checkout-postalCode">
                    posta kodu <span className={styles.reqMark}>*</span>
                  </label>
                  <input
                    id="checkout-postalCode"
                    type="text"
                    required
                    autoComplete="postal-code"
                    placeholder="34710"
                    className={styles.input}
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                  />
                </div>

                <div className={`${styles.formGroup} ${styles.colSpan2}`}>
                  <label className={styles.label} htmlFor="checkout-addressLine">
                    açık adres <span className={styles.reqMark}>*</span>
                  </label>
                  <textarea
                    id="checkout-addressLine"
                    required
                    autoComplete="street-address"
                    placeholder="Cadde, sokak, bina no, daire no..."
                    className={`${styles.textarea} ${fieldErrors.addressLine ? styles.inputErrorBorder : ''}`}
                    value={addressLine}
                    onChange={(e) => {
                      setAddressLine(e.target.value)
                      if (fieldErrors.addressLine) setFieldErrors((p) => ({ ...p, addressLine: '' }))
                    }}
                    aria-invalid={Boolean(fieldErrors.addressLine)}
                    aria-describedby={fieldErrors.addressLine ? 'checkout-address-error' : undefined}
                  />
                  {fieldErrors.addressLine && (
                    <span id="checkout-address-error" className={styles.fieldErrorText} role="alert">
                      {fieldErrors.addressLine}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Billing Address Toggle */}
            <div className={styles.billingToggleWrap}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={billingSameAsShipping}
                  onChange={(e) => setBillingSameAsShipping(e.target.checked)}
                  className={styles.checkboxInput}
                />
                <span className={styles.checkboxText}>fatura adresim teslimat adresimle aynı</span>
              </label>

              {!billingSameAsShipping && (
                <div className={styles.billingSubform}>
                  <div className={styles.formGrid}>
                    <div className={`${styles.formGroup} ${styles.colSpan2}`}>
                      <label className={styles.label} htmlFor="billing-fullname">fatura ünvanı / şahıs adı</label>
                      <input
                        id="billing-fullname"
                        type="text"
                        placeholder="Şirket ünvanı veya şahıs adı"
                        className={styles.input}
                        value={billingFullName}
                        onChange={(e) => setBillingFullName(e.target.value)}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.label} htmlFor="billing-taxoffice">vergi dairesi</label>
                      <input
                        id="billing-taxoffice"
                        type="text"
                        placeholder="Örn: Kadıköy V.D."
                        className={styles.input}
                        value={billingTaxOffice}
                        onChange={(e) => setBillingTaxOffice(e.target.value)}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.label} htmlFor="billing-taxnumber">vergi no / tc kimlik no</label>
                      <input
                        id="billing-taxnumber"
                        type="text"
                        placeholder="Vergi no veya TCKN"
                        className={styles.input}
                        value={billingTaxNumber}
                        onChange={(e) => setBillingTaxNumber(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* STEP 2: Kargo Seçimi */}
          <section className={styles.stepSection} aria-labelledby="step-shipping-heading">
            <div className={styles.stepHeader}>
              <div className={styles.stepHeaderLeft}>
                <span className={styles.stepBadge} aria-hidden="true">02</span>
                <h2 id="step-shipping-heading" className={styles.stepTitle}>kargo yöntemi</h2>
              </div>
            </div>

            {/* Free shipping progress feedback (Single Source of Truth) */}
            {remainingForFree > 0 ? (
              <div className={styles.freeShipInfo}>
                <div className={styles.freeShipTextRow}>
                  <span className={styles.freeShipText}>
                    ücretsiz kargo için sepetinize <strong>₺{remainingForFree.toFixed(2)}</strong> daha ekleyin
                  </span>
                  <span className={styles.freeShipGoal}>{freeShippingProgress}%</span>
                </div>
                <div className={styles.freeShipProgressTrack} aria-hidden="true">
                  <div
                    className={styles.freeShipProgressBar}
                    style={{ width: `${freeShippingProgress}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className={`${styles.freeShipInfo} ${styles.freeShipAchieved}`}>
                <span>✓ ₺{FREE_SHIPPING_THRESHOLD} üzeri siparişiniz için <strong>ücretsiz kargo</strong> uygulandı.</span>
              </div>
            )}

            <div className={styles.shippingOptions} role="radiogroup" aria-label="Kargo Yöntemi Seçenekleri">
              {shippingCalc.availableMethods.map((method) => {
                const isSelected = shippingMethod === method.id
                return (
                  <div
                    key={method.id}
                    className={`${styles.shippingCard} ${isSelected ? styles.shippingCardActive : ''}`}
                    onClick={() => setShippingMethod(method.id as any)}
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault()
                        setShippingMethod(method.id as any)
                      }
                    }}
                  >
                    <div className={styles.shippingCardLeft}>
                      <span className={`${styles.radioCircle} ${isSelected ? styles.radioCircleActive : ''}`} aria-hidden="true" />
                      <div className={styles.shippingInfo}>
                        <span className={styles.shippingName}>{method.name} ({method.carrier})</span>
                        <span className={styles.shippingDesc}>{method.description} · {method.estimatedDelivery}</span>
                      </div>
                    </div>

                    <div className={styles.shippingPrice}>
                      {method.effectivePrice === 0 ? (
                        <span className={styles.freeShippingTag}>ücretsiz</span>
                      ) : (
                        formatPrice(method.effectivePrice)
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Optional Customer Note */}
            <div className={styles.noteSection}>
              {!showNoteField ? (
                <button
                  type="button"
                  className={styles.noteToggleBtn}
                  onClick={() => setShowNoteField(true)}
                >
                  + sipariş notu ekle (opsiyonel)
                </button>
              ) : (
                <div className={styles.noteField}>
                  <div className={styles.noteHeader}>
                    <label className={styles.label} htmlFor="checkout-note">sipariş notu</label>
                    <span className={styles.noteCount}>{customerNote.length}/500</span>
                  </div>
                  <textarea
                    id="checkout-note"
                    maxLength={500}
                    placeholder="Atölye üretimi veya kargo teslimatı için özel bir notunuz varsa belirtebilirsiniz..."
                    className={styles.textarea}
                    value={customerNote}
                    onChange={(e) => setCustomerNote(e.target.value)}
                  />
                </div>
              )}
            </div>
          </section>

          {/* STEP 3: Güvenli Ödeme */}
          <section className={styles.stepSection} aria-labelledby="step-payment-heading">
            <div className={styles.stepHeader}>
              <div className={styles.stepHeaderLeft}>
                <span className={styles.stepBadge} aria-hidden="true">03</span>
                <h2 id="step-payment-heading" className={styles.stepTitle}>ödeme yöntemi</h2>
              </div>
              <span className={styles.paymentMethodLabel}>kredi / banka kartı</span>
            </div>

            {/* Sandbox Card Selector for Development Testing */}
            <div className={styles.sandboxHelper}>
              <div className={styles.sandboxInfo}>
                <span className={styles.sandboxBadge}>paytr / 3d secure test ortamı</span>
                <span className={styles.sandboxDesc}>hızlı test kartı seçebilirsiniz:</span>
              </div>
              <div className={styles.sandboxButtons}>
                <button
                  type="button"
                  className={styles.sandboxBtn}
                  onClick={() => {
                    setCardNumber('5555 5555 5555 0000')
                    setCardExpiry('12/28')
                    setCardCvv('123')
                    toast.info('Başarılı test kartı yüklendi')
                  }}
                >
                  ✓ başarılı test kartı (...0000)
                </button>
                <button
                  type="button"
                  className={styles.sandboxBtn}
                  onClick={() => {
                    setCardNumber('5555 5555 5555 9999')
                    setCardExpiry('12/28')
                    setCardCvv('999')
                    toast.info('Bakiye yetersiz test kartı yüklendi')
                  }}
                >
                  ✗ bakiye yetersiz test kartı (...9999)
                </button>
              </div>
            </div>

            {/* Card Inputs */}
            <fieldset className={styles.paymentFieldset}>
              <legend className={styles.visuallyHidden}>Kart Bilgileri</legend>
              <div className={styles.formGrid}>
                <div className={`${styles.formGroup} ${styles.colSpan2}`}>
                  <label className={styles.label} htmlFor="checkout-cardHolder">
                    kart üzerindeki isim <span className={styles.reqMark}>*</span>
                  </label>
                  <input
                    id="checkout-cardHolder"
                    type="text"
                    required
                    autoComplete="cc-name"
                    placeholder="Ad Soyad"
                    className={`${styles.input} ${fieldErrors.cardHolder ? styles.inputErrorBorder : ''}`}
                    value={cardHolder}
                    onChange={(e) => {
                      setCardHolder(e.target.value)
                      if (fieldErrors.cardHolder) setFieldErrors((p) => ({ ...p, cardHolder: '' }))
                    }}
                    aria-invalid={Boolean(fieldErrors.cardHolder)}
                    aria-describedby={fieldErrors.cardHolder ? 'checkout-cardholder-error' : undefined}
                  />
                  {fieldErrors.cardHolder && (
                    <span id="checkout-cardholder-error" className={styles.fieldErrorText} role="alert">
                      {fieldErrors.cardHolder}
                    </span>
                  )}
                </div>

                <div className={`${styles.formGroup} ${styles.colSpan2}`}>
                  <div className={styles.cardNumberLabelRow}>
                    <label className={styles.label} htmlFor="checkout-cardNumber">
                      kart numarası <span className={styles.reqMark}>*</span>
                    </label>
                    {cardBrand && (
                      <span className={styles.cardBrandBadge}>{cardBrand}</span>
                    )}
                  </div>
                  <input
                    id="checkout-cardNumber"
                    type="text"
                    required
                    autoComplete="cc-number"
                    placeholder="5555 5555 5555 0000"
                    className={`${styles.input} ${fieldErrors.cardNumber ? styles.inputErrorBorder : ''}`}
                    value={cardNumber}
                    onChange={(e) => handleCardNumberChange(e.target.value)}
                    aria-invalid={Boolean(fieldErrors.cardNumber)}
                    aria-describedby={fieldErrors.cardNumber ? 'checkout-cardnumber-error' : undefined}
                  />
                  {fieldErrors.cardNumber && (
                    <span id="checkout-cardnumber-error" className={styles.fieldErrorText} role="alert">
                      {fieldErrors.cardNumber}
                    </span>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="checkout-cardExpiry">
                    son kullanma tarihi <span className={styles.reqMark}>*</span>
                  </label>
                  <input
                    id="checkout-cardExpiry"
                    type="text"
                    required
                    autoComplete="cc-exp"
                    placeholder="AA/YY"
                    className={`${styles.input} ${fieldErrors.cardExpiry ? styles.inputErrorBorder : ''}`}
                    value={cardExpiry}
                    onChange={(e) => handleExpiryChange(e.target.value)}
                    aria-invalid={Boolean(fieldErrors.cardExpiry)}
                    aria-describedby={fieldErrors.cardExpiry ? 'checkout-cardexpiry-error' : undefined}
                  />
                  {fieldErrors.cardExpiry && (
                    <span id="checkout-cardexpiry-error" className={styles.fieldErrorText} role="alert">
                      {fieldErrors.cardExpiry}
                    </span>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="checkout-cardCvv">
                    güvenlik kodu (cvv) <span className={styles.reqMark}>*</span>
                  </label>
                  <input
                    id="checkout-cardCvv"
                    type="text"
                    required
                    autoComplete="cc-csc"
                    placeholder="123"
                    className={`${styles.input} ${fieldErrors.cardCvv ? styles.inputErrorBorder : ''}`}
                    value={cardCvv}
                    onChange={(e) => handleCvvChange(e.target.value)}
                    aria-invalid={Boolean(fieldErrors.cardCvv)}
                    aria-describedby={fieldErrors.cardCvv ? 'checkout-cardcvv-error' : undefined}
                  />
                  {fieldErrors.cardCvv && (
                    <span id="checkout-cardcvv-error" className={styles.fieldErrorText} role="alert">
                      {fieldErrors.cardCvv}
                    </span>
                  )}
                </div>
              </div>
            </fieldset>

            {/* Legal Agreements Checkbox */}
            <div className={styles.agreementWrap}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={agreementAccepted}
                  onChange={(e) => {
                    setAgreementAccepted(e.target.checked)
                    if (fieldErrors.agreement) setFieldErrors((p) => ({ ...p, agreement: '' }))
                  }}
                  className={styles.checkboxInput}
                />
                <span className={styles.agreementText}>
                  <Link href="/kullanim-kosullari" target="_blank" rel="noopener noreferrer" className={styles.legalLink}>
                    Ön bilgilendirme formunu
                  </Link>
                  {' '}ve{' '}
                  <Link href="/kullanim-kosullari" target="_blank" rel="noopener noreferrer" className={styles.legalLink}>
                    mesafeli satış sözleşmesini
                  </Link>
                  {' '}okudum, kabul ediyorum.
                </span>
              </label>
              {fieldErrors.agreement && (
                <span className={styles.fieldErrorText} role="alert">
                  {fieldErrors.agreement}
                </span>
              )}
            </div>

            {/* Desktop Primary Submit CTA */}
            <div className={styles.desktopSubmitWrap}>
              <button
                type="submit"
                disabled={loading}
                className={styles.submitBtn}
              >
                {loading ? (
                  <span>ödeme işleniyor...</span>
                ) : (
                  <>
                    <span>ödemeyi tamamla — {formatPrice(grandTotal)}</span>
                    <span aria-hidden="true">→</span>
                  </>
                )}
              </button>
            </div>

            {/* Security Assurance */}
            <div className={styles.guarantees}>
              <span>✓ 256-bit ssl şifreleme ve paytr 3d secure koruması</span>
              <span>✓ kişisel verileriniz 6698 sayılı kvkk kapsamında korunmaktadır</span>
            </div>
          </section>
        </form>

        {/* Right Column: Sticky Order Summary */}
        <aside
          id="checkout-order-summary"
          className={`${styles.summarySidebar} ${mobileSummaryOpen ? styles.summarySidebarMobileOpen : ''}`}
          aria-label="Sipariş Özeti"
        >
          <div className={styles.summaryHeader}>
            <h3 className={styles.summaryTitle}>sipariş özeti</h3>
            <span className={styles.summaryCount}>{items.length} ürün</span>
          </div>

          {/* Product Items List */}
          <div className={styles.summaryItemList}>
            {items.map((item) => (
              <div key={`${item.productId}-${item.variantId}`} className={styles.summaryItem}>
                <div className={styles.summaryItemImage}>
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt={item.name}
                      fill
                      sizes="48px"
                      className={styles.itemImg}
                    />
                  ) : (
                    <div className={styles.itemImgPlaceholder} />
                  )}
                </div>
                <div className={styles.summaryItemDetails}>
                  <span className={styles.summaryItemName}>{item.name.toLowerCase()}</span>
                  <div className={styles.summaryItemMeta}>
                    {item.variantLabel && <span>{item.variantLabel} · </span>}
                    <span>adet: {item.quantity}</span>
                  </div>
                </div>
                <div className={styles.summaryItemPrice}>
                  {formatPrice(item.price * item.quantity)}
                </div>
              </div>
            ))}
          </div>

          {/* Coupon Code Section */}
          <div className={styles.couponBox}>
            {coupon ? (
              <div className={styles.appliedCouponBadge}>
                <div className={styles.appliedCouponInfo}>
                  <span className={styles.couponCode}>{coupon.code}</span>
                  <span className={styles.couponDiscount}>(-{formatPrice(discountAmount)})</span>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveCoupon}
                  className={styles.removeCouponBtn}
                  aria-label="Kuponu kaldır"
                >
                  kaldır
                </button>
              </div>
            ) : (
              <div>
                <form onSubmit={handleApplyCoupon} className={styles.couponForm}>
                  <input
                    type="text"
                    placeholder="indirim kodu"
                    className={styles.couponInput}
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                  />
                  <button type="submit" disabled={couponLoading} className={styles.couponBtn}>
                    {couponLoading ? '...' : 'uygula'}
                  </button>
                </form>
                {couponError && <p className={styles.couponErrorText} role="alert">{couponError}</p>}
              </div>
            )}
          </div>

          {/* Price Breakdown */}
          <div className={styles.priceBreakdown}>
            <div className={styles.priceRow}>
              <span>ara toplam</span>
              <span className={styles.priceValue}>{formatPrice(sub)}</span>
            </div>

            {discountAmount > 0 && (
              <div className={`${styles.priceRow} ${styles.discountRow}`}>
                <span>indirim ({coupon?.code})</span>
                <span className={styles.priceValue}>-{formatPrice(discountAmount)}</span>
              </div>
            )}

            <div className={styles.priceRow}>
              <span>kargo ({shippingCalc.selectedMethod.name.toLowerCase()})</span>
              <span>
                {effectiveShipping === 0 ? (
                  <strong className={styles.freeShipTagText}>ücretsiz</strong>
                ) : (
                  <span className={styles.priceValue}>{formatPrice(effectiveShipping)}</span>
                )}
              </span>
            </div>

            <div className={styles.priceTotalRow}>
              <div>
                <div className={styles.priceTotalLabel}>toplam</div>
                <div className={styles.taxNote}>kdv dahil</div>
              </div>
              <div className={styles.priceTotalValue}>{formatPrice(grandTotal)}</div>
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile Sticky Bottom CTA Bar */}
      <div className={styles.mobileBottomBar}>
        <div className={styles.mobileBottomInfo}>
          <span className={styles.mobileBottomLabel}>toplam tutar</span>
          <span className={styles.mobileBottomPrice}>{formatPrice(grandTotal)}</span>
        </div>
        <button
          type="submit"
          form="checkout-form"
          disabled={loading}
          className={styles.mobileBottomBtn}
        >
          {loading ? 'işleniyor...' : 'ödemeyi tamamla →'}
        </button>
      </div>

      {/* UI-16 Global Modal for Adding New Delivery Address */}
      <Modal
        isOpen={isAddressModalOpen}
        onClose={() => setIsAddressModalOpen(false)}
        maxWidth="540px"
        ariaLabel="Yeni Teslimat Adresi Ekle"
      >
        <div className={styles.modalContent}>
          <div className={styles.modalHeader}>
            <h3 className={styles.modalTitle}>yeni adres ekle</h3>
            <p className={styles.modalSubtitle}>teslimat için yeni bir adres bilgisi kaydedin.</p>
          </div>

          {modalError && (
            <div className={styles.modalErrorBanner} role="alert">
              {modalError}
            </div>
          )}

          <form onSubmit={handleSaveModalAddress} className={styles.formGrid}>
            <div className={`${styles.formGroup} ${styles.colSpan2}`}>
              <label className={styles.label} htmlFor="modal-title">adres başlığı (örn. Ev, Ofis) *</label>
              <input
                id="modal-title"
                type="text"
                required
                className={styles.input}
                value={modalTitle}
                onChange={(e) => setModalTitle(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="modal-firstName">ad *</label>
              <input
                id="modal-firstName"
                type="text"
                required
                className={styles.input}
                value={modalFirstName}
                onChange={(e) => setModalFirstName(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="modal-lastName">soyad *</label>
              <input
                id="modal-lastName"
                type="text"
                required
                className={styles.input}
                value={modalLastName}
                onChange={(e) => setModalLastName(e.target.value)}
              />
            </div>

            <div className={`${styles.formGroup} ${styles.colSpan2}`}>
              <label className={styles.label} htmlFor="modal-phone">cep telefonu *</label>
              <input
                id="modal-phone"
                type="tel"
                required
                placeholder="05xx xxx xx xx"
                className={styles.input}
                value={modalPhone}
                onChange={(e) => setModalPhone(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="modal-city">şehir *</label>
              <select
                id="modal-city"
                className={styles.select}
                value={modalCity}
                onChange={(e) => setModalCity(e.target.value)}
              >
                {CITIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="modal-district">ilçe *</label>
              <input
                id="modal-district"
                type="text"
                required
                className={styles.input}
                value={modalDistrict}
                onChange={(e) => setModalDistrict(e.target.value)}
              />
            </div>

            <div className={`${styles.formGroup} ${styles.colSpan2}`}>
              <label className={styles.label} htmlFor="modal-addressLine">açık adres *</label>
              <textarea
                id="modal-addressLine"
                required
                placeholder="Cadde, mahalle, bina no, daire no..."
                className={styles.textarea}
                value={modalAddressLine}
                onChange={(e) => setModalAddressLine(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="modal-postalCode">posta kodu</label>
              <input
                id="modal-postalCode"
                type="text"
                placeholder="34000"
                className={styles.input}
                value={modalPostalCode}
                onChange={(e) => setModalPostalCode(e.target.value)}
              />
            </div>

            <div className={`${styles.formGroup} ${styles.colSpan2}`}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={modalIsDefault}
                  onChange={(e) => setModalIsDefault(e.target.checked)}
                  className={styles.checkboxInput}
                />
                <span className={styles.checkboxText}>varsayılan teslimat adresi olarak ayarla</span>
              </label>
            </div>

            <div className={`${styles.modalActions} ${styles.colSpan2}`}>
              <button
                type="button"
                className={styles.modalCancelBtn}
                onClick={() => setIsAddressModalOpen(false)}
                disabled={modalSaving}
              >
                vazgeç
              </button>
              <button
                type="submit"
                className={styles.modalSaveBtn}
                disabled={modalSaving}
              >
                {modalSaving ? 'kaydediliyor...' : 'adresi kaydet ve seç'}
              </button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  )
}
