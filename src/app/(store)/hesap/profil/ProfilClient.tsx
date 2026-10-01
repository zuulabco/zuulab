'use client'

import React, { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import AccountNav from '@/components/account/AccountNav'
import ZuuMascotIcon from '@/components/common/ZuuMascotIcon'
import styles from './Profil.module.css'

interface UserProfile {
  id: string
  email: string
  name: string
  avatar?: string | null
  role: string
  status: string
}

export default function ProfilClient() {
  const { user, token, openAuthModal } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [name, setName] = useState('')

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }

    setLoading(true)
    fetch('/api/account/profile', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.profile) {
          setProfile(data.profile)
          setName(data.profile.name || '')
        }
      })
      .catch((err) => {
        console.error('[profil] fetch error:', err)
        toast.error('Profil bilgileri alınamadı.')
      })
      .finally(() => setLoading(false))
  }, [token])

  if (!mounted) return null

  if (!user) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyMascotWrap}>
          <ZuuMascotIcon size={32} />
        </div>
        <h2 className={styles.emptyTitle}>giriş yapmalısınız</h2>
        <p className={styles.emptyDesc}>
          profil bilgilerinizi görüntülemek ve güncellemek için lütfen hesabınıza giriş yapın.
        </p>
        <button
          type="button"
          className={styles.primaryCtaBtn}
          onClick={() => openAuthModal()}
        >
          giriş yap / kayıt ol
        </button>
      </div>
    )
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return

    setSaving(true)
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: name.trim() }),
      })

      const data = await res.json()
      if (data.success) {
        toast.success('Profil bilgileriniz güncellendi.')
        if (data.profile) {
          setProfile(data.profile)
          setName(data.profile.name || '')
        }
      } else {
        toast.error(data.error || 'Profil güncellenemedi.')
      }
    } catch {
      toast.error('İşlem sırasında bir hata oluştu.')
    } finally {
      setSaving(false)
    }
  }

  const roleLabel = profile?.role === 'ADMIN' || profile?.role === 'SUPER_ADMIN' ? 'yönetici' : 'müşteri'
  const statusLabel = profile?.status === 'ACTIVE' ? 'aktif' : profile?.status?.toLowerCase() || 'aktif'

  return (
    <div className={styles.profilPage}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>zuulab / profil</span>
          <h1 className={styles.pageTitle}>profil bilgilerim</h1>
        </div>
      </header>

      <div className={styles.accountGrid}>
        <aside>
          <AccountNav />
        </aside>

        <main className={styles.mainContent}>
          {loading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>
              profil bilgileri yükleniyor...
            </div>
          ) : (
            <div className={styles.profileSection}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>kişisel bilgiler</h2>
                <div className={styles.statusPill}>
                  <span className={styles.statusDot} />
                  <span>{statusLabel} · {roleLabel}</span>
                </div>
              </div>

              <form onSubmit={handleSave} className={styles.form}>
                <div className={styles.formGroup}>
                  <label htmlFor="profile-name" className={styles.label}>
                    ad soyad
                  </label>
                  <input
                    id="profile-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Adınız ve Soyadınız"
                    className={styles.input}
                    required
                  />
                  <p className={styles.helpText}>
                    fatura ve sipariş iletişimlerinizde bu isim kullanılır.
                  </p>
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="profile-email" className={styles.label}>
                    e-posta
                  </label>
                  <input
                    id="profile-email"
                    type="email"
                    value={profile?.email || user.email}
                    readOnly
                    className={`${styles.input} ${styles.inputReadOnly}`}
                  />
                  <p className={styles.helpText}>
                    bu e-posta giriş hesabınızla ilişkilidir ve doğrudan değiştirilemez.
                  </p>
                </div>

                <div className={styles.infoBox}>
                  <h4 className={styles.infoTitle}>hesap güvenliği & veriler</h4>
                  <p className={styles.infoDesc}>
                    zuulab hesabınız Firebase ve güvenli JWT altyapısıyla korunmaktadır. Parola değişikliği ve oturum yönetimi için giriş sağlayıcınızı kullanabilirsiniz.
                  </p>
                </div>

                <div className={styles.formActions}>
                  <button
                    type="submit"
                    disabled={saving}
                    className={styles.saveBtn}
                  >
                    {saving ? 'kaydediliyor...' : 'bilgileri kaydet'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
