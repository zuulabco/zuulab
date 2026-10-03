import type { Metadata } from 'next'
import Link from 'next/link'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import styles from '../ContentPage.module.css'

export const metadata: Metadata = {
  title: 'Üretim Süreci — Zuulab',
  description:
    'Dijital tasarımdan kalite kontrolüne kadar Zuulab\'ın 5 aşamalı üretim süreci. Kendi atölyemizde, talep üzerine üretim.',
}

const STEPS = [
  {
    num: '01',
    title: 'dijital tasarım & simülasyon',
    desc:
      'Her ürün, mukavemet ve ergonomi testlerinden geçirilerek parametrik CAD yazılımlarında 3 boyutlu olarak modellenir. Dilimleme (slicing) aşamasında en uygun dolgu (infill) geometrisi belirlenir.',
    note: 'araç: parametrik cad, slicer / çıktı: .3mf, .gcode',
  },
  {
    num: '02',
    title: 'katman katman üretim (fdm / fff)',
    desc:
      'Yüksek hassasiyetli 0.4mm nozüllerle, 210°C sıcaklıkta eritilen biyo-polimer filament katman katman inşa edilir. Ürünün büyüklüğüne göre baskı süresi 4 ila 36 saat arasında değişir.',
    note: 'nozül: 0.4 mm / malzeme: pla, petg',
  },
  {
    num: '03',
    title: 'yüzey temizliği & kürleme',
    desc:
      'Baskı tablasından alınan parça soğutulduktan sonra destek yapıları (supports) elle temizlenir. Yüzeydeki çapaklar giderilerek pürüzsüz doku sağlanır.',
    note: 'süreç: elle temizlik, ısıl denge / süre: ürüne göre 15–45 dk',
  },
  {
    num: '04',
    title: 'boyutsal kontrol & kalite muayenesi',
    desc:
      'Kumpas ve ağırlık ölçümleriyle toleranslar kontrol edilir. Mukavemet testini başarıyla geçen ürünler tozdan arındırılarak ambalajlama istasyonuna iletilir.',
    note: 'araç: dijital kumpas, hassas terazi / hata payı: ±0.2mm',
  },
  {
    num: '05',
    title: 'güvenli & geri dönüştürülebilir paketleme',
    desc:
      'Plastik baloncuklu naylon yerine biyolojik olarak parçalanabilir kraft kağıt ve özel koruyucu kutularla paketlenir. Aynı gün veya ertesi iş günü anlaşmalı kargoya verilir.',
    note: 'kargo: sürat, yurtiçi / paket: kraft kağıt + biyobozunur dolgu',
  },
]

export default function UretimSureciPage() {
  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.breadcrumbRow}>
        <Breadcrumbs items={[{ label: 'Üretim Süreci' }]} />
      </div>

      {/* ── Hero ──────────────────────────────────────────── */}
      <header className={styles.pageHero}>
        <span className={styles.heroEyebrow}>zuulab / üretim süreci</span>
        <h1 className={styles.heroTitle}>
          fikirden elinize, 5 adım.
        </h1>
        <p className={styles.heroLead}>
          Her Zuulab nesnesi, dijital geometriden elle bitirilmiş fiziksel bir
          esere dönüşene kadar 5 temel kalite aşamasından geçer.
          Talep üzerine üretim — stok yok, israf yok.
        </p>
      </header>

      {/* ── Teknik metrikler ───────────────────────────────── */}
      <div className={styles.metricsRow}>
        <div className={styles.metric}>
          <span className={styles.metricValue}>3d</span>
          <span className={styles.metricLabel}>katman katman baskı</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricValue}>4–36 saat</span>
          <span className={styles.metricLabel}>ürüne göre baskı süresi</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricValue}>210°C</span>
          <span className={styles.metricLabel}>nozül sıcaklığı</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricValue}>±0.2mm</span>
          <span className={styles.metricLabel}>boyutsal tolerans</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricValue}>0 atık</span>
          <span className={styles.metricLabel}>talep üzerine üretim</span>
        </div>
      </div>

      {/* ── İki kolon: adımlar + bilgi ────────────────────── */}
      <div className={styles.twoCol}>
        {/* Sol: Üretim adımları */}
        <div>
          <div className={styles.sectionFirst}>
            <span className={styles.sectionLabel}>aşamalar</span>
          </div>
          <ol className={styles.stepList} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {STEPS.map((step) => (
              <li key={step.num} className={styles.stepRow}>
                <div className={styles.stepNum} aria-hidden>{step.num}</div>
                <div className={styles.stepBody}>
                  <h2 className={styles.stepTitle}>{step.title}</h2>
                  <p className={styles.stepDesc}>{step.desc}</p>
                  <span className={styles.stepNote}>{step.note}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Sağ: Bilgi bloku */}
        <aside>
          <div className={styles.infoBlock}>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>teknoloji</span>
              <span className={styles.infoValue}>FDM (Fused Deposition Modeling)</span>
            </div>
            <div className={styles.infoSeparator} />
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>birincil malzeme</span>
              <span className={styles.infoValue}>Endüstriyel PLA+ (biyo-bozunur)</span>
            </div>
            <div className={styles.infoSeparator} />
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>alternatif malzeme</span>
              <span className={styles.infoValue}>PETG (geri dönüştürülebilir)</span>
            </div>
            <div className={styles.infoSeparator} />
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>nozül çapı</span>
              <span className={styles.infoValue}>0.4mm (standart)</span>
            </div>
            <div className={styles.infoSeparator} />
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>paketleme</span>
              <span className={styles.infoValue}>Kraft kağıt, biyobozunur dolgu</span>
            </div>
            <div className={styles.infoSeparator} />
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>kargo</span>
              <span className={styles.infoValue}>Sürat Kargo, Yurtiçi Kargo</span>
            </div>
            <div className={styles.infoSeparator} />
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>özel sipariş</span>
              <Link href="/iletisim" className={styles.infoLink}>
                özel boyut / renk talebi →
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
