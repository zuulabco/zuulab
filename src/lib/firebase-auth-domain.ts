/**
 * The address shown in the Google sign-in window. Firebase opens it on its "authDomain"; by default that is
 * the project's own `<project>.firebaseapp.com`, which looks like a stranger's site to customers. On the shop's
 * own address the window shows zuulab.com instead: next.config.ts passes /__/auth/* on to Firebase, so the
 * sign-in pages are served from the shop's domain.
 *
 * Only the storefront's own host is switched. Everything else (the admin subdomain, localhost, preview
 * deployments) keeps Firebase's address, because only the storefront address is registered as a redirect
 * address in Google Cloud (see DEPLOYMENT.md).
 */
export function resolveAuthDomain(fallback: string, hostname: string | undefined, siteUrl: string): string {
  if (!hostname) return fallback
  let siteHost: string
  try {
    siteHost = new URL(siteUrl).hostname.toLowerCase()
  } catch {
    return fallback
  }
  return hostname.toLowerCase() === siteHost && siteHost.includes('.') && !/^(localhost|127\.|\[)/.test(siteHost) ? siteHost : fallback
}

/** The Firebase-hosted address the shop's /__/auth/* is passed on to: the configured one if it is Firebase's, else derived from the project id */
export function firebaseHostedDomain(authDomain: string | undefined, projectId: string | undefined): string | null {
  const configured = (authDomain ?? '').trim().toLowerCase()
  if (/\.(firebaseapp\.com|web\.app)$/.test(configured)) return configured
  const id = (projectId ?? '').trim().toLowerCase()
  return /^[a-z0-9-]{4,}$/.test(id) ? `${id}.firebaseapp.com` : null
}
