'use client'

import styles from './Legal.module.css'

/** Opens the browser's print dialog (to print or save the page as PDF) */
export default function PrintButton({ label = 'formu yazdır / PDF olarak kaydet' }: { label?: string }) {
  return (
    <button type="button" className={styles.printButton} onClick={() => window.print()}>
      {label}
    </button>
  )
}
