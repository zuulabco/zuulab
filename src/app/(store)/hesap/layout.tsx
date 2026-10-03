import styles from './AccountScope.module.css'

/**
 * Every /hesap page shares one typeface. The mono token used across the account
 * modules (labels, order numbers, dates) is pointed at the site sans here, with
 * even-width digits so prices and numbers still line up.
 */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.scope}>{children}</div>
}
