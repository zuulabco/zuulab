'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import { useAuthStore } from '@/store/authStore'
import type { ProductListItem } from '@/types/product'
import ProductCard from '@/components/home/ProductCard'
import AccountNav from '@/components/account/AccountNav'
import ZuuMascotIcon from '@/components/common/ZuuMascotIcon'
import styles from './Favoriler.module.css'

export default function FavorilerPage() {
  const { user, token, openAuthModal } = useAuthStore()
  const [products, setProducts] = useState<ProductListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const loadFavorites = () => {
    if (!token) {
      setLoading(false)
      return
    }

    fetch('/api/favorites', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.products)) {
          setProducts(data.products)
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadFavorites()
  }, [token])

  if (!mounted) return null

  if (!user) {
    return (
      <div className="container" style={{ paddingTop: 'var(--sp-8, 32px)', paddingBottom: 'var(--sp-20, 80px)' }}>
        <Breadcrumbs items={[{ label: 'Hesabım', href: '/hesap' }, { label: 'Favorilerim' }]} />
        <div className={styles.emptyState}>
          <div className={styles.emptyMascotWrap}>
            <ZuuMascotIcon />
          </div>
          <h2 className={styles.emptyTitle}>giriş yapmalısınız</h2>
          <p className={styles.emptyDesc}>favori ürünlerinizi görmek için lütfen hesabınıza giriş yapın.</p>
          <button
            type="button"
            className={styles.discoverBtn}
            onClick={() => openAuthModal()}
          >
            giriş yap
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container" style={{ paddingTop: 'var(--sp-8, 32px)', paddingBottom: 'var(--sp-20, 80px)' }}>
      <Breadcrumbs items={[{ label: 'Hesabım', href: '/hesap' }, { label: 'Favorilerim' }]} />

      <header className={styles.pageHeader}>
        <span className={styles.eyebrow}>zuulab / favoriler</span>
        <h1 className={styles.pageTitle}>favorilerim</h1>
      </header>

      <div className={styles.accountGrid}>
        <aside>
          <AccountNav favoriteCount={products.length} />
        </aside>

        <main className={styles.mainContent}>
          {loading ? (
            <div className={styles.loadingText}>favoriler yükleniyor...</div>
          ) : products.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyMascotWrap}>
                <ZuuMascotIcon />
              </div>
              <h2 className={styles.emptyTitle}>henüz favorin yok.</h2>
              <p className={styles.emptyDesc}>
                koleksiyonlarımızdaki benzersiz 3d objeleri inceleyip beğendiklerini buraya kaydedebilirsin.
              </p>
              <Link href="/urunler" className={styles.discoverBtn}>
                ürünleri keşfet
              </Link>
            </div>
          ) : (
            <div className={styles.favoritesGrid}>
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
