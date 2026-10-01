// Firebase CLIENT-SIDE configuration
// Only NEXT_PUBLIC_ vars are included in client bundle

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type Auth,
  type User as FirebaseUser,
} from 'firebase/auth'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDemoDummyApiKeyForLocalDevelopment123',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'zuulab-e.firebaseapp.com',
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
export const auth: Auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()

export {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  firebaseSignOut,
}
export type { FirebaseUser }
export default app
