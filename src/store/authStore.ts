'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  auth,
  googleProvider,
  browserPopupRedirectResolver,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  firebaseSignOut,
  isFirebaseClientConfigured,
  prepareAuthProtection,
  type FirebaseUser,
} from '@/lib/firebase'
import { getAdditionalUserInfo } from 'firebase/auth'
import { authErrorMessage } from '@/lib/auth/error-messages'
import { trackEvent } from '@/lib/marketing/client'

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
  isAuthenticated: boolean
  canFetch: boolean
  isLoading: boolean
  isAuthModalOpen: boolean
  error: string | null

  // UI actions
  openAuthModal: () => void
  closeAuthModal: () => void
  clearError: () => void

  // Auth actions
  initAuthListener: () => () => void
  checkSession: () => Promise<UserProfile | null>
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, pass: string) => Promise<void>
  registerWithEmail: (email: string, pass: string, name?: string) => Promise<void>
  devLogin: (role?: 'CUSTOMER' | 'ADMIN') => Promise<void>
  logout: () => Promise<void>
}

/** signup / login, sent only when the backend sync really signed the person in */
function trackAuthEvent(state: AuthState, event: 'signup' | 'login', method: 'email' | 'google') {
  if (state.error || !state.user) return
  trackEvent(event, { method, userId: state.user.id })
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      canFetch: false,
      isLoading: false,
      isAuthModalOpen: false,
      error: null,

      openAuthModal: () => set({ isAuthModalOpen: true, error: null }),
      closeAuthModal: () => set({ isAuthModalOpen: false, error: null }),
      clearError: () => set({ error: null }),

      // Keeps Firebase ID token fresh across client lifecycle
      initAuthListener: () => {
        if (typeof window === 'undefined') return () => {}
        if (!isFirebaseClientConfigured) return () => {}

        const unsubscribe = auth.onIdTokenChanged(async (firebaseUser) => {
          if (firebaseUser) {
            try {
              const freshToken = await firebaseUser.getIdToken()
              const currentToken = get().token
              if (currentToken !== freshToken && !currentToken?.startsWith('dev-token-')) {
                set({ token: freshToken, isAuthenticated: true, canFetch: true })
              }
            } catch {}
          }
        })

        return unsubscribe
      },

      // Verifies server-side SSO session cookie and restores user state
      checkSession: async () => {
        try {
          const res = await fetch('/api/auth/me', {
            headers: {
              ...(get().token ? { Authorization: `Bearer ${get().token}` } : {}),
            },
          })
          if (res.ok) {
            const data = await res.json()
            if (data.success && data.user) {
              set({
                user: data.user,
                isAuthenticated: true,
                canFetch: true,
                isLoading: false,
              })
              return data.user
            }
          } else if (res.status === 401) {
            const currentToken = get().token
            if (!currentToken?.startsWith('dev-token-')) {
              set({ user: null, isAuthenticated: false, canFetch: false })
            }
          }
        } catch {}
        return null
      },

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
            set({
              user: data.user,
              token: firebaseToken,
              isAuthenticated: true,
              canFetch: true,
              isLoading: false,
              isAuthModalOpen: false,
            })

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
            if (res.status === 401) {
              set({ user: null, token: null })
            }
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

          const result = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver)
          // Force fresh token to prevent stale cached token issues
          const token = await result.user.getIdToken(true)
          const syncFn = (get() as any).syncWithBackend
          await syncFn(token, { name: result.user.displayName || undefined })
          trackAuthEvent(get(), getAdditionalUserInfo(result)?.isNewUser ? 'signup' : 'login', 'google')
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

          // reCAPTCHA token (when the project has bot protection on); Firebase checks it
          // on its servers and refuses the sign-in without a valid one
          await prepareAuthProtection()
          const credential = await signInWithEmailAndPassword(auth, email, pass)
          // Force fresh token directly from Google Auth server
          const token = await credential.user.getIdToken(true)
          const syncFn = (get() as any).syncWithBackend
          await syncFn(token)
          trackAuthEvent(get(), 'login', 'email')
        } catch (err: any) {
          console.error('[authStore] Email sign-in failed:', err)
          set({ error: authErrorMessage(err.code, 'Giriş yapılamadı. Bilgilerinizi kontrol edin.'), isLoading: false })
        }
      },

      registerWithEmail: async (email: string, pass: string, name?: string) => {
        set({ isLoading: true, error: null })
        try {
          if (!isFirebaseClientConfigured) {
            await get().devLogin('CUSTOMER')
            return
          }

          await prepareAuthProtection()
          const credential = await createUserWithEmailAndPassword(auth, email, pass)
          // Proves ownership of the address; needed to attach orders placed earlier
          // as a guest with the same email (see syncOrCreateUser).
          await sendEmailVerification(credential.user, {
            url: `${window.location.origin}/hesap`,
          }).catch((err) => console.warn('[authStore] Verification email failed:', err))
          const token = await credential.user.getIdToken(true)
          const syncFn = (get() as any).syncWithBackend
          await syncFn(token, { name })
          trackAuthEvent(get(), 'signup', 'email')
        } catch (err: any) {
          console.error('[authStore] Registration failed:', err)
          set({ error: authErrorMessage(err.code, 'Kayıt oluşturulamadı.'), isLoading: false })
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
        try {
          await fetch('/api/auth/logout', { method: 'POST' })
        } catch {}
        set({ user: null, token: null, isAuthenticated: false, canFetch: false, error: null })
      },
    }),
    {
      name: 'zuulab_auth_session',
      partialize: (state) => ({ user: state.user, token: state.token }),
      onRehydrateStorage: () => (state) => {
        if (state && (state.user || state.token)) {
          state.isAuthenticated = true
          state.canFetch = true
        }
      },
    }
  )
)
