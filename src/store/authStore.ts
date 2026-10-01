'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  firebaseSignOut,
  isFirebaseClientConfigured,
  type FirebaseUser,
} from '@/lib/firebase'

export interface UserProfile {
  id: string
  firebaseUid: string
  email: string
  name: string | null
  avatar: string | null
  role: 'CUSTOMER' | 'ADMIN' | 'SUPER_ADMIN' | 'STAFF' | 'SUPPORT' | 'CONTENT_MANAGER' | 'ORDER_MANAGER'
  status: string
}

interface AuthState {
  user: UserProfile | null
  token: string | null
  isLoading: boolean
  isAuthModalOpen: boolean
  error: string | null

  // UI actions
  openAuthModal: () => void
  closeAuthModal: () => void
  clearError: () => void

  // Auth actions
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, pass: string) => Promise<void>
  registerWithEmail: (email: string, pass: string, name?: string) => Promise<void>
  devLogin: (role?: 'CUSTOMER' | 'ADMIN') => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      isAuthModalOpen: false,
      error: null,

      openAuthModal: () => set({ isAuthModalOpen: true, error: null }),
      closeAuthModal: () => set({ isAuthModalOpen: false, error: null }),
      clearError: () => set({ error: null }),

      // Sync user with backend database
      syncWithBackend: async (firebaseToken: string, extra?: { name?: string }) => {
        try {
          const res = await fetch('/api/auth/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${firebaseToken}`,
            },
            body: JSON.stringify({ token: firebaseToken, name: extra?.name }),
          })

          const data = await res.json()
          if (data.success && data.user) {
            set({ user: data.user, token: firebaseToken, isLoading: false, isAuthModalOpen: false })

            // Sync any local favorites
            try {
              const localFavs = localStorage.getItem('zuulab_local_favorites')
              if (localFavs) {
                const ids = JSON.parse(localFavs)
                if (Array.isArray(ids) && ids.length > 0) {
                  await fetch('/api/favorites/sync', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${firebaseToken}`,
                    },
                    body: JSON.stringify({ productIds: ids }),
                  })
                }
              }
            } catch {}
          } else {
            throw new Error(data.error || 'Kullanıcı senkronize edilemedi.')
          }
        } catch (err: any) {
          console.error('[authStore] Sync error:', err)
          set({ error: err.message, isLoading: false })
        }
      },

      signInWithGoogle: async () => {
        set({ isLoading: true, error: null })
        try {
          if (!isFirebaseClientConfigured) {
            // Local dev fallback when Firebase API key is not configured in .env.local
            await get().devLogin('CUSTOMER')
            return
          }

          const result = await signInWithPopup(auth, googleProvider)
          const token = await result.user.getIdToken()
          const syncFn = (get() as any).syncWithBackend
          await syncFn(token, { name: result.user.displayName || undefined })
        } catch (err: any) {
          console.error('[authStore] Google sign-in failed:', err)
          set({
            error: err.code === 'auth/popup-closed-by-user'
              ? 'Giriş penceresi kapatıldı.'
              : err.message || 'Google ile giriş başarısız oldu.',
            isLoading: false,
          })
        }
      },

      signInWithEmail: async (email: string, pass: string) => {
        set({ isLoading: true, error: null })
        try {
          if (!isFirebaseClientConfigured) {
            // Check for admin demo credentials
            if (email.toLowerCase() === 'admin@zuulab.com') {
              await get().devLogin('ADMIN')
            } else {
              await get().devLogin('CUSTOMER')
            }
            return
          }

          const credential = await signInWithEmailAndPassword(auth, email, pass)
          const token = await credential.user.getIdToken()
          const syncFn = (get() as any).syncWithBackend
          await syncFn(token)
        } catch (err: any) {
          console.error('[authStore] Email sign-in failed:', err)
          let msg = 'Giriş yapılamadı. Bilgilerinizi kontrol edin.'
          if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
            msg = 'E-posta adresi veya şifre hatalı.'
          } else if (err.code === 'auth/user-not-found') {
            msg = 'Bu e-posta adresiyle kayıtlı kullanıcı bulunamadı.'
          }
          set({ error: msg, isLoading: false })
        }
      },

      registerWithEmail: async (email: string, pass: string, name?: string) => {
        set({ isLoading: true, error: null })
        try {
          if (!isFirebaseClientConfigured) {
            await get().devLogin('CUSTOMER')
            return
          }

          const credential = await createUserWithEmailAndPassword(auth, email, pass)
          const token = await credential.user.getIdToken()
          const syncFn = (get() as any).syncWithBackend
          await syncFn(token, { name })
        } catch (err: any) {
          console.error('[authStore] Registration failed:', err)
          let msg = 'Kayıt oluşturulamadı.'
          if (err.code === 'auth/email-already-in-use') {
            msg = 'Bu e-posta adresi zaten kullanımda.'
          } else if (err.code === 'auth/weak-password') {
            msg = 'Şifre en az 6 karakter olmalıdır.'
          }
          set({ error: msg, isLoading: false })
        }
      },

      // Instant developer login for testing without live Firebase setup
      devLogin: async (role = 'CUSTOMER') => {
        const email = role === 'ADMIN' ? 'admin@zuulab.com' : 'demo@zuulab.com'
        const name = role === 'ADMIN' ? 'Zuulab Yönetici' : 'Örnek Müşteri'
        const devToken = `dev-token-${Date.now()}:dev-${role.toLowerCase()}-uid:${email}:${role}`

        const syncFn = (get() as any).syncWithBackend
        await syncFn(devToken, { name })
      },

      logout: async () => {
        try {
          if (isFirebaseClientConfigured) {
            await firebaseSignOut(auth)
          }
        } catch {}
        set({ user: null, token: null, error: null })
      },
    }),
    {
      name: 'zuulab_auth_session',
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
)
