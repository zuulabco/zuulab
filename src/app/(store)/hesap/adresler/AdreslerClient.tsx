'use client'

import React, { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import AccountNav from '@/components/account/AccountNav'
import AccountHeader from '@/components/account/AccountHeader'
import { formatTrMobile } from '@/lib/validations/phone'
import { matchProvince } from '@/lib/geo/tr-provinces'
import CityInput, { cityError } from '@/components/forms/CityInput'
import Modal from '@/components/common/Modal'
import ZuuMascotIcon from '@/components/common/ZuuMascotIcon'
import styles from './Adresler.module.css'
import { SkeletonList } from '@/components/common/Skeleton'

interface AddressItem {
  id: string
  title: string
  firstName: string
  lastName: string
  phone: string
  addressLine1: string
  addressLine2?: string | null
  city: string
  district: string
  postalCode: string
  country: string
  isDefault: boolean
}

export default function AdreslerClient() {
  const { user, token, openAuthModal } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  const [addresses, setAddresses] = useState<AddressItem[]>([])
  const [loading, setLoading] = useState(true)

  // Form modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('Ev')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [cityProblem, setCityProblem] = useState('')
  const [district, setDistrict] = useState('')
  const [postalCode, setPostalCode] = useState('34000')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [saving, setSaving] = useState(false)

  // Delete confirmation modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [addressToDeleteId, setAddressToDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const fetchAddresses = () => {
    // No token yet: the session is still being restored, keep the skeleton up.
    if (!token) return
    setLoading(true)
    fetch('/api/account/addresses', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.addresses)) {
          setAddresses(data.addresses)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchAddresses()
  }, [token])

  if (!mounted) return null

  if (!user) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyMascotWrap}>
          <ZuuMascotIcon />
        </div>
        <h2 className={styles.emptyTitle}>giriş yapın</h2>
        <p className={styles.emptyDesc}>
          kayıtlı teslimat ve fatura adreslerinizi görmek için lütfen giriş yapın.
        </p>
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => openAuthModal()}
        >
          giriş yap / kayıt ol
        </button>
      </div>
    )
  }

  const handleOpenAdd = () => {
    setEditingId(null)
    setTitle('Ev')
    setFirstName(user.name?.split(' ')[0] || '')
    setLastName(user.name?.split(' ').slice(1).join(' ') || '')
    setPhone('')
    setCity('')
    setCityProblem('')
    setDistrict('')
    setPostalCode('34000')
    setAddressLine1('')
    setAddressLine2('')
    setIsDefault(addresses.length === 0)
    setModalOpen(true)
  }

  const handleOpenEdit = (addr: AddressItem) => {
    setEditingId(addr.id)
    setTitle(addr.title)
    setFirstName(addr.firstName)
    setLastName(addr.lastName)
    setPhone(addr.phone)
    setCity(addr.city)
    setCityProblem('')
    setDistrict(addr.district)
    setPostalCode(addr.postalCode)
    setAddressLine1(addr.addressLine1)
    setAddressLine2(addr.addressLine2 || '')
    setIsDefault(addr.isDefault)
    setModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const problem = cityError(city)
    if (problem) {
      setCityProblem(problem)
      return
    }
    setSaving(true)

    const payload = {
      title,
      firstName,
      lastName,
      phone,
      city: matchProvince(city) ?? city,
      district,
      postalCode,
      addressLine1,
      addressLine2: addressLine2 || null,
      country: 'Türkiye',
      isDefault,
    }

    try {
      if (editingId) {
        // Update
        const res = await fetch(`/api/account/addresses/${editingId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (data.success) {
          toast.success('adres güncellendi')
          fetchAddresses()
          setModalOpen(false)
        } else {
          toast.error(data.error || 'adres güncellenemedi')
        }
      } else {
        // Create
        const res = await fetch('/api/account/addresses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (data.success) {
          toast.success('yeni adres kaydedildi')
          fetchAddresses()
          setModalOpen(false)
        } else {
          toast.error(data.error || 'adres eklenemedi')
        }
      }
    } catch {
      toast.error('işlem sırasında bir hata oluştu')
    } finally {
      setSaving(false)
    }
  }

  const handlePromptDelete = (id: string) => {
    setAddressToDeleteId(id)
    setDeleteModalOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!addressToDeleteId || !token) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/account/addresses/${addressToDeleteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        toast.info('Adres silindi.')
        fetchAddresses()
        setDeleteModalOpen(false)
        setAddressToDeleteId(null)
      } else {
        toast.error(data.error || 'Adres silinemedi.')
      }
    } catch {
      toast.error('Silme sırasında bir hata oluştu.')
    } finally {
      setDeleting(false)
    }
  }

  const handleSetDefault = async (id: string) => {
    try {
      const res = await fetch(`/api/account/addresses/${id}/default`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        toast.success('varsayılan adres güncellendi')
        fetchAddresses()
      } else {
        toast.error(data.error || 'varsayılan adres güncellenemedi')
      }
    } catch {
      toast.error('varsayılan adres güncellenirken hata oluştu')
    }
  }

  return (
    <>
      <AccountHeader
        title="adreslerim"
        description="varsayılan adresin ödeme sayfasında otomatik seçilir."
        actions={
          <button type="button" onClick={handleOpenAdd} className={styles.addBtn}>
            <span>+ yeni adres ekle</span>
          </button>
        }
      />

      <div className={styles.accountGrid}>
        <aside>
          <AccountNav />
        </aside>

        <main className={styles.mainContent}>
          {loading ? (
            <SkeletonList rows={5} />
          ) : addresses.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyMascotWrap}>
                <ZuuMascotIcon />
              </div>
              <h2 className={styles.emptyTitle}>kayıtlı adresin bulunmuyor</h2>
              <p className={styles.emptyDesc}>
                hızlı ve kolay sipariş verebilmek için teslimat veya fatura adresi ekleyebilirsin.
              </p>
              <button
                type="button"
                className={styles.addBtn}
                onClick={handleOpenAdd}
              >
                + ilk adresini ekle
              </button>
            </div>
          ) : (
            <div className={styles.addressGrid}>
              {addresses.map((addr) => (
                <div
                  key={addr.id}
                  className={`${styles.addressCard} ${addr.isDefault ? styles.addressCardDefault : ''}`}
                >
                  <div className={styles.cardHeader}>
                    <span className={styles.titleBadge}>{addr.title}</span>
                    {addr.isDefault && <span className={styles.defaultBadge}>varsayılan</span>}
                  </div>

                  <div className={styles.cardBody}>
                    <div className={styles.recipientName}>{addr.firstName} {addr.lastName}</div>
                    <div>{formatTrMobile(addr.phone)}</div>
                    <div style={{ marginTop: 4 }}>{addr.addressLine1}</div>
                    {addr.addressLine2 && <div>{addr.addressLine2}</div>}
                    <div>{addr.district} / {addr.city} {addr.postalCode}</div>
                  </div>

                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(addr)}
                      className={styles.actionBtn}
                    >
                      düzenle
                    </button>

                    {!addr.isDefault && (
                      <button
                        type="button"
                        onClick={() => handleSetDefault(addr.id)}
                        className={styles.makeDefaultBtn}
                      >
                        varsayılan yap
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handlePromptDelete(addr.id)}
                      className={styles.deleteBtn}
                    >
                      sil
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Edit / Add Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="580px"
        ariaLabel={editingId ? 'Adresi Düzenle' : 'Yeni Adres Ekle'}
      >
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>
            {editingId ? 'adresi düzenle' : 'yeni adres ekle'}
          </h3>
        </div>

        <form onSubmit={handleSave} className={styles.formGrid}>
          <div className={`${styles.formGroup} ${styles.colSpan2}`}>
            <label className={styles.label}>adres başlığı (örn. Ev, İş)</label>
            <input
              type="text"
              required
              className={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>ad *</label>
            <input
              type="text"
              required
              className={styles.input}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>soyad *</label>
            <input
              type="text"
              required
              className={styles.input}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>

          <div className={`${styles.formGroup} ${styles.colSpan2}`}>
            <label className={styles.label}>telefon *</label>
            <input
              type="tel"
              required
              placeholder="0555 555 55 55"
              className={styles.input}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="address-city">şehir *</label>
            <CityInput
              id="address-city"
              inputClassName={styles.input}
              value={city}
              error={cityProblem}
              onChange={(v) => {
                setCity(v)
                setCityProblem('')
              }}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>ilçe *</label>
            <input
              type="text"
              required
              className={styles.input}
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            />
          </div>

          <div className={`${styles.formGroup} ${styles.colSpan2}`}>
            <label className={styles.label}>açık adres *</label>
            <textarea
              required
              className={styles.textarea}
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              placeholder="Sokak, bina no, daire no..."
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>posta kodu *</label>
            <input
              type="text"
              required
              className={styles.input}
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
            />
          </div>

          <div className={`${styles.formGroup} ${styles.colSpan2}`}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              <span>varsayılan teslimat adresi olarak ayarla</span>
            </label>
          </div>

          <div className={`${styles.modalActions} ${styles.colSpan2}`}>
            <button
              type="button"
              className={styles.cancelModalBtn}
              onClick={() => setModalOpen(false)}
            >
              iptal
            </button>
            <button
              type="submit"
              disabled={saving}
              className={styles.saveModalBtn}
            >
              {saving ? 'kaydediliyor...' : 'kaydet'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => {
          if (!deleting) setDeleteModalOpen(false)
        }}
        maxWidth="420px"
        ariaLabel="Adresi Silme Onayı"
      >
        <div style={{ padding: 'var(--sp-2) 0' }}>
          <h3 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-medium)', margin: '0 0 var(--sp-2) 0', color: 'var(--text-primary)' }}>
            adresi sil
          </h3>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: '0 0 var(--sp-6) 0', lineHeight: 1.5 }}>
            bu teslimat adresini silmek istediğinize emin misiniz? bu işlem geri alınamaz.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-3)' }}>
            <button
              type="button"
              disabled={deleting}
              onClick={() => setDeleteModalOpen(false)}
              className={styles.cancelModalBtn}
            >
              vazgeç
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleConfirmDelete}
              className={styles.deleteBtn}
              style={{ padding: '8px 16px', background: 'var(--error, #ef4444)', color: '#ffffff', border: 'none', borderRadius: 'var(--radius-xs)', cursor: 'pointer' }}
            >
              {deleting ? 'siliniyor...' : 'adresi sil'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
