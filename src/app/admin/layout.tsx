'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import AuthModal from '@/components/auth/AuthModal'
import styles from './admin.module.css'
import AdminIcon from './AdminIcon'
import { Skeleton, SkeletonPage } from '@/components/common/Skeleton'

interface NavItem {
  label: string
  href: string
  icon: string
}

interface NavSection {
  id: string
  /** No title: always shown, not collapsible */
  title?: string
  /** Collapsed until opened (rarely used groups) */
  collapsedByDefault?: boolean
  items: NavItem[]
}

/**
 * Admin navigation, grouped by the job being done. Labels say what the page is,
 * in sentence case; no decorative tags.
 */
const NAV_SECTIONS: NavSection[] = [
  {
    id: 'general',
    items: [
      { label: 'Kontrol paneli', href: '/', icon: 'home' },
      { label: 'Bugün', href: '/today', icon: 'today' },
    ],
  },
  {
    id: 'sales',
    title: 'Satış',
    items: [
      { label: 'Siparişler', href: '/orders', icon: 'orders' },
      { label: 'İadeler', href: '/returns', icon: 'returns' },
      { label: 'Ödemeler', href: '/payments', icon: 'payments' },
      { label: 'Kuponlar', href: '/coupons', icon: 'coupons' },
      { label: 'Kampanyalar', href: '/campaigns', icon: 'megaphone' },
    ],
  },
  {
    id: 'catalog',
    title: 'Katalog',
    items: [
      { label: 'Ürünler', href: '/products', icon: 'products' },
      { label: 'Kategoriler', href: '/categories', icon: 'categories' },
      { label: 'Koleksiyonlar', href: '/collections', icon: 'collections' },
      { label: 'Yorumlar', href: '/reviews', icon: 'reviews' },
    ],
  },
  {
    id: 'stock',
    title: 'Stok ve üretim',
    items: [
      { label: 'Envanter', href: '/inventory', icon: 'inventory' },
      { label: 'Malzemeler', href: '/inventory/materials', icon: 'swatch' },
      { label: 'Üretim', href: '/production', icon: 'production' },
      { label: 'Filament', href: '/materials', icon: 'filament' },
    ],
  },
  {
    id: 'marketplaces',
    title: 'Pazaryerleri',
    items: [
      { label: 'Pazaryeri siparişleri', href: '/marketplaces/orders', icon: 'inbox' },
      { label: 'Ürün eşleştirme', href: '/marketplaces/mappings', icon: 'link' },
      { label: 'Mağazalar', href: '/marketplaces', icon: 'store' },
    ],
  },
  {
    id: 'customers',
    title: 'Müşteriler',
    items: [
      { label: 'Müşteriler', href: '/customers', icon: 'customers' },
      { label: 'Destek talepleri', href: '/support', icon: 'support' },
    ],
  },
  {
    id: 'fulfilment',
    title: 'Kargo ve fatura',
    items: [
      { label: 'Kargo', href: '/shipping', icon: 'shipping' },
      { label: 'e-Faturalar', href: '/invoices', icon: 'invoices' },
    ],
  },
  {
    id: 'content',
    title: 'Vitrin',
    collapsedByDefault: true,
    items: [
      { label: 'Ana sayfa', href: '/content/homepage', icon: 'layout' },
      { label: 'Duyuru bandı', href: '/content/announcement', icon: 'announcement' },
      { label: 'Sosyal medya', href: '/content/social', icon: 'share' },
      { label: 'Medya', href: '/content/media', icon: 'media' },
    ],
  },
  {
    id: 'system',
    title: 'Sistem',
    collapsedByDefault: true,
    items: [
      { label: 'Kullanıcılar ve roller', href: '/users', icon: 'users' },
      { label: 'Bildirimler', href: '/notifications', icon: 'notifications' },
      { label: 'Ayarlar', href: '/settings', icon: 'settings' },
    ],
  },
]

/** The nav item a path belongs to: the longest matching href wins (/marketplaces/orders over /marketplaces). */
function activeItemFor(path: string): { section: NavSection; item: NavItem } | null {
  let best: { section: NavSection; item: NavItem } | null = null
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      const matches = item.href === '/' ? path === '/' : path === item.href || path.startsWith(`${item.href}/`)
      if (matches && (!best || item.href.length > best.item.href.length)) best = { section, item }
    }
  }
  return best
}

const NAV_STATE_KEY = 'zuulab-admin-nav'

/**
 * Modules switched off for this business (sells from stock, small catalog): their
 * pages still exist in the code but show this notice instead of sample data.
 */
const DISABLED_MODULES = ['/warehouse', '/economics']

function isDisabledModule(path: string): boolean {
  return DISABLED_MODULES.some((m) => path === m || path.startsWith(`${m}/`))
}

