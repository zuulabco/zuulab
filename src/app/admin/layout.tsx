'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import AuthModal from '@/components/auth/AuthModal'
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
      { label: 'Kontrol Paneli', href: '/' },
      { label: 'Bugünün Özeti', href: '/today', tag: 'Öncelik' },
      { label: 'Siparişler', href: '/orders', tag: 'Aksiyon' },
      { label: 'Üretim Kuyruğu', href: '/production', tag: '3D Baskı' },
      { label: 'Kargo & Sevk', href: '/shipping' },
      { label: 'Stok Durumu', href: '/inventory', tag: 'Kritik' },
      { label: 'Hammadde & Sarf', href: '/materials', tag: 'Filament' },
    ],
  },
  {
    title: 'Katalog & Ürün',
    items: [
      { label: 'Ürün Listesi', href: '/products' },
      { label: 'Kategoriler', href: '/categories' },
      { label: 'Koleksiyonlar', href: '/collections' },
      { label: 'Ürün Ekonomisi & Kâr', href: '/economics', tag: 'Maliyet' },
    ],
  },
  {
    title: 'Müşteri & Satış',
    items: [
      { label: 'Müşteriler', href: '/customers' },
      { label: 'Kuponlar & İndirim', href: '/coupons' },
      { label: 'Ödemeler & İşlemler', href: '/payments' },
      { label: 'İadeler & Talepler', href: '/returns' },
      { label: 'Müşteri Yorumları', href: '/reviews' },
      { label: 'Destek Biletleri', href: '/support' },
    ],
  },
  {
    title: 'Vitrin & İçerik',
    items: [
      { label: 'Ana Sayfa Vitrini', href: '/content/homepage' },
      { label: 'Duyuru Bandı', href: '/content/announcement' },
      { label: 'Medya Kütüphanesi', href: '/content/media' },
    ],
  },
  {
    title: 'Pazaryeri & Sistem',
    items: [
      { label: 'Pazaryeri Siparişleri', href: '/marketplaces/orders', tag: 'Havuz' },
      { label: 'Pazaryerleri & Eşleme', href: '/marketplaces' },
      { label: 'e-Faturalar', href: '/invoices' },
      { label: 'Depo & Lojistik', href: '/warehouse', tag: 'İleri' },
      { label: 'Kullanıcılar & Roller', href: '/users', tag: 'RBAC' },
      { label: 'Bildirimler', href: '/notifications' },
      { label: 'Mağaza Ayarları', href: '/settings' },
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
  const { user, token, canFetch, devLogin, logout, openAuthModal, initAuthListener, checkSession } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any>(null)
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    let isCancelled = false
    setMounted(true)
    const unsubscribe = initAuthListener()

    // If an administrative user is already populated in store, don't show loading blocker
    if (
      user &&
      (user.role === 'ADMIN' ||
        user.role === 'SUPER_ADMIN' ||
        user.role === 'ORDER_MANAGER' ||
        user.role === 'CONTENT_MANAGER' ||
        user.role === 'SUPPORT' ||
        user.role === 'STAFF')
    ) {
      setIsCheckingSession(false)
      return () => unsubscribe()
    }

    // Verify cross-subdomain session cookie from .zuulab.com
    checkSession().finally(() => {
      if (!isCancelled) {
        setIsCheckingSession(false)
      }
    })

    return () => {
      isCancelled = true
      unsubscribe()
    }
  }, [initAuthListener, checkSession])

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
    if (!searchQuery.trim() || !canFetch) return
    setIsSearching(true)
    try {
      const headers: Record<string, string> = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      const res = await fetch(`/api/admin/search?q=${encodeURIComponent(searchQuery)}`, {
        headers,
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

  if (!mounted || isCheckingSession) {
    return (
      <div className={styles.gateContainer}>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Yetkilendirme kontrol ediliyor...</div>
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
    const isDev = process.env.NODE_ENV !== 'production'

    return (
      <>
        <div className={styles.gateContainer}>
          <div className={styles.gateCard}>
            <div style={{ fontSize: 24, marginBottom: 8, color: 'var(--text-muted)' }}>⬛</div>
            <div className={styles.adminBadge}>Erişim Kısıtlı</div>
            <h2 className={styles.gateTitle}>Zuulab Yönetim Portalı</h2>
            <p className={styles.gateDesc}>
              {user
                ? 'Mevcut hesabınızın bu alana erişim yetkisi bulunmamaktadır. Lütfen yetkili bir yönetici hesabıyla giriş yapın.'
                : 'Bu alana yalnızca yetkili yöneticiler ve mağaza personeli erişebilir.'}
            </p>

            <button
              className={styles.gateBtn}
              onClick={() => openAuthModal()}
            >
              Yönetici Girişi Yap
            </button>

            {isDev && (
              <button
                className={styles.gateSecondaryBtn}
                onClick={() => devLogin('ADMIN')}
                style={{ marginTop: 8 }}
              >
                Geliştirici Girişi (Admin Dev)
              </button>
            )}

            <div style={{ marginTop: 20 }}>
              <a href="https://zuulab.com" style={{ color: 'var(--text-muted)', fontSize: 12, textDecoration: 'none' }}>
                Mağazaya dön
              </a>
            </div>
          </div>
        </div>
        <AuthModal />
      </>
    )
  }

  const normalizedCurrentPath = pathname.replace(/^\/admin/, '') || '/'

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
          <Link href="/" className={styles.brandLink}>
            <span className={styles.brandLogo}>zuulab</span>
            <span className={styles.brandDot} aria-hidden />
            <span className={styles.adminBadge}>dashboard</span>
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
                const itemCleanHref = item.href.replace(/^\/admin/, '') || '/'
                const isActive =
                  itemCleanHref === '/'
                    ? normalizedCurrentPath === '/'
                    : normalizedCurrentPath === itemCleanHref || normalizedCurrentPath.startsWith(`${itemCleanHref}/`)

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
          <a href="https://zuulab.com" className={styles.storeBackLink} target="_blank" rel="noopener noreferrer">
            <span>↗</span>
            <span>Mağazaya Dön</span>
          </a>
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
              <Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>zuulab</Link>
              <span>/</span>
              <span className={styles.breadcrumbActive}>
                {normalizedCurrentPath.replace(/^\//, '') || 'özet'}
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
                        href={`/orders/${o.orderNumber}`}
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
                        href={`/products/${p.id}`}
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
      <AuthModal />
    </div>
  )
}
