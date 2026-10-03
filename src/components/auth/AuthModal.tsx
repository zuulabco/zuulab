'use client'

import { useState, useEffect, useRef } from 'react'
import Modal from '@/components/common/Modal'
import { useAuthStore } from '@/store/authStore'
import styles from './AuthModal.module.css'

export default function AuthModal() {
  const {
    isAuthModalOpen,
    closeAuthModal,
    signInWithGoogle,
    signInWithEmail,
    registerWithEmail,
    isLoading,
    error,
    clearError,
  } = useAuthStore()

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const firstFocusRef = useRef<HTMLButtonElement>(null)

  // Focus first interactive element when modal opens
  useEffect(() => {
    if (isAuthModalOpen) {
      setTimeout(() => firstFocusRef.current?.focus(), 50)
    }
  }, [isAuthModalOpen])


  // Reset password visibility on mode change
  useEffect(() => {
    setShowPassword(false)
  }, [mode])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()

    if (mode === 'login') {
      await signInWithEmail(email, password)
    } else {
      await registerWithEmail(email, password, name)
    }
  }

  return (
    <Modal
      isOpen={isAuthModalOpen}
      onClose={closeAuthModal}
      className={styles.modal}
      ariaLabel={mode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
      showCloseBtn={false}
    >
        <button
          type="button"
          className={styles.closeBtn}
          onClick={closeAuthModal}
          aria-label="Kapat"
          ref={firstFocusRef}
        >
          <XIcon />
        </button>

        <div className={styles.header}>
          <span className={styles.eyebrow}>zuulab / üyelik</span>
          <h2 id="auth-modal-title" className={styles.title}>
            {mode === 'login' ? 'hesabınıza giriş yapın' : 'yeni hesap oluşturun'}
          </h2>
          <p className={styles.subtitle}>
            siparişlerinizi takip etmek, favorilerinizi kaydetmek ve özel avantajlardan yararlanmak için devam edin.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`${styles.tabBtn} ${mode === 'login' ? styles.tabBtnActive : ''}`}
            onClick={() => {
              setMode('login')
              clearError()
            }}
          >
            giriş yap
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={`${styles.tabBtn} ${mode === 'register' ? styles.tabBtnActive : ''}`}
            onClick={() => {
              setMode('register')
              clearError()
            }}
          >
            kayıt ol
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className={styles.errorAlert} role="alert">
            <AlertIcon />
            <span>{error}</span>
          </div>
        )}

        {/* Google Authentication */}
        <button
          type="button"
          className={styles.googleBtn}
          onClick={signInWithGoogle}
          disabled={isLoading}
          aria-label="Google hesabı ile devam et"
        >
          <GoogleIcon />
          <span>Google ile devam et</span>
        </button>

        <div className={styles.divider} aria-hidden="true">
          <span>veya e-posta ile</span>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          {mode === 'register' && (
            <div className={styles.field}>
              <label htmlFor="auth-name">ad soyad</label>
              <input
                id="auth-name"
                type="text"
                required
                autoComplete="name"
                placeholder="örn: Selin Yılmaz"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="auth-email">e-posta adresi</label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              placeholder="ornek@posta.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="auth-password">şifre</label>
            <div className={styles.passwordWrapper}>
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles.passwordInput}
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                aria-pressed={showPassword}
                tabIndex={0}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className={styles.submitLoading}>
                <span className="spinner spinner-sm" aria-hidden />
                işleniyor…
              </span>
            ) : mode === 'login' ? (
              'giriş yap'
            ) : (
              'hesap oluştur'
            )}
          </button>
        </form>

      </Modal>
    )
  }

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.24 10.285V13.4h6.887C18.2 16.035 15.6 18 12.24 18c-3.315 0-6-2.685-6-6s2.685-6 6-6c1.55 0 2.96.59 4.04 1.56l2.365-2.365C17.06 3.65 14.8 2.8 12.24 2.8 7.14 2.8 3 6.94 3 12.04s4.14 9.24 9.24 9.24c5.33 0 8.87-3.75 8.87-9.03 0-.61-.06-1.21-.17-1.78l-8.7-1.185z" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}
