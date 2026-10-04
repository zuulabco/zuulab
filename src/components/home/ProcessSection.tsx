import Link from 'next/link'
import styles from './ProcessSection.module.css'

const STEPS = [
  {
    title: 'parametrik tasarım',
    desc: 'matematiksel form dili ve 3d cad modelleme ile her objeye özgün bir karakter kazandırılır.',
  },
  {
    title: 'hassas dilimleme',
    desc: 'her model baskıya hazırlanır; doluluk, destek ve baskı yönü ürüne göre ayarlanır.',
  },
  {
    title: 'endüstriyel üretim',
    desc: 'atölyemizdeki 3d yazıcılarda, seçilen malzemeyle katman katman basılır.',
  },
  {
    title: 'özenli ambalaj',
    desc: 'kontrolden geçen her parça koruyucu ambalajla paketlenip kargoya verilir.',
  },
]

export default function ProcessSection() {
  return (
    <section className={styles.section} aria-label="zuulab üretim süreci">
      <div className={styles.container}>
        <div className={styles.layout}>
          {/* Header column — left-anchored editorial title */}
          <div className={styles.headerCol}>
            <h2 className={styles.title}>
              fikirden elinize,<br />
              <span className={styles.titleMuted}>4 adım.</span>
            </h2>
            <p className={styles.subtitle}>
              zuulab, 3d baskıyı bir hobi değil; talep üzerine, özenli ve kontrollü bir üretim biçimi olarak ele alır.
            </p>
          </div>

          {/* Steps column — no numbered markers */}
          <div className={styles.stepsCol}>
            <div className={styles.stepsGrid}>
              {STEPS.map((step) => (
                <div key={step.title} className={styles.stepItem}>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepDesc}>{step.desc}</p>
                </div>
              ))}
            </div>

            {/* Footer metrics */}
            <div className={styles.metricsRow} aria-label="teknik özellikler">
              <div className={styles.metric}>
                <span className={styles.metricVal}>3d</span>
                <span className={styles.metricLbl}>katman katman baskı</span>
              </div>
              <div className={styles.metricDivider} aria-hidden />
              <div className={styles.metric}>
                <span className={styles.metricVal}>4</span>
                <span className={styles.metricLbl}>bambu lab yazıcı</span>
              </div>
              <div className={styles.metricDivider} aria-hidden />
              <div className={styles.metric}>
                <span className={styles.metricVal}>pla · petg</span>
                <span className={styles.metricLbl}>malzeme</span>
              </div>
            </div>
          </div>

          {/* Footer — link to full page */}
          <div className={styles.processLink}>
            <Link href="/uretim-sureci" className={styles.processLinkText}>
              üretim sürecinin tamamını gör
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
