import styles from './AccountHeader.module.css'

interface AccountHeaderProps {
  title: React.ReactNode
  /** One line telling the customer what this page is for. */
  description?: React.ReactNode
  /** Primary action for the page, e.g. "yeni adres ekle". */
  actions?: React.ReactNode
}

/** Same title block on every /hesap page. */
export default function AccountHeader({ title, description, actions }: AccountHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        <h1 className={styles.title}>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  )
}
