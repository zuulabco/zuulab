'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { DASHBOARD_URL } from '@/lib/config/urls'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import CartButton from './CartButton'
import SearchBar from './SearchBar'
import AuthModal from '@/components/auth/AuthModal'
import CartDrawer from '@/components/cart/CartDrawer'
import CollectionMicroMotion from './CollectionMicroMotion'
import { useAuthStore } from '@/store/authStore'
import { ALL_CATEGORIES } from '@/config/categories'
import { ALL_COLLECTIONS } from '@/config/collections'
import styles from './Header.module.css'

const DIRECT_COLLECTIONS = [
  { label: 'zuukids', href: '/koleksiyon/zuukids', slug: 'zuukids', accent: true },
  { label: 'zuulife', href: '/koleksiyon/zuulife', slug: 'zuulife' },
  { label: 'zuulight', href: '/koleksiyon/zuulight', slug: 'zuulight' },
  { label: 'zuutoptan', href: '/koleksiyon/zuutoptan', slug: 'zuutoptan' },
]

export default function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeDropdown, setActiveDropdown] = useState<'urunler' | null>(null)
  const [mobileCategoriesOpen, setMobileCategoriesOpen] = useState(false)
  const [mobileCollectionsOpen, setMobileCollectionsOpen] = useState(false)

  const pathname = usePathname()
  const mobileMenuRef = useRef<HTMLElement>(null)
  const menuToggleRef = useRef<HTMLButtonElement>(null)
  const dropdownTimerRef = useRef<NodeJS.Timeout | null>(null)

  const handleDropdownEnter = () => {
    if (dropdownTimerRef.current) clearTimeout(dropdownTimerRef.current)
    setActiveDropdown('urunler')
  }

  const handleDropdownLeave = () => {
    if (dropdownTimerRef.current) clearTimeout(dropdownTimerRef.current)
    dropdownTimerRef.current = setTimeout(() => {
      setActiveDropdown(null)
    }, 240)
  }

  const { user, openAuthModal, logout } = useAuthStore()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
    setActiveDropdown(null)
  }, [pathname])

  // Close mobile menu / mega menu on Escape + return focus to toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeDropdown) {
          setActiveDropdown(null)
        }
        if (mobileOpen) {
          setMobileOpen(false)
          menuToggleRef.current?.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen, activeDropdown])

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const isCheckout = pathname === '/odeme'

  if (isCheckout) {
    return (
      <header className={`${styles.header} ${styles.checkoutHeader}`} role="banner">
        <div className={`container ${styles.checkoutInner}`}>
          <div className={styles.checkoutLeft}>
            <Link href="/" className={styles.logo} aria-label="zuulab ana sayfa">
              <span className={styles.logoText}>zuulab</span>
              <span className={styles.logoDot} aria-hidden />
            </Link>
            <div className={styles.checkoutDivider} aria-hidden />
            <span className={styles.checkoutTag}>güvenli ödeme</span>
          </div>

          <div className={styles.checkoutRight}>
            <div className={styles.checkoutTrust}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>256-bit ssl · 3d secure</span>
            </div>
            <Link href="/sepet" className={styles.checkoutBackLink}>
              <span aria-hidden="true">←</span>
              <span>sepetim</span>
            </Link>
          </div>
        </div>
      </header>
    )
  }

  return (
    <>
      <header
        className={`${styles.header} ${scrolled ? styles.scrolled : ''}`}
        role="banner"
      >
        <div className={`container ${styles.inner}`}>
          {/* Logo */}
          <Link href="/" className={styles.logo} aria-label="zuulab ana sayfa">
            <span className={styles.logoText}>zuulab</span>
            <span className={styles.logoDot} aria-hidden />
          </Link>

          {/* Desktop nav */}
          <nav className={styles.nav} aria-label="Ana Menü">
            {/* 1. Ürünler with Kategori Mega Menu */}
            <div
              className={styles.megaMenuWrap}
              onMouseEnter={handleDropdownEnter}
              onMouseLeave={handleDropdownLeave}
            >
              <Link
                href="/urunler"
                className={`${styles.navLink} ${styles.navLinkWithArrow} ${
                  pathname === '/urunler' || pathname.startsWith('/kategori')
                    ? styles.navLinkActive
                    : ''
                }`}
                aria-expanded={activeDropdown === 'urunler'}
                aria-haspopup="true"
                onClick={() => setActiveDropdown(null)}
              >
                <span>ürünler</span>
                <span className={styles.megaMenuChevron}>
                  <ChevronDownIcon open={activeDropdown === 'urunler'} />
                </span>
              </Link>

              {activeDropdown === 'urunler' && (
                <div
                  className={styles.megaMenuDropdown}
                  role="region"
                  aria-label="Ürün Kategorileri"
                >
                  <div className={styles.megaMenuInner}>
                    {/* ── Kategoriler (2 Sütunlu Grid) ───────── */}
                    <div className={styles.megaMenuSection}>
                      <div className={styles.megaMenuSectionHeader}>
                        <span className={styles.megaMenuSectionLabel}>Kategoriler</span>
                        <span className={styles.megaMenuSectionCount}>({ALL_CATEGORIES.length})</span>
                      </div>
                      <ul className={styles.megaMenuCatList} role="list">
                        {ALL_CATEGORIES.map((cat) => (
                          <li key={cat.slug} className={styles.megaMenuCatItem}>
                            <Link
                              href={`/kategori/${cat.slug}`}
                              className={`${styles.megaMenuCatLink} ${
                                pathname?.startsWith(`/kategori/${cat.slug}`) ? styles.megaMenuCatLinkActive : ''
                              }`}
                              onClick={() => setActiveDropdown(null)}
                            >
                              <span className={styles.catLinkName}>{cat.name}</span>
                              <span className={styles.catArrow} aria-hidden>→</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                      <div className={styles.catFooterHint}>
                        tüm formlar atölyemizde hassas 3d üretimle şekillenir
                      </div>
                    </div>

                    {/* ── Divider ───────────────────────────── */}
                    <div className={styles.megaMenuDividerV} aria-hidden />

                    {/* ── Koleksiyonlar ── */}
                    <div className={`${styles.megaMenuSection} ${styles.megaMenuSectionCols}`}>
                      <div className={styles.megaMenuSectionHeader}>
                        <span className={styles.megaMenuSectionLabel}>Koleksiyonlar</span>
                        <span className={styles.megaMenuSectionCount}>({ALL_COLLECTIONS.length})</span>
                      </div>
                      <ul className={styles.megaMenuColList} role="list">
                        {ALL_COLLECTIONS.map((col) => (
                          <li key={col.slug} className={styles.megaMenuColItem}>
                            <Link
                              href={`/koleksiyon/${col.slug}`}
                              className={styles.megaMenuColLink}
                              onClick={() => setActiveDropdown(null)}
                            >
                              <div className={styles.megaMenuColThumbWrap}>
                                <Image
                                  src={col.heroImage}
                                  alt={col.name}
                                  width={36}
                                  height={36}
                                  className={styles.megaMenuColThumb}
                                />
                              </div>
                              <div className={styles.megaMenuColBody}>
                                <div className={styles.megaMenuColTitleRow}>
                                  <span className={styles.megaMenuColName}>{col.name}</span>
                                  {col.accentColor && (
                                    <span
                                      className={styles.colAccentPill}
                                      style={{ backgroundColor: col.accentColor }}
                                      aria-hidden
                                    />
                                  )}
                                </div>
                                <p className={styles.megaMenuColDesc}>{col.tagline}</p>
                              </div>
                              <span className={styles.megaMenuColArrow} aria-hidden>→</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                      <Link
                        href="/koleksiyonlar"
                        className={styles.colFooterLink}
                        onClick={() => setActiveDropdown(null)}
                      >
                        <span>tüm koleksiyon dünyalarını keşfet</span>
                        <span aria-hidden>→</span>
                      </Link>
                    </div>
                  </div>

                  {/* ── Bottom CTA strip ──────────────────── */}
                  <div className={styles.megaMenuBottomBar}>
                    <div className={styles.megaMenuBottomNote}>
                      <span className={styles.bottomDot} aria-hidden />
                      <span>istanbul atölyemizde hassas katmanlı 3d üretim · biyo-bozunur pla</span>
                    </div>
                    <Link
                      href="/urunler"
                      className={styles.megaMenuBottomLink}
                      onClick={() => setActiveDropdown(null)}
                    >
                      <span>tüm ürünleri keşfet</span>
                      <span aria-hidden>→</span>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Direct collection links (zuukids with micro-motion, others clean) */}
            {DIRECT_COLLECTIONS.map((link) => {
              const isColActive = pathname === link.href
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`${styles.navLink} ${styles.navLinkCollection} ${
                    link.accent ? styles.navLinkAccent : ''
                  } ${isColActive ? styles.navLinkActive : ''}`}
                >
                  <span className={styles.navLinkLabel}>{link.label}</span>
                  {link.slug === 'zuukids' && <CollectionMicroMotion slug="zuukids" />}
                </Link>
              )
            })}

            {/* 3. Koleksiyonlar - Direct navigation link to /koleksiyonlar */}
            <Link
              href="/koleksiyonlar"
              className={`${styles.navLink} ${styles.navLinkCollection} ${
                pathname === '/koleksiyonlar' ? styles.navLinkActive : ''
              }`}
            >
              <span className={styles.navLinkLabel}>koleksiyonlar</span>
            </Link>
          </nav>

          {/* Actions */}
          <div className={styles.actions}>
            <SearchBar />

            <Link
              href="/hesap/favoriler"
              className={`btn btn-ghost btn-icon ${styles.actionBtn}`}
              aria-label="Favorilerim"
            >
              <HeartIcon />
            </Link>

            {/* Admin Badge if admin */}
            {user && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && (
              <a
                href={DASHBOARD_URL}
                className={styles.adminBadgeLink}
                title="Yönetim Paneli"
              >
                admin
              </a>
            )}

            {/* Account trigger */}
            {user ? (
              <Link
                href="/hesap"
                className={`btn btn-ghost btn-icon ${styles.actionBtn}`}
                aria-label={`Hesabım (${user.name || user.email})`}
                title={user.name || user.email}
              >
                <UserIcon />
              </Link>
            ) : (
              <button
                type="button"
                className={`btn btn-ghost btn-icon ${styles.actionBtn}`}
                onClick={openAuthModal}
                aria-label="Giriş yap veya üye ol"
                title="Giriş Yap"
              >
                <UserIcon />
              </button>
            )}

            <CartButton />

            {/* Mobile menu toggle */}
            <button
              ref={menuToggleRef}
              className={`btn btn-ghost btn-icon ${styles.menuToggle}`}
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Menüyü kapat' : 'Menüyü aç'}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
            >
              {mobileOpen ? <XIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="overlay"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Mobile menu drawer */}
      <nav
        id="mobile-menu"
        ref={mobileMenuRef}
        className={`${styles.mobileMenu} ${mobileOpen ? styles.mobileMenuOpen : ''}`}
        aria-label="Mobil Menü"
        aria-hidden={!mobileOpen}
      >
        <div className={styles.mobileInner}>
          <div className={styles.mobileLogoRow}>
            <span className={styles.mobileLogoText}>zuulab</span>
            <span className={styles.logoDot} aria-hidden />
          </div>

          <div className={styles.mobileDivider} />

          {/* Main nav */}
          <div className={styles.mobileNavSection}>
            <p className={styles.mobileNavLabel}>ürün kataloğu</p>

            <Link
              href="/urunler"
              className={styles.mobileNavLink}
              tabIndex={mobileOpen ? 0 : -1}
              onClick={() => setMobileOpen(false)}
            >
              tüm ürünleri keşfet →
            </Link>

            {/* Mobile Categories Accordion */}
            <button
              type="button"
              className={styles.mobileAccordionBtn}
              onClick={() => setMobileCategoriesOpen((v) => !v)}
              aria-expanded={mobileCategoriesOpen}
            >
              <span>kategoriler ({ALL_CATEGORIES.length})</span>
              <ChevronDownIcon open={mobileCategoriesOpen} />
            </button>

            {mobileCategoriesOpen && (
              <div className={styles.mobileSubList}>
                {ALL_CATEGORIES.map((cat) => (
                  <Link
                    key={cat.slug}
                    href={`/kategori/${cat.slug}`}
                    className={styles.mobileSubNavLink}
                    onClick={() => setMobileOpen(false)}
                    tabIndex={mobileOpen ? 0 : -1}
                  >
                    {cat.name}
                  </Link>
                ))}
              </div>
            )}

            {/* Mobile Collections Accordion */}
            <button
              type="button"
              className={styles.mobileAccordionBtn}
              onClick={() => setMobileCollectionsOpen((v) => !v)}
              aria-expanded={mobileCollectionsOpen}
            >
              <span>koleksiyonlar ({ALL_COLLECTIONS.length})</span>
              <ChevronDownIcon open={mobileCollectionsOpen} />
            </button>

            {mobileCollectionsOpen && (
              <div className={styles.mobileSubList}>
                <Link
                  href="/koleksiyonlar"
                  className={styles.mobileSubNavLink}
                  style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}
                  onClick={() => setMobileOpen(false)}
                  tabIndex={mobileOpen ? 0 : -1}
                >
                  tüm koleksiyonları keşfet →
                </Link>
                {ALL_COLLECTIONS.map((col) => (
                  <Link
                    key={col.slug}
                    href={`/koleksiyon/${col.slug}`}
                    className={styles.mobileSubNavLink}
                    onClick={() => setMobileOpen(false)}
                    tabIndex={mobileOpen ? 0 : -1}
                  >
                    {col.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className={styles.mobileDivider} />

          {/* Account nav */}
          <div className={styles.mobileNavSection}>
            <p className={styles.mobileNavLabel}>hesap</p>
            {user ? (
              <>
                <p className={styles.mobileUserBadge}>
                  {user.name || user.email}
                  {user.role === 'ADMIN' && <span className={styles.adminTag}> (admin)</span>}
                </p>
                {user.role === 'ADMIN' && (
                  <a href={DASHBOARD_URL} className={styles.mobileNavLinkSm} tabIndex={mobileOpen ? 0 : -1}>
                    yönetim paneli
                  </a>
                )}
                <Link href="/hesap" className={styles.mobileNavLinkSm} tabIndex={mobileOpen ? 0 : -1}>
                  hesabım
                </Link>
                <Link href="/hesap/siparisler" className={styles.mobileNavLinkSm} tabIndex={mobileOpen ? 0 : -1}>
                  siparişlerim
                </Link>
                <Link href="/hesap/favoriler" className={styles.mobileNavLinkSm} tabIndex={mobileOpen ? 0 : -1}>
                  favorilerim
                </Link>
                <button
                  type="button"
                  className={styles.mobileLogoutBtn}
                  onClick={() => {
                    logout()
                    setMobileOpen(false)
                  }}
                  tabIndex={mobileOpen ? 0 : -1}
                >
                  çıkış yap
                </button>
              </>
            ) : (
              <button
                type="button"
                className={styles.mobileLoginBtn}
                onClick={() => {
                  setMobileOpen(false)
                  openAuthModal()
                }}
                tabIndex={mobileOpen ? 0 : -1}
              >
                giriş yap / üye ol
              </button>
            )}
            <Link href="/sepet" className={styles.mobileNavLinkSm} tabIndex={mobileOpen ? 0 : -1}>
              sepetim
            </Link>
          </div>

          <div className={styles.mobileDivider} />

          {/* Brand footer — one warm, quiet moment */}
          <p className={styles.mobileMeta}>
            <span className={styles.mobileMetaDot} aria-hidden />
            <span>tüm formlar atölyemizde hassas 3d üretimle hayat bulur.</span>
          </p>
        </div>
      </nav>

      {/* Global Auth Modal */}
      <AuthModal />

      {/* Global Mini-Cart Drawer */}
      <CartDrawer />
    </>
  )
}

function HeartIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <line x1="3" y1="8" x2="21" y2="8" />
      <line x1="3" y1="16" x2="21" y2="16" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function ChevronDownIcon({ open }: { open?: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform 0.2s ease',
      }}
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
