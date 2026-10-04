import Link from 'next/link'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import { JsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { CORPORATE_PAGES } from '@/lib/legal/documents'
import s from './Corporate.module.css'

/**
 * Building blocks of the corporate pages (Hakkımızda, Üretim süreci, İletişim,
 * SSS, Kargo, Özel üretim), in the home page's language: serif lowercase titles
 * with a muted italic second line, mono eyebrows, thin rules.
 */

export function CorporatePage({ slug, children }: { slug: string; children: React.ReactNode }) {
  const page = CORPORATE_PAGES.find((p) => p.slug === slug)
  const others = CORPORATE_PAGES.filter((p) => p.slug !== slug)
  return (
    <div className={s.page}>
      <div className="container">
        {page && <JsonLd data={breadcrumbJsonLd([{ name: page.title, path: `/${page.slug}` }])} />}
        <Breadcrumbs items={[{ label: 'kurumsal' }, { label: page?.label ?? slug }]} />
      </div>
      {children}
      <div className="container">
        <nav className={s.pageNav} aria-label="Kurumsal sayfalar">
          <span className={s.eyebrow}>kurumsal</span>
          <ul>
            {others.map((p) => (
              <li key={p.slug}>
                <Link href={`/${p.slug}`}>
                  <span>{p.label}</span>
                  <span aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  )
}

export function Hero({
  eyebrow,
  title,
  muted,
  lead,
  children,
}: {
  eyebrow: string
  title: string
  muted?: string
  lead?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <header className={`container ${s.hero}`}>
      <span className={s.eyebrow}>{eyebrow}</span>
      <h1 className={s.heroTitle}>
        {title}
        {muted && (
          <>
            <br />
            <span className={s.muted}>{muted}</span>
          </>
        )}
      </h1>
      {lead && <p className={s.heroLead}>{lead}</p>}
      {children}
    </header>
  )
}

/** Label/title on the left, content on the right (the home page's process layout) */
export function Block({
  label,
  title,
  muted,
  intro,
  tone,
  children,
  id,
}: {
  label: string
  title?: string
  muted?: string
  intro?: React.ReactNode
  tone?: 'tinted'
  children: React.ReactNode
  id?: string
}) {
  return (
    <section id={id} className={`${s.block} ${tone === 'tinted' ? s.tinted : ''}`}>
      <div className={`container ${s.blockGrid}`}>
        <div className={s.blockHead}>
          <span className={s.eyebrow}>{label}</span>
          {title && (
            <h2 className={s.blockTitle}>
              {title}
              {muted && (
                <>
                  {' '}
                  <span className={s.muted}>{muted}</span>
                </>
              )}
            </h2>
          )}
          {intro && <p className={s.blockIntro}>{intro}</p>}
        </div>
        <div className={s.blockBody}>{children}</div>
      </div>
    </section>
  )
}

export function Facts({ items }: { items: Array<{ value: string; label: string }> }) {
  return (
    <dl className={s.facts}>
      {items.map((f) => (
        <div key={f.label} className={s.fact}>
          <dt className={s.factValue}>{f.value}</dt>
          <dd className={s.factLabel}>{f.label}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Features({ items, columns = 2 }: { items: Array<{ title: string; text: React.ReactNode }>; columns?: 2 | 3 }) {
  return (
    <div className={`${s.features} ${columns === 3 ? s.features3 : ''}`}>
      {items.map((f) => (
        <div key={f.title} className={s.feature}>
          <h3 className={s.featureTitle}>{f.title}</h3>
          <div className={s.featureText}>{f.text}</div>
        </div>
      ))}
    </div>
  )
}

export function Steps({ items }: { items: Array<{ title: string; text: React.ReactNode; meta?: string }> }) {
  return (
    <ol className={s.steps}>
      {items.map((step, i) => (
        <li key={step.title} className={s.step}>
          <span className={s.stepNum}>{String(i + 1).padStart(2, '0')}</span>
          <div>
            <h3 className={s.stepTitle}>{step.title}</h3>
            <div className={s.stepText}>{step.text}</div>
            {step.meta && <span className={s.stepMeta}>{step.meta}</span>}
          </div>
        </li>
      ))}
    </ol>
  )
}

export function Prose({ children }: { children: React.ReactNode }) {
  return <div className={s.prose}>{children}</div>
}

export function CtaBand({ title, muted, text, children }: { title: string; muted?: string; text?: string; children: React.ReactNode }) {
  return (
    <section className={s.cta}>
      <div className={`container ${s.ctaInner}`}>
        <div>
          <h2 className={s.ctaTitle}>
            {title}
            {muted && (
              <>
                {' '}
                <span className={s.muted}>{muted}</span>
              </>
            )}
          </h2>
          {text && <p className={s.ctaText}>{text}</p>}
        </div>
        <div className={s.ctaActions}>{children}</div>
      </div>
    </section>
  )
}
