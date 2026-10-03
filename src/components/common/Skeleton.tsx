import React from 'react'

/**
 * Loading placeholders that keep the shape of the content they stand in for, so
 * nothing jumps when the real content arrives. Purely visual: the region that
 * contains them should carry aria-busy.
 */

export function Skeleton({
  width,
  height,
  className = '',
  style,
  round = false,
}: {
  width?: number | string
  height?: number | string
  className?: string
  style?: React.CSSProperties
  round?: boolean
}) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton ${round ? 'skeleton-circle' : ''} ${className}`}
      style={{ display: 'block', width: width ?? '100%', height: height ?? '1em', ...style }}
    />
  )
}

/** Table body placeholder: `rows` rows of `cols` cells. */
export function SkeletonRows({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden="true">
          {Array.from({ length: cols }, (_, c) => (
            <td key={c}>
              <Skeleton height={12} width={c === 0 ? '70%' : `${40 + ((r + c) % 3) * 15}%`} />
              {c === 0 && <Skeleton height={10} width="40%" style={{ marginTop: 6 }} />}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

/** A block of placeholder lines (cards, panels, text). */
export function SkeletonLines({ lines = 3, lastWidth = '60%' }: { lines?: number; lastWidth?: string }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? lastWidth : '100%'} style={{ marginBottom: 8 }} />
      ))}
    </div>
  )
}

/** Product-card shaped placeholder (image + two lines + price). */
export function ProductCardSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton height={0} style={{ paddingBottom: '125%', borderRadius: 'var(--radius-sm)' }} />
      <Skeleton height={10} width="35%" style={{ marginTop: 12 }} />
      <Skeleton height={14} width="80%" style={{ marginTop: 8 }} />
      <Skeleton height={14} width="30%" style={{ marginTop: 8 }} />
    </div>
  )
}

/** List/panel placeholder for areas that are not tables (cards, feeds). */
export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden="true" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <Skeleton width={40} height={40} />
          <div style={{ flex: 1 }}>
            <Skeleton height={12} width={`${55 + (i % 3) * 12}%`} />
            <Skeleton height={10} width="30%" style={{ marginTop: 8 }} />
          </div>
          <Skeleton width={72} height={12} />
        </div>
      ))}
    </div>
  )
}

/** Whole admin page placeholder: heading, a strip of figures, a panel. */
export function SkeletonPage() {
  return (
    <div aria-busy="true" aria-label="Yükleniyor" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <Skeleton height={26} width={260} />
        <Skeleton height={12} width={380} style={{ marginTop: 10 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} height={72} />
        ))}
      </div>
      <SkeletonList rows={5} />
    </div>
  )
}
