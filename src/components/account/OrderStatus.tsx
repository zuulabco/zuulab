import { customerOrderStatus, ORDER_STEPS } from './order-status'
import styles from './OrderStatus.module.css'

export function OrderStatusBadge({ status }: { status: string }) {
  const s = customerOrderStatus(status)
  return <span className={`${styles.badge} ${styles[s.tone]}`}>{s.label}</span>
}

/** Four-step progress line: onaylandı → hazırlanıyor → kargoda → teslim edildi. */
export function OrderTrack({ status }: { status: string }) {
  const { step } = customerOrderStatus(status)
  if (step === null) return null
  return (
    <ol className={styles.track} aria-label={`sipariş durumu: ${ORDER_STEPS[step]}`}>
      {ORDER_STEPS.map((label, i) => (
        <li
          key={label}
          className={`${styles.step} ${i <= step ? styles.stepDone : ''} ${i === step ? styles.stepCurrent : ''}`}
          aria-current={i === step ? 'step' : undefined}
        >
          <span className={styles.dot} />
          <span className={styles.stepLabel}>{label}</span>
        </li>
      ))}
    </ol>
  )
}
