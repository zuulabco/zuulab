import type { Metadata } from 'next'
import Link from 'next/link'
import { confirmNewsletter, WELCOME_DISCOUNT_PERCENT } from '@/lib/services/newsletter.service'
import CopyCode from '../CopyCode'
import styles from '../Bulten.module.css'

export const metadata: Metadata = {
  title: 'Bülten aboneliği',
  robots: { index: false, follow: false },
}

/** Landing page of the confirmation link in the double opt-in mail. */
export default async function NewsletterConfirmPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams
  const result = await confirmNewsletter(String(t ?? ''))

  if (!result.ok) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>{result.reason === 'unsubscribed' ? 'bu abonelik sonlandırılmış.' : 'bağlantı geçersiz.'}</h1>
          <p className={styles.text}>
            {result.reason === 'unsubscribed'
              ? 'Bültenden ayrılmışsın. Tekrar katılmak istersen ana sayfanın altındaki formu kullanabilirsin.'
              : 'Bağlantı eksik kopyalanmış ya da artık geçerli değil. Ana sayfadaki formdan yeniden kaydolabilirsin.'}
          </p>
          <Link href="/#bulten" className="btn btn-primary btn-lg">
            ana sayfaya dön
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{result.firstTime ? 'aramıza hoş geldin.' : 'aboneliğin zaten onaylı.'}</h1>
        {result.code ? (
          result.codeUsed ? (
            <p className={styles.text}>Hoş geldin kodun ({result.code}) bir siparişte kullanılmış. Yeni tasarımlardan seni haberdar edeceğiz.</p>
          ) : (
            <>
              <p className={styles.text}>
                Bültenimize özel, <strong>tek kullanımlık %{WELCOME_DISCOUNT_PERCENT} indirim kodun</strong>. Aynı kodu
                e-postana da gönderdik.
              </p>
              <CopyCode code={result.code} />
              <p className={styles.hint}>
                Ödeme sayfasındaki &quot;kupon kodu&quot; alanına yazman yeterli. Üyeysen ilk siparişindeki üye indirimiyle
                birlikte de kullanabilirsin.
              </p>
            </>
          )
        ) : (
          <p className={styles.text}>Yeni tasarımlar ve kampanyalardan ilk sen haberdar olacaksın.</p>
        )}
        <Link href="/urunler" className="btn btn-primary btn-lg">
          alışverişe başla
        </Link>
      </div>
    </div>
  )
}
