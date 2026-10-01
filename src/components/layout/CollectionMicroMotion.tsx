'use client'

import React from 'react'
import styles from './CollectionMicroMotion.module.css'

interface Props {
  slug?: string
}

/**
 * UI-15: Only `zuukids` retains decorative micro-motion.
 * All other collections have decorative micro-motions removed.
 */
export default function CollectionMicroMotion({ slug = 'zuukids' }: Props) {
  if (slug !== 'zuukids') return null

  return (
    <span className={styles.motionRoot} aria-hidden="true">
      <span className={styles.kidsWrap}>
        <span className={styles.kidsCube} />
        <span className={styles.kidsTriangle} />
        <span className={styles.kidsCircle} />
      </span>
    </span>
  )
}
