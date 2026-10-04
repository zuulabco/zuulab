'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import styles from './FavoriteButton.module.css'
import { track } from '@/lib/analytics/gtag'

interface Props {
  productId: string
}

const LOCAL_FAVS_KEY = 'zuulab_local_favorites'

export default function FavoriteButton({ productId }: Props) {
  const { user, token } = useAuthStore()
  const [liked, setLiked] = useState(false)

  // Initialize favorite status
  useEffect(() => {
    if (user && token) {
      // Fetch user's server favorites
      fetch('/api/favorites', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.productIds)) {
            setLiked(data.productIds.includes(productId))
          }
        })
        .catch(() => {})
    } else {
      // Check local guest favorites
      try {
        const local = localStorage.getItem(LOCAL_FAVS_KEY)
        if (local) {
          const ids: string[] = JSON.parse(local)
          setLiked(ids.includes(productId))
        }
      } catch {}
    }
  }, [productId, user, token])

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const newLiked = !liked
    setLiked(newLiked)

    if (newLiked) {
      track('add_to_wishlist', { currency: 'TRY', items: [{ item_id: productId }] })
      toast.success('favorilere eklendi')
    } else {
      toast.info('favorilerden kaldırıldı')
    }

    // Save to local storage for guest
    try {
      const local = localStorage.getItem(LOCAL_FAVS_KEY)
      const ids: string[] = local ? JSON.parse(local) : []
      const updated = newLiked
        ? Array.from(new Set([...ids, productId]))
        : ids.filter((id) => id !== productId)
      localStorage.setItem(LOCAL_FAVS_KEY, JSON.stringify(updated))
    } catch {}

    // If authenticated, persist to real backend API
    if (user && token) {
      try {
        if (newLiked) {
          await fetch('/api/favorites', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ productId }),
          })
        } else {
          await fetch(`/api/favorites/${productId}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          })
        }
      } catch (err) {
        console.warn('[FavoriteButton] Failed to sync favorite with server:', err)
      }
    }
  }

  return (
    <button
      className={`${styles.btn} ${liked ? styles.liked : ''}`}
      onClick={toggle}
      aria-label={liked ? 'favorilerden çıkar' : 'favorilere ekle'}
      aria-pressed={liked}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill={liked ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  )
}
