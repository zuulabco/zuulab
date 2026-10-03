'use client'

import { useId, useState } from 'react'
import styles from './Footer.module.css'

interface Props {
  title: string
  children: React.ReactNode
}

/** A footer link group: always open on wider screens, a tap-to-open row on phones. */
export default function FooterColumn({ title, children }: Props) {
  const [open, setOpen] = useState(false)
  const listId = useId()

  return (
    <div className={`${styles.col} ${open ? styles.colOpen : ''}`}>
      <h3 className={styles.colTitle}>
        <button
          type="button"
          className={styles.colToggle}
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
        >
          <span>{title}</span>
          <svg className={styles.colChevron} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </h3>
      <div id={listId} className={styles.colBody}>
        <div className={styles.colBodyInner}>{children}</div>
      </div>
    </div>
  )
}
