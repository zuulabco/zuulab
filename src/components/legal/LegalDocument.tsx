import Link from 'next/link'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import { COMPANY } from '@/config/company'
import { JsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { LEGAL_DOCS, formatDocDate, type LegalDoc } from '@/lib/legal/documents'
import styles from './Legal.module.css'

export interface LegalSection {
  id: string
  title: string
  body: React.ReactNode
}

/**
 * Shared layout of every legal document: heading with version and date, a
 * contents list (sticky beside the text on wide screens, collapsible on phones),
 * numbered sections and links to the other documents.
 */
export default function LegalDocument({
  doc,
  intro,
  sections,
  children,
}: {
  doc: LegalDoc
  intro?: React.ReactNode
  sections: LegalSection[]
  /** Extra content after the sections (e.g. a form) */
  children?: React.ReactNode
}) {
  const others = LEGAL_DOCS.filter((d) => d.slug !== doc.slug)
  const contents = (
    <ol className={styles.tocList}>
      {sections.map((s, i) => (
        <li key={s.id}>
          <a href={`#${s.id}`}>
            <span className={styles.tocNum}>{String(i + 1).padStart(2, '0')}</span>
            {s.title}
          </a>
        </li>
      ))}
    </ol>
  )

  return (
    <div className={`container ${styles.page}`}>
      <JsonLd data={breadcrumbJsonLd([{ name: doc.title, path: `/${doc.slug}` }])} />
      <Breadcrumbs items={[{ label: 'yasal' }, { label: doc.label }]} />

      <header className={styles.hero}>
        <span className={styles.eyebrow}>zuulab / yasal</span>
        <h1 className={styles.title}>{doc.title.toLocaleLowerCase('tr-TR')}</h1>
        <p className={styles.lead}>{doc.summary}</p>
        <dl className={styles.meta}>
          <div>
            <dt>son güncelleme</dt>
            <dd>{formatDocDate(doc.updated)}</dd>
          </div>
          <div>
            <dt>sürüm</dt>
            <dd>{doc.version}</dd>
          </div>
          <div>
            <dt>satıcı</dt>
            <dd>{COMPANY.tradeName}</dd>
          </div>
        </dl>
      </header>

      <div className={styles.layout}>
        <aside className={styles.aside}>
          <nav className={styles.toc} aria-label="İçindekiler">
            <span className={styles.asideLabel}>içindekiler</span>
            {contents}
          </nav>
        </aside>

        <article className={styles.article}>
          <details className={styles.tocMobile}>
            <summary>içindekiler</summary>
            {contents}
          </details>

          {intro && <div className={styles.intro}>{intro}</div>}

          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNum}>{String(i + 1).padStart(2, '0')}</span>
                {s.title}
              </h2>
              <div className={styles.prose}>{s.body}</div>
            </section>
          ))}

          {children}

          <p className={styles.contact}>
            Bu belgeyle ilgili sorularınız için <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresine yazabilir
            ya da <Link href="/iletisim">iletişim</Link> sayfamızı kullanabilirsiniz.
          </p>
        </article>
      </div>

      <nav className={styles.others} aria-label="Diğer yasal belgeler">
        <span className={styles.asideLabel}>diğer yasal belgeler</span>
        <ul className={styles.otherGrid}>
          {others.map((d) => (
            <li key={d.slug}>
              <Link href={`/${d.slug}`} className={styles.otherCard}>
                <span className={styles.otherTitle}>{d.label}</span>
                <span className={styles.otherSummary}>{d.summary}</span>
                <span className={styles.otherArrow} aria-hidden>
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

/** Seller identity block used inside the contracts */
export function SellerTable({ withAddress = true }: { withAddress?: boolean }) {
  const rows: Array<[string, React.ReactNode]> = [
    ['Unvan', COMPANY.tradeName],
    ['İşletme türü', COMPANY.type],
    ...(withAddress ? ([['Adres', COMPANY.address]] as Array<[string, React.ReactNode]>) : []),
    ['Vergi dairesi', COMPANY.taxOffice],
    ...(COMPANY.showTaxId ? ([['Vergi kimlik no', COMPANY.taxId]] as Array<[string, React.ReactNode]>) : []),
    ...(COMPANY.mersis ? ([['MERSİS no', COMPANY.mersis]] as Array<[string, React.ReactNode]>) : []),
    ...(COMPANY.tradeRegistry ? ([['Ticaret sicil', COMPANY.tradeRegistry]] as Array<[string, React.ReactNode]>) : []),
    ...(COMPANY.chamber ? ([['Meslek odası', COMPANY.chamber]] as Array<[string, React.ReactNode]>) : []),
    ['Telefon', <a key="t" href={`tel:${COMPANY.phoneE164}`}>{COMPANY.phoneDisplay}</a>],
    ['E-posta', <a key="e" href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>],
    ['KEP adresi', COMPANY.kep],
    ['Web sitesi', <a key="w" href={COMPANY.website}>www.zuulab.com</a>],
    ...(COMPANY.etbis ? ([['ETBİS kaydı', COMPANY.etbis]] as Array<[string, React.ReactNode]>) : []),
  ]
  return <KeyValue rows={rows} />
}

export function KeyValue({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className={styles.kv}>
      {rows.map(([k, v]) => (
        <div key={k} className={styles.kvRow}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Short highlighted summary at the top of a long document */
export function Summary({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className={styles.summary}>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}
