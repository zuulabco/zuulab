'use client'

import { useState } from 'react'
import styles from './Bulten.module.css'

export default function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard blocked: the code is still on screen to select by hand.
    }
  }

  return (
    <div className={styles.codeBox}>
      <span className={styles.code}>{code}</span>
      <button type="button" className="btn btn-secondary" onClick={copy} aria-live="polite">
        {copied ? 'kopyalandı' : 'kopyala'}
      </button>
    </div>
  )
}
