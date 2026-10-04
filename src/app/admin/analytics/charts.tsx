'use client'

import { useMemo, useRef, useState } from 'react'
import s from './Analytics.module.css'

/**
 * Small single-series charts for the Analizler page, in plain SVG/HTML.
 * One hue (the brand blue) everywhere: every chart here shows one measure, so
 * colour carries no identity and the title names the series.
 */

export const fmtInt = (n: number) => Math.round(n).toLocaleString('tr-TR')

// ── Line chart with crosshair tooltip ─────────────────────────────────

interface LinePoint {
  label: string
  value: number
}

export function LineChart({ points, valueLabel, format = fmtInt }: { points: LinePoint[]; valueLabel: string; format?: (n: number) => string }) {
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const W = 1000
  const H = 260
  const pad = { top: 14, right: 12, bottom: 26, left: 44 }
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom

  const { max, ticks, path, area, xs } = useMemo(() => {
    const rawMax = Math.max(1, ...points.map((p) => p.value))
    const step = niceStep(rawMax / 4)
    const max = Math.ceil(rawMax / step) * step
    const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step)
    const xs = points.map((_, i) => pad.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW))
    const y = (v: number) => pad.top + innerH - (v / max) * innerH
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
    const area = points.length ? `${path} L${xs[xs.length - 1].toFixed(1)},${pad.top + innerH} L${xs[0].toFixed(1)},${pad.top + innerH} Z` : ''
    return { max, ticks, path, area, xs }
  }, [points, innerW, innerH, pad.left, pad.top])

  const y = (v: number) => pad.top + innerH - (v / max) * innerH
  const labelEvery = Math.max(1, Math.ceil(points.length / 7))

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect()
    if (!box || points.length === 0) return
    const x = ((e.clientX - box.left) / box.width) * W
    let best = 0
    xs.forEach((px, i) => {
      if (Math.abs(px - x) < Math.abs(xs[best] - x)) best = i
    })
    setHover(best)
  }

  if (points.length === 0) return <p className={s.empty}>Bu aralıkta veri yok.</p>

  return (
    <div className={s.lineWrap}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={s.lineSvg}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`${valueLabel} grafiği`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} className={s.grid} />
            <text x={pad.left - 8} y={y(t) + 4} className={s.axisText} textAnchor="end">
              {compact(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text key={i} x={xs[i]} y={H - 6} className={s.axisText} textAnchor="middle">
              {p.label}
            </text>
          ) : null
        )}
        <path d={area} className={s.area} />
        <path d={path} className={s.line} />
        {hover !== null && (
          <g>
            <line x1={xs[hover]} x2={xs[hover]} y1={pad.top} y2={pad.top + innerH} className={s.crosshair} />
            <circle cx={xs[hover]} cy={y(points[hover].value)} r={5} className={s.dot} />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className={s.tooltip} style={{ left: `${(xs[hover] / W) * 100}%` }}>
          <span className={s.tooltipLabel}>{points[hover].label}</span>
          <strong>{format(points[hover].value)}</strong> {valueLabel}
        </div>
      )}
    </div>
  )
}

// ── Horizontal bar list (rankings) ─────────────────────────────────────

export interface BarRow {
  label: string
  value: number
  hint?: string
  href?: string
}

export function BarList({ rows, format = fmtInt, empty = 'Henüz veri yok.' }: { rows: BarRow[]; format?: (n: number) => string; empty?: string }) {
  if (rows.length === 0) return <p className={s.empty}>{empty}</p>
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className={s.barList}>
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`} className={s.barRow} title={r.hint ? `${r.label} · ${r.hint}` : r.label}>
          <div className={s.barTrack}>
            <span className={s.barFill} style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
            <span className={s.barLabel}>
              {r.href ? (
                <a href={r.href} target="_blank" rel="noopener noreferrer">
                  {r.label}
                </a>
              ) : (
                r.label
              )}
            </span>
          </div>
          <span className={s.barValue}>{format(r.value)}</span>
        </li>
      ))}
    </ul>
  )
}

// ── Column chart (hours of the day) ────────────────────────────────────

export function ColumnChart({ values, labels, unit }: { values: number[]; labels: string[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...values)
  if (values.every((v) => v === 0)) return <p className={s.empty}>Henüz veri yok.</p>
  return (
    <div className={s.columns} onPointerLeave={() => setHover(null)}>
      {values.map((v, i) => (
        <div key={i} className={s.column} onPointerEnter={() => setHover(i)}>
          {hover === i && (
            <span className={s.columnTip}>
              {labels[i]} · <strong>{fmtInt(v)}</strong> {unit}
            </span>
          )}
          <span className={s.columnBar} style={{ height: `${Math.max(v > 0 ? 3 : 0, (v / max) * 100)}%` }} />
          <span className={s.columnLabel}>{i % 3 === 0 ? labels[i] : ''}</span>
        </div>
      ))}
    </div>
  )
}

// ── helpers ───────────────────────────────────────────────────────────

function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))))
  const n = raw / pow
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn`
  if (n >= 1000) return `${(n / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} B`
  return String(n)
}