function DisabledModuleNotice() {
  return (
    <div style={{ maxWidth: 560, margin: '48px auto', padding: 24, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-0)' }}>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Bu modül kullanılmıyor</h2>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
        Depo (raf/konum, toplama, koli, el terminali, etiket yazıcı) ve ürün ekonomisi modülleri bu işletme için
        kapatıldı; gösterecekleri veriler gerçek değildi. Stok için <a href="/inventory">Envanter</a>, üretim için{' '}
        <a href="/production">Üretim</a>, sipariş hazırlama için <a href="/orders">Siparişler</a> sayfalarını kullanın.
      </p>
    </div>
  )
}

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
  // True only after the server confirmed the current user (role from the database).
  const [serverVerified, setServerVerified] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  // Which nav groups the admin opened or closed (remembered in this browser).
  const [navState, setNavState] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      return JSON.parse(localStorage.getItem(NAV_STATE_KEY) || '{}') as Record<string, boolean>
    } catch {
      return {}
    }
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any>(null)
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    let isCancelled = false
    setMounted(true)
    const unsubscribe = initAuthListener()

    // Always ask the server who this is (session cookie or token, role read from the
    // database). The user persisted in localStorage is never trusted for access: it
    // can be stale (role revoked) or edited by hand.
    checkSession()
      .then((verified) => {
        if (!isCancelled && verified) setServerVerified(true)
      })
      .finally(() => {
        if (!isCancelled) {
          setIsCheckingSession(false)
        }
      })

    return () => {
      isCancelled = true
      unsubscribe()
    }
  }, [initAuthListener, checkSession])

  // A sign-in from the gate's modal changes `user`; confirm it with the server too.
  useEffect(() => {
    if (isCheckingSession || serverVerified || !user) return
    let isCancelled = false
    checkSession().then((verified) => {
      if (!isCancelled && verified) setServerVerified(true)
    })
    return () => {
      isCancelled = true
    }
  }, [user, isCheckingSession, serverVerified, checkSession])

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
      // The admin shell's shape while the session is checked, so the page doesn't jump.
      <div className={styles.adminContainer} aria-busy="true" aria-label="Oturum kontrol ediliyor">
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <span className={styles.brandLogo}>zuulab</span>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} height={12} width={`${55 + (i % 4) * 10}%`} />
            ))}
          </div>
        </aside>
        <div className={styles.mainWrapper}>
          <div className={styles.topbar} />
          <main className={styles.contentArea}>
            <SkeletonPage />
          </main>
        </div>
      </div>
    )
  }

  // Access check: User must have administrative privileges
  const isAdmin =
    serverVerified &&
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
  const active = activeItemFor(normalizedCurrentPath)
  const isSectionOpen = (section: NavSection) =>
    !section.title || section.id === active?.section.id || (navState[section.id] ?? !section.collapsedByDefault)
  const toggleSection = (id: string, open: boolean) => {
    setNavState((prev) => {
      const next = { ...prev, [id]: !open }
      try {
        localStorage.setItem(NAV_STATE_KEY, JSON.stringify(next))
      } catch {
        // storage unavailable: the choice just isn't remembered
      }
      return next
    })
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
          <Link href="/" className={styles.brandLink}>
            <span className={styles.brandLogo}>zuulab</span>
            <span className={styles.brandDot} aria-hidden />
            <span className={styles.adminBadge}>dashboard</span>
          </Link>
          {mobileMenuOpen && (
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Menüyü kapat"
            >
              <AdminIcon name="close" />
            </button>
          )}
        </div>

        <nav className={styles.sidebarNav} aria-label="Yönetim menüsü">
          {NAV_SECTIONS.map((section) => {
            const open = isSectionOpen(section)
            return (
              <div key={section.id} className={styles.navSection}>
                {section.title && (
                  <button
                    type="button"
                    className={styles.navSectionTitle}
                    aria-expanded={open}
                    aria-controls={`nav-${section.id}`}
                    onClick={() => toggleSection(section.id, open)}
                    disabled={section.id === active?.section.id}
                  >
                    <span>{section.title}</span>
                    <span className={`${styles.navChevron} ${open ? styles.navChevronOpen : ''}`}>
                      <AdminIcon name="chevron" size={14} />
                    </span>
                  </button>
                )}
                {open && (
                  <div id={`nav-${section.id}`} className={styles.navItems}>
                    {section.items.map((item) => {
                      const isActive = active?.item.href === item.href
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <AdminIcon name={item.icon} />
                          <span>{item.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <a href="https://www.zuulab.com" className={styles.storeBackLink} target="_blank" rel="noopener noreferrer">
            <AdminIcon name="external" size={16} />
            <span>Mağazayı aç</span>
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
              aria-label="Menüyü aç"
              aria-expanded={mobileMenuOpen}
            >
              <AdminIcon name="menu" size={20} />
            </button>

            <div className={styles.breadcrumb}>
              {active?.section.title && <span>{active.section.title}</span>}
              {active?.section.title && <span aria-hidden="true">/</span>}
              <span className={styles.breadcrumbActive}>{active?.item.label ?? 'Yönetim'}</span>
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
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 4 }}>Siparişler</div>
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
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 4 }}>Ürünler</div>
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

        <main className={styles.contentArea}>
          {isDisabledModule(normalizedCurrentPath) ? <DisabledModuleNotice /> : children}
        </main>
      </div>
      <AuthModal />
    </div>
  )
}
