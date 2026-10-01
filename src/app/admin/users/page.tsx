'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import { getUserRoleConfig, USER_ROLE_MAP } from '@/lib/constants/admin-status'
import styles from '../admin.module.css'

interface AdminUser {
  id: string
  firebaseUid?: string | null
  email: string
  name: string | null
  role: 'CUSTOMER' | 'ADMIN' | 'SUPER_ADMIN' | 'STAFF' | 'SUPPORT' | 'CONTENT_MANAGER' | 'ORDER_MANAGER'
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE'
  orderCount: number
  lastLoginAt: string | null
  createdAt: string
}

export default function AdminUsersPage() {
  const { token, user: currentAuthUser, canFetch } = useAuthStore()
  const { addToast } = useToastStore()

  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Role Change Modal State
  const [targetUser, setTargetUser] = useState<AdminUser | null>(null)
  const [selectedRole, setSelectedRole] = useState<string>('')
  const [updatingRole, setUpdatingRole] = useState(false)

  // Status Change Modal State
  const [statusTargetUser, setStatusTargetUser] = useState<AdminUser | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  const loadUsers = async () => {
    if (!canFetch) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (roleFilter !== 'ALL') params.set('role', roleFilter)
      if (statusFilter !== 'ALL') params.set('status', statusFilter)

      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success && Array.isArray(data.users)) {
        setUsers(data.users)
      } else {
        addToast(data.error || 'Kullanıcı listesi alınamadı.', 'error')
      }
    } catch {
      addToast('Kullanıcı listesi yüklenirken bağlantı hatası oluştu.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [token, canFetch, roleFilter, statusFilter])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    loadUsers()
  }

  const handleOpenRoleModal = (user: AdminUser) => {
    setTargetUser(user)
    setSelectedRole(user.role)
  }

  const handleSaveRole = async () => {
    if (!targetUser || !canFetch || selectedRole === targetUser.role) {
      setTargetUser(null)
      return
    }

    setUpdatingRole(true)
    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: selectedRole }),
      })
      const data = await res.json()

      if (data.success) {
        addToast(`${targetUser.name || targetUser.email} kullanıcısının rolü ${USER_ROLE_MAP[selectedRole]?.label || selectedRole} olarak güncellendi.`, 'success')
        setTargetUser(null)
        loadUsers()
      } else {
        addToast(data.error || 'Rol güncellenemedi.', 'error')
      }
    } catch {
      addToast('Yetkilendirme sunucusuna erişilemedi.', 'error')
    } finally {
      setUpdatingRole(false)
    }
  }

  const handleToggleStatus = async () => {
    if (!statusTargetUser || !canFetch) return
    const nextStatus = statusTargetUser.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'

    setUpdatingStatus(true)
    try {
      const res = await fetch(`/api/admin/users/${statusTargetUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json()

      if (data.success) {
        addToast(`Kullanıcı durumu ${nextStatus === 'ACTIVE' ? 'aktif' : 'askıya alındı'} olarak güncellendi.`, 'success')
        setStatusTargetUser(null)
        loadUsers()
      } else {
        addToast(data.error || 'Kullanıcı durumu güncellenemedi.', 'error')
      }
    } catch {
      addToast('Sunucu bağlantı hatası oluştu.', 'error')
    } finally {
      setUpdatingStatus(false)
    }
  }

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = users.length
    const staffAndAdmins = users.filter((u) => u.role !== 'CUSTOMER').length
    const customers = users.filter((u) => u.role === 'CUSTOMER').length
    const active = users.filter((u) => u.status === 'ACTIVE').length
    return { total, staffAndAdmins, customers, active }
  }, [users])

  return (
    <div className={styles.container}>
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Kullanıcılar & Roller</h1>
          <p className={styles.subtitle}>
            Mağaza personeli, operasyon yöneticileri, destek ekipleri ve müşteri hesaplarının rol ve yetkilerini yönetin.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={loadUsers}
            disabled={loading}
            className={styles.secondaryButton}
          >
            {loading ? 'Yenileniyor...' : '↻ Listeyi Yenile'}
          </button>
        </div>
      </div>

      {/* ── METRIC CARDS ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div className={styles.card} style={{ padding: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Toplam Hesap
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 600, fontFamily: 'var(--font-mono)', marginTop: '0.25rem' }}>
            {metrics.total}
          </div>
        </div>

        <div className={styles.card} style={{ padding: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Yönetim & Personel
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 600, fontFamily: 'var(--font-mono)', marginTop: '0.25rem', color: 'var(--brand-blue, #2563eb)' }}>
            {metrics.staffAndAdmins}
          </div>
        </div>

        <div className={styles.card} style={{ padding: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Müşteri Hesapları
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 600, fontFamily: 'var(--font-mono)', marginTop: '0.25rem' }}>
            {metrics.customers}
          </div>
        </div>

        <div className={styles.card} style={{ padding: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Aktif Hesaplar
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 600, fontFamily: 'var(--font-mono)', marginTop: '0.25rem', color: '#10b981' }}>
            {metrics.active}
          </div>
        </div>
      </div>

      {/* ── FILTER & SEARCH TOOLBAR ─────────────────────────────────────────── */}
      <div className={styles.filterBar} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', flex: '1 1 280px' }}>
          <input
            type="text"
            placeholder="İsim veya e-posta ile ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.input}
            style={{ flex: 1 }}
          />
          <button type="submit" className={styles.secondaryButton}>
            Ara
          </button>
        </form>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className={styles.select}
          style={{ width: 'auto', minWidth: '180px' }}
        >
          <option value="ALL">Tüm Roller</option>
          <option value="SUPER_ADMIN">Süper Admin</option>
          <option value="ADMIN">Admin</option>
          <option value="ORDER_MANAGER">Sipariş Yöneticisi</option>
          <option value="CONTENT_MANAGER">İçerik Yöneticisi</option>
          <option value="SUPPORT">Müşteri Desteği</option>
          <option value="STAFF">Depo & Personel</option>
          <option value="CUSTOMER">Müşteri</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={styles.select}
          style={{ width: 'auto', minWidth: '140px' }}
        >
          <option value="ALL">Tüm Durumlar</option>
          <option value="ACTIVE">Aktif</option>
          <option value="SUSPENDED">Askıda</option>
          <option value="INACTIVE">Pasif</option>
        </select>
      </div>

      {/* ── USERS TABLE ─────────────────────────────────────────────────────── */}
      <div className={styles.card} style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Kullanıcı</th>
                <th>Rol</th>
                <th>Durum</th>
                <th>Siparişler</th>
                <th>Son Giriş</th>
                <th>Kayıt Tarihi</th>
                <th style={{ textAlign: 'right' }}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    Kullanıcılar yükleniyor...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    Arama kriterlerine uygun kullanıcı bulunamadı.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const roleConfig = getUserRoleConfig(u.role)
                  const initials = (u.name || u.email)
                    .split(' ')
                    .map((s) => s[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()

                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              backgroundColor: 'var(--surface-1)',
                              border: '1px solid var(--border)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              color: 'var(--text-secondary)',
                              flexShrink: 0,
                            }}
                          >
                            {initials}
                          </div>
                          <div>
                            <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                              {u.name || 'İsimsiz Kullanıcı'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              {u.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`${styles.badge} ${styles[roleConfig.badgeClass] || ''}`}>
                          {roleConfig.label}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`${styles.badge} ${
                            u.status === 'ACTIVE'
                              ? styles.badgeSuccess
                              : styles.badgeDanger
                          }`}
                        >
                          {u.status === 'ACTIVE' ? 'Aktif' : 'Askıda'}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                        {u.orderCount > 0 ? (
                          <span style={{ fontWeight: 600 }}>{u.orderCount} adet</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {new Date(u.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenRoleModal(u)}
                            className={styles.secondaryButton}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            Rol Değiştir
                          </button>
                          <button
                            type="button"
                            onClick={() => setStatusTargetUser(u)}
                            className={styles.secondaryButton}
                            style={{
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.75rem',
                              color: u.status === 'ACTIVE' ? '#ef4444' : '#10b981',
                            }}
                          >
                            {u.status === 'ACTIVE' ? 'Askıya Al' : 'Aktif Et'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── ROLE CHANGE MODAL (UI-16 GLOBAL MODAL) ─────────────────────────── */}
      {targetUser && (
        <Modal
          isOpen={Boolean(targetUser)}
          onClose={() => !updatingRole && setTargetUser(null)}
          ariaLabel="Rol Değiştirme Modalı"
          maxWidth={480}
        >
          <div style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Yetki Rolünü Güncelle
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              <strong>{targetUser.name || targetUser.email}</strong> hesabı için erişim seviyesi seçin.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {Object.entries(USER_ROLE_MAP).map(([roleKey, roleItem]) => {
                const isSelected = selectedRole === roleKey
                const isSuperAdminOption = roleKey === 'SUPER_ADMIN'
                const isCurrentSuperAdmin = currentAuthUser?.role === 'SUPER_ADMIN'

                return (
                  <label
                    key={roleKey}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.75rem',
                      padding: '0.75rem',
                      borderRadius: 'var(--radius, 6px)',
                      border: isSelected ? '1.5px solid var(--text-primary)' : '1px solid var(--border)',
                      backgroundColor: isSelected ? 'var(--surface-1)' : 'transparent',
                      cursor: isSuperAdminOption && !isCurrentSuperAdmin ? 'not-allowed' : 'pointer',
                      opacity: isSuperAdminOption && !isCurrentSuperAdmin ? 0.6 : 1,
                    }}
                  >
                    <input
                      type="radio"
                      name="userRole"
                      value={roleKey}
                      checked={isSelected}
                      disabled={isSuperAdminOption && !isCurrentSuperAdmin}
                      onChange={() => setSelectedRole(roleKey)}
                      style={{ marginTop: '0.2rem' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{roleItem.label}</span>
                        {isSuperAdminOption && (
                          <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '4px' }}>
                            Yüksek Yetki
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        {roleItem.description}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setTargetUser(null)}
                disabled={updatingRole}
                className={styles.secondaryButton}
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSaveRole}
                disabled={updatingRole || selectedRole === targetUser.role}
                className={styles.primaryButton}
              >
                {updatingRole ? 'Kaydediliyor...' : 'Rolü Güncelle'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── STATUS TOGGLE MODAL (UI-16 GLOBAL MODAL) ───────────────────────── */}
      {statusTargetUser && (
        <Modal
          isOpen={Boolean(statusTargetUser)}
          onClose={() => !updatingStatus && setStatusTargetUser(null)}
          ariaLabel="Durum Değiştirme Onayı"
          maxWidth={440}
        >
          <div style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              {statusTargetUser.status === 'ACTIVE' ? 'Hesabı Askıya Al' : 'Hesabı Aktifleştir'}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              <strong>{statusTargetUser.name || statusTargetUser.email}</strong> hesabını{' '}
              {statusTargetUser.status === 'ACTIVE'
                ? 'askıya almak istediğinize emin misiniz? Askıya alınan kullanıcı sisteme giriş yapamaz ve sipariş veremez.'
                : 'tekrar aktif hale getirmek istediğinize emin misiniz?'}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setStatusTargetUser(null)}
                disabled={updatingStatus}
                className={styles.secondaryButton}
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleToggleStatus}
                disabled={updatingStatus}
                className={statusTargetUser.status === 'ACTIVE' ? styles.dangerButton : styles.primaryButton}
                style={
                  statusTargetUser.status === 'ACTIVE'
                    ? { backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }
                    : undefined
                }
              >
                {updatingStatus ? 'İşleniyor...' : statusTargetUser.status === 'ACTIVE' ? 'Evet, Askıya Al' : 'Evet, Aktifleştir'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
