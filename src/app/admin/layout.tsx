'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import styles from './admin.module.css'

interface NavSection {
  title: string
  items: {
    label: string
    href: string
    tag?: string
  }[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Operasyon',
    items: [
      { label: 'Kontrol Paneli', href: '/admin' },
      { label: 'Bugünün Özeti', href: '/admin/today', tag: 'Öncelik' },
      { label: 'Siparişler', href: '/admin/orders', tag: 'Aksiyon' },
      { label: 'Üretim Kuyruğu', href: '/admin/production', tag: '3D Baskı' },
      { label: 'Kargo & Sevk', href: '/admin/shipping' },
      { label: 'Stok Durumu', href: '/admin/inventory', tag: 'Kritik' },
      { label: 'Hammadde & Sarf', href: '/admin/materials', tag: 'Filament' },
    ],
  },
  {
    title: 'Katalog & Ürün',
    items: [
      { label: 'Ürün Listesi', href: '/admin/products' },
      { label: 'Kategoriler', href: '/admin/categories' },
      { label: 'Koleksiyonlar', href: '/admin/collections' },
      { label: 'Ürün Ekonomisi & Kâr', href: '/admin/economics', tag: 'Maliyet' },
    ],
  },
  {
    title: 'Müşteri & Satış',
    items: [
      { label: 'Müşteriler', href: '/admin/customers' },
      { label: 'Kuponlar & İndirim', href: '/admin/coupons' },
      { label: 'Ödemeler & İşlemler', href: '/admin/payments' },
      { label: 'İadeler & Talepler', href: '/admin/returns' },
      { label: 'Müşteri Yorumları', href: '/admin/reviews' },
      { label: 'Destek Biletleri', href: '/admin/support' },
    ],
  },
  {
    title: 'Vitrin & İçerik',
    items: [
      { label: 'Ana Sayfa Vitrini', href: '/admin/content/homepage' },
      { label: 'Duyuru Bandı', href: '/admin/content/announcement' },
      { label: 'Medya Kütüphanesi', href: '/admin/content/media' },
    ],
  },
  {
    title: 'Pazaryeri & Sistem',
    items: [
      { label: 'Pazaryeri Siparişleri', href: '/admin/marketplaces/orders', tag: 'Havuz' },
      { label: 'Pazaryerleri & Eşleme', href: '/admin/marketplaces' },
      { label: 'e-Faturalar', href: '/admin/invoices' },
      { label: 'Depo & Lojistik', href: '/admin/warehouse', tag: 'İleri' },
      { label: 'Kullanıcılar & Roller', href: '/admin/users', tag: 'RBAC' },
      { label: 'Bildirimler', href: '/admin/notifications' },
      { label: 'Mağaza Ayarları', href: '/admin/settings' },
    ],
  },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, token, devLogin, logout, openAuthModal } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any>(null)
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Auto-close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  // Close mobile drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleGlobalSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim() || !token) return
    setIsSearching(true)
    try {
      const res = await fetch(`/api/admin/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setSearchResults(data)
      }
    } catch {
    } finally {
      setIsSearching(false)
    }
  }

  if (!mounted) {
    return (
      <div className={styles.gateContainer}>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Yükleniyor...</div>
      </div>
    )
  }

  // Access check: User must have administrative privileges
  const isAdmin =
    user &&
    (user.role === 'ADMIN' ||
      user.role === 'SUPER_ADMIN' ||
      user.role === 'ORDER_MANAGER' ||
      user.role === 'CONTENT_MANAGER' ||
      user.role === 'SUPPORT' ||
      user.role === 'STAFF')

  if (!isAdmin) {
    return (
      <div className={styles.gateContainer}>
        <div className={styles.gateCard}>
          <div style={{ fontSize: 24, marginBottom: 8, color: 'var(--text-muted)' }}>⬛</div>
          <div className={styles.adminBadge}>Erişim Kısıtlı</div>
          <h2 className={styles.gateTitle}>Zuulab Yönetim Portalı</h2>
          <p className={styles.gateDesc}>
            Bu alana yalnızca yetkili yöneticiler ve mağaza personeli erişebilir.
          </p>

          <button
            className={styles.gateBtn}
            onClick={() => devLogin('ADMIN')}
          >
            Yönetici Olarak Giriş Yap (Admin Dev)
          </button>

          <button
            className={styles.gateSecondaryBtn}
            onClick={() => openAuthModal()}
          >
            Farklı Hesapla Giriş Yap
          </button>

          <div style={{ marginTop: 20 }}>
            <Link href="/" style={{ color: 'var(--text-muted)', fontSize: 12, textDecoration: 'none' }}>
              Mağazaya dön
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.adminContainer}>
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className={styles.sidebarBackdrop}
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${mobileMenuOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <Link href="/admin" className={styles.brandLink}>
            <span className={styles.brandLogo}>zuulab</span>
            <span className={styles.brandDot} aria-hidden />
            <span className={styles.adminBadge}>admin</span>
          </Link>
          {mobileMenuOpen && (
            <button
              onClick={() => setMobileMenuOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 18,
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: 4,
              }}
              aria-label="Menüyü Kapat"
            >
              ✕
            </button>
          )}
        </div>

        <nav className={styles.sidebarNav}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              <div className={styles.navSectionTitle}>{section.title}</div>
              {section.items.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                  >
                    <span>{item.label}</span>
                    {item.tag && <span className={styles.navItemTag}>{item.tag}</span>}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <Link href="/" className={styles.storeBackLink}>
            <span>↗</span>
            <span>Mağazaya Dön</span>
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={styles.mainWrapper}>
        <header className={styles.topbar}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button
              className={styles.mobileMenuToggle}
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Menüyü Aç/Kapat"
            >
              ☰
            </button>

            <div className={styles.breadcrumb}>
              <Link href="/admin" style={{ color: 'inherit', textDecoration: 'none' }}>zuulab</Link>
              <span>/</span>
              <span className={styles.breadcrumbActive}>
                {pathname.replace('/admin', '').replace(/^\//, '') || 'özet'}
              </span>
            </div>
          </div>

          {/* Quick Search */}
          <form onSubmit={handleGlobalSearch} style={{ position: 'relative', width: 260 }}>
            <input
              type="text"
              placeholder="Hızlı ara: sipariş, ürün, müşteri..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input input-sm"
              style={{ borderRadius: 'var(--radius-full)' }}
            />
            {searchResults && (
              <div
                style={{
                  position: 'absolute',
                  top: '120%',
                  right: 0,
                  width: 300,
                  background: 'var(--surface-0)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: 12,
                  zIndex: 200,
                  boxShadow: 'var(--shadow-lg)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                  <span>Arama Sonuçları</span>
                  <button type="button" onClick={() => setSearchResults(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11 }}>✕</button>
                </div>
                {searchResults.orders?.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 4 }}>Siparişler</div>
                    {searchResults.orders.map((o: any) => (
                      <Link
                        key={o.orderNumber}
                        href={`/admin/orders/${o.orderNumber}`}
                        onClick={() => setSearchResults(null)}
                        style={{ display: 'block', fontSize: 12, color: 'var(--text-primary)', textDecoration: 'none', padding: '4px 0' }}
                      >
                        #{o.orderNumber} · {o.customerName} (₺{o.total})
                      </Link>
                    ))}
                  </div>
                )}
                {searchResults.products?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 4 }}>Ürünler</div>
                    {searchResults.products.map((p: any) => (
                      <Link
                        key={p.id}
                        href={`/admin/products/${p.id}`}
                        onClick={() => setSearchResults(null)}
                        style={{ display: 'block', fontSize: 12, color: 'var(--text-primary)', textDecoration: 'none', padding: '4px 0' }}
                      >
                        {p.name} (Stok: {p.stock})
                      </Link>
                    ))}
                  </div>
                )}
                {(!searchResults.orders?.length && !searchResults.products?.length) && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>Sonuç bulunamadı.</div>
                )}
              </div>
            )}
          </form>

          <div className={styles.topbarRight}>
            <div className={styles.adminUserInfo}>
              <div className={styles.userActiveDot} />
              <span className={styles.userName}>{user.name || user.email}</span>
              <span className={styles.roleTag}>{user.role}</span>
            </div>

            <button
              className={styles.logoutBtn}
              onClick={() => {
                logout()
                router.push('/')
              }}
            >
              Çıkış
            </button>
          </div>
        </header>

        <main className={styles.contentArea}>{children}</main>
      </div>
    </div>
  )
}
