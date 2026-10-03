'use client'

/**
 * Last-resort boundary when the root layout itself fails: it replaces the whole
 * document, so it carries its own minimal styling instead of the site's CSS.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
          color: '#111110',
          background: '#ffffff',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 460 }}>
          <div style={{ fontWeight: 700, fontSize: 19, letterSpacing: '-0.04em', marginBottom: 32 }}>zuulab.</div>
          <h1 style={{ fontSize: 28, margin: '0 0 12px', letterSpacing: '-0.02em' }}>Site şu an yüklenemedi</h1>
          <p style={{ color: '#4a4a48', lineHeight: 1.6, margin: '0 0 28px' }}>
            Beklenmeyen bir hata oluştu. Birkaç saniye sonra tekrar deneyin.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 44,
              padding: '0 20px',
              background: '#111110',
              color: '#fff',
              border: 0,
              borderRadius: 3,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Tekrar dene
          </button>
          {error.digest && <p style={{ marginTop: 24, fontSize: 11, color: '#888886' }}>Hata kodu: {error.digest}</p>}
        </div>
      </body>
    </html>
  )
}
