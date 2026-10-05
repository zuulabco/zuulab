// Firebase CLIENT-SIDE configuration
// Only NEXT_PUBLIC_ vars are included in client bundle

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  browserPopupRedirectResolver,
  initializeRecaptchaConfig,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  type Auth,
  type User as FirebaseUser,
} from 'firebase/auth'
import { SITE_URL } from '@/lib/config/urls'
import { resolveAuthDomain } from '@/lib/firebase-auth-domain'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDemoDummyApiKeyForLocalDevelopment123',
  // On the storefront the sign-in window shows the shop's own address (see firebase-auth-domain.ts)
  authDomain: resolveAuthDomain(
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'zuulab-e.firebaseapp.com',
    typeof window === 'undefined' ? undefined : window.location.hostname,
    SITE_URL
  ),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'zuulab-e',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'zuulab-e.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '123456789012',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:123456789012:web:abcdef123456',
}

export const isFirebaseClientConfigured = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    !process.env.NEXT_PUBLIC_FIREBASE_API_KEY.includes('AIzaSyDemoDummy')
)

// Safe singleton initialization
function getClientApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp()
  }
  return initializeApp(firebaseConfig)
}

export const app: FirebaseApp = getClientApp()
/**
 * Auth without the popup/redirect resolver: getAuth() would load Google's sign-in
 * iframe (apis.google.com, firebaseapp.com) on every page view for every visitor.
 * The resolver is passed only when someone actually signs in with Google (see
 * signInWithPopup in authStore). Persistence is the same as getAuth()'s default.
 */
function getClientAuth(): Auth {
  if (typeof window === 'undefined') return getAuth(app)
  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
    })
  } catch {
    // Already initialised (e.g. hot reload): reuse that instance
    return getAuth(app)
  }
}

export const auth: Auth = getClientAuth()
export const googleProvider = new GoogleAuthProvider()

let authProtection: Promise<boolean> | null = null

/**
 * Bot protection for email/password sign-in, sign-up and password-reset emails is
 * Firebase's own reCAPTCHA Enterprise integration (Firebase console → Authentication
 * → Settings → reCAPTCHA). With it on, the SDK attaches an invisible reCAPTCHA token
 * to those requests and Firebase checks it on its servers before doing anything, so a
 * bot calling the Firebase API directly is refused as well. Google sign-in is not
 * covered: it runs Google's own checks.
 *
 * This fetches the project's setting early (plus the reCAPTCHA script, only when the
 * protection is on) so the first attempt already carries a token. It runs when a
 * sign-in or reset form opens, never on page load, and resolves true when the
 * protection is on. If it fails, the SDK still adds a token on retry when Firebase
 * asks for one: the check itself never depends on this call.
 */
export function prepareAuthProtection(): Promise<boolean> {
  if (typeof window === 'undefined' || !isFirebaseClientConfigured) return Promise.resolve(false)
  authProtection ??= initializeRecaptchaConfig(auth)
    // The SDK adds the reCAPTCHA script right after, and only when a provider is protected
    .then(() => new Promise<boolean>((resolve) => setTimeout(() => resolve(recaptchaScriptAdded()), 0)))
    .catch((err) => {
      authProtection = null
      console.warn('[firebase] reCAPTCHA settings could not be loaded:', err)
      return false
    })
  return authProtection
}

function recaptchaScriptAdded(): boolean {
  return Boolean(document.querySelector('script[src*="recaptcha/enterprise.js"]'))
}

export {
  browserPopupRedirectResolver,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  firebaseSignOut,
}
export type { FirebaseUser }
export default app
