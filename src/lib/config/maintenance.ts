/**
 * ZUULAB E-Commerce — Maintenance Mode Configuration & Utilities
 * 
 * Provides:
 * 1. Safe environment variable evaluation for MAINTENANCE_MODE and MAINTENANCE_ALLOWED_IPS
 * 2. Multi-tier IP detection optimized for Vercel Edge / Node runtime (x-vercel-ip, cf-connecting-ip, x-real-ip, x-forwarded-for)
 * 3. Robust IPv4 & IPv6 normalization and comparison
 * 4. High-performance, self-contained editorial maintenance page matching ZUULAB design tokens
 */

export interface MaintenanceModeStatus {
  enabled: boolean
  source: 'database' | 'env' | 'default'
  allowedIps: string[]
  updatedAt?: string
}

// In-process cache for fast proxy evaluation without DB overhead on every request
let _cachedMaintenanceEnabled: boolean | null = null
let _cachedSource: 'database' | 'env' | 'default' = 'default'

export function setCachedMaintenanceState(enabled: boolean, source: 'database' | 'env' | 'default' = 'database'): void {
  _cachedMaintenanceEnabled = enabled
  _cachedSource = source
}

export function getCachedMaintenanceState(): { enabled: boolean | null; source: 'database' | 'env' | 'default' } {
  return { enabled: _cachedMaintenanceEnabled, source: _cachedSource }
}

export function isMaintenanceModeEnabled(): boolean {
  // If explicitly set in runtime cache (from DB or admin action), respect it
  if (_cachedMaintenanceEnabled !== null) {
    return _cachedMaintenanceEnabled
  }

  // Fallback to process.env.MAINTENANCE_MODE
  const val = process.env.MAINTENANCE_MODE?.trim().toLowerCase()
  return val === 'true' || val === '1' || val === 'yes'
}

export function getMaintenanceAllowedIps(): string[] {
  const raw = process.env.MAINTENANCE_ALLOWED_IPS || ''
  return raw
    .split(',')
    .map((ip) => normalizeIp(ip))
    .filter(Boolean)
}

/**
 * Normalizes an IP address:
 * - Trims whitespace
 * - Converts to lowercase
 * - Strips IPv4-mapped IPv6 prefix (e.g. ::ffff:192.168.1.1 -> 192.168.1.1)
 * - Normalizes IPv6 loopback (::1 <-> 127.0.0.1)
 */
export function normalizeIp(ip: string | null | undefined): string {
  if (!ip) return ''
  let cleaned = ip.trim().toLowerCase()

  // Remove port if present (e.g. "192.168.1.1:443" or "[::1]:8080")
  if (cleaned.startsWith('[') && cleaned.includes(']')) {
    cleaned = cleaned.slice(1, cleaned.indexOf(']'))
  } else if (cleaned.includes(':') && cleaned.split(':').length === 2 && !cleaned.includes('::')) {
    // IPv4 with port: 1.2.3.4:80
    cleaned = cleaned.split(':')[0]
  }

  // Strip IPv4-mapped IPv6 prefix
  if (cleaned.startsWith('::ffff:')) {
    cleaned = cleaned.slice(7)
  }

  return cleaned
}

/**
 * The client IP, from headers the hosting edge sets itself.
 *
 * Vercel overwrites x-real-ip / x-forwarded-for / x-vercel-forwarded-for with the
 * real client address, so a visitor cannot forge them there. cf-connecting-ip is
 * only set by Cloudflare: without Cloudflare in front, anyone can send it, which
 * would let a request pick its own IP (bypassing maintenance mode and every IP-based
 * rate limit). It is therefore trusted only when TRUST_CLOUDFLARE_IP=1.
 */
export function getClientIp(headers: Headers): string {
  const first = (value: string | null) => {
    const ip = value?.split(',')[0]?.trim()
    return ip ? normalizeIp(ip) : ''
  }

  if (process.env.TRUST_CLOUDFLARE_IP === '1') {
    const cf = first(headers.get('cf-connecting-ip'))
    if (cf) return cf
  }

  return (
    first(headers.get('x-real-ip')) ||
    first(headers.get('x-forwarded-for')) ||
    first(headers.get('x-vercel-forwarded-for')) ||
    '127.0.0.1'
  )
}

/**
 * Checks whether client IP matches any of the allowed IPs.
 * Supports loopback equivalence (127.0.0.1 <-> ::1).
 */
export function isIpAllowed(clientIp: string, allowedIps: string[]): boolean {
  if (!allowedIps || allowedIps.length === 0) {
    return false
  }

  const normalizedClient = normalizeIp(clientIp)
  if (!normalizedClient) return false

  // Localhost aliases check
  const isClientLocalhost = normalizedClient === '127.0.0.1' || normalizedClient === '::1' || normalizedClient === 'localhost'

  for (const allowed of allowedIps) {
    const normalizedAllowed = normalizeIp(allowed)
    if (!normalizedAllowed) continue

    if (normalizedClient === normalizedAllowed) {
      return true
    }

    // If client is localhost, allow if any localhost variant is allowed
    if (isClientLocalhost && (normalizedAllowed === '127.0.0.1' || normalizedAllowed === '::1' || normalizedAllowed === 'localhost')) {
      return true
    }
  }

  return false
}

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost'])

/**
 * A request made on the machine itself: opened as localhost / 127.0.0.1 and coming from
 * a loopback address. Lets the developer use http://localhost:3000 during maintenance
 * without listing it. Deployed sites are reached by their domain name and Vercel sets the
 * real client address, so this can never match there.
 */
export function isLocalRequest(hostname: string, clientIp: string): boolean {
  return LOOPBACK.has(hostname.toLowerCase().replace(/^\[|\]$/g, '')) && LOOPBACK.has(normalizeIp(clientIp))
}

/**
 * Generates editorial, premium maintenance HTML adhering to ZUULAB Design System v2.
 * Completely self-contained with zero external stylesheet dependencies to ensure 100% reliable rendering.
 */
export function getMaintenanceHtml(): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ZUULAB — Yapım Aşamasında</title>
  <meta name="description" content="ZUULAB şu anda yapım aşamasında. Yeni deneyimimizi hazırlıyoruz.">
  <meta name="robots" content="noindex, nofollow">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" href="/ZL_FAVICON.svg" type="image/svg+xml">
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    :root {
      --surface-0: #ffffff;
      --surface-1: #f8f8f7;
      --surface-2: #f0f0ef;
      --text-primary: #111110;
      --text-secondary: #4a4a48;
      --text-muted: #888886;
      --border: #e4e4e2;
      --border-subtle: #ededeb;
      --zuu-blue: #0080C4;
      --zuu-yellow: #FEC80F;
      --zuu-yellow-light: #fff8e0;
      --radius-xs: 2px;
      --radius-sm: 4px;
      --font-stack: -apple-system, BlinkMacSystemFont, "DM Sans", "Plus Jakarta Sans", "Inter", "Segoe UI", Roboto, sans-serif;
    }

    body {
      font-family: var(--font-stack);
      background-color: var(--surface-1);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      padding: 32px 24px;
    }

    .shell {
      max-width: 640px;
      margin: 0 auto;
      width: 100%;
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 48px 0;
    }

    .brand-row {
      display: flex;
      align-items: baseline;
      gap: 2px;
      margin-bottom: 40px;
    }

    .brand-logo {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.045em;
      color: var(--text-primary);
      text-decoration: none;
    }

    .brand-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--zuu-blue);
      display: inline-block;
      margin-left: 2px;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--zuu-yellow-light);
      border: 1px solid rgba(254, 200, 15, 0.4);
      padding: 5px 12px;
      border-radius: var(--radius-xs);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #855d04;
      margin-bottom: 24px;
      width: fit-content;
    }

    .pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--zuu-yellow);
      box-shadow: 0 0 0 0 rgba(254, 200, 15, 0.7);
      animation: pulse 2s infinite cubic-bezier(0.4, 0, 0.6, 1);
    }

    @keyframes pulse {
      0% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(254, 200, 15, 0.7);
      }
      70% {
        transform: scale(1);
        box-shadow: 0 0 0 6px rgba(254, 200, 15, 0);
      }
      100% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(254, 200, 15, 0);
      }
    }

    .card {
      background: var(--surface-0);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 40px 36px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }

    h1 {
      font-size: 26px;
      font-weight: 600;
      line-height: 1.3;
      letter-spacing: -0.025em;
      color: var(--text-primary);
      margin-bottom: 14px;
    }

    p.lead {
      font-size: 15px;
      line-height: 1.65;
      color: var(--text-secondary);
      margin-bottom: 28px;
    }

    .divider {
      height: 1px;
      background: var(--border-subtle);
      margin-bottom: 24px;
    }

    .info-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
      font-size: 13px;
      color: var(--text-muted);
    }

    .info-item {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .info-icon {
      color: var(--zuu-blue);
      flex-shrink: 0;
    }

    .info-text strong {
      color: var(--text-primary);
      font-weight: 500;
    }

    .info-text a {
      color: var(--zuu-blue);
      text-decoration: none;
      font-weight: 500;
      border-bottom: 1px dotted var(--zuu-blue);
    }

    .info-text a:hover {
      border-bottom-style: solid;
    }

    footer {
      max-width: 640px;
      margin: 0 auto;
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: var(--text-muted);
      padding-top: 24px;
      border-top: 1px solid var(--border-subtle);
    }

    .footer-brand {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    @media (max-width: 600px) {
      body {
        padding: 20px 16px;
      }
      .card {
        padding: 28px 20px;
      }
      h1 {
        font-size: 22px;
      }
      footer {
        flex-direction: column;
        gap: 8px;
        align-items: flex-start;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="brand-row">
      <span class="brand-logo">zuulab</span>
      <span class="brand-dot" aria-hidden="true"></span>
    </div>

    <div class="status-badge">
      <span class="pulse-dot" aria-hidden="true"></span>
      <span>planlı bakım çalışması</span>
    </div>

    <main class="card">
      <h1>ZUULAB şu anda yapım aşamasında.</h1>
      <p class="lead">Yeni deneyimimizi hazırlıyoruz. Çok yakında tekrar buradayız.</p>
      
      <div class="divider"></div>

      <div class="info-grid">
        <div class="info-item">
          <svg class="info-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <div class="info-text">
            Mevcut siparişleriniz ve üretim süreçleri kesintisiz devam etmektedir.
          </div>
        </div>
        <div class="info-item">
          <svg class="info-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
            <polyline points="22,6 12,13 2,6"></polyline>
          </svg>
          <div class="info-text">
            İletişim ve destek: <a href="mailto:zuulab.co@gmail.com">zuulab.co@gmail.com</a>
          </div>
        </div>
      </div>
    </main>
  </div>

  <footer>
    <div class="footer-brand">
      <span>© 2026 zuulab. tüm hakları saklıdır.</span>
    </div>
    <div>
      <span>3d baskı tasarım atölyesi</span>
    </div>
  </footer>
</body>
</html>`
}
