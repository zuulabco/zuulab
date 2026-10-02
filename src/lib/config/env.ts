// Reads only process.env. Also loaded by src/instrumentation.ts at server start,
// which is outside the React server graph, so it does not import 'server-only'.

export interface EnvValidationResult {
  isValid: boolean
  isProduction: boolean
  errors: string[]
  warnings: string[]
  configuredServices: {
    database: boolean
    firebaseAdmin: boolean
    firebaseClient: boolean
    paytr: boolean
    uyumsoft: boolean
    surat: boolean
    yurtici: boolean
    resend: boolean
    cloudinary: boolean
    cron: boolean
  }
}

/**
 * Validates environment configuration according to the active deployment environment.
 * In production: Missing critical secrets trigger explicit, non-recoverable errors.
 * In development / staging: Returns clear warnings without halting the process.
 */
export function validateEnvironment(): EnvValidationResult {
  const isProduction = process.env.NODE_ENV === 'production'
  const errors: string[] = []
  const warnings: string[] = []

  // 1. DATABASE
  const dbUrl = process.env.DATABASE_URL
  const isDbConfigured = Boolean(
    dbUrl &&
    !dbUrl.includes('USER:PASSWORD') &&
    !dbUrl.includes('localhost:5432/zuulab_db?schema=public')
  )
  if (isProduction && !isDbConfigured) {
    errors.push('DATABASE_URL must be configured with valid production credentials.')
  } else if (!dbUrl) {
    warnings.push('DATABASE_URL is not set; falling back to local/default configuration.')
  }

  // 2. FIREBASE ADMIN
  const fbProjectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID
  const fbEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL
  const fbKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY
  const isFirebaseAdminConfigured = Boolean(
    fbProjectId &&
    fbEmail &&
    fbKey &&
    !fbProjectId.includes('your-') &&
    !fbEmail.includes('your-')
  )
  if (isProduction && !isFirebaseAdminConfigured) {
    errors.push('FIREBASE_ADMIN credentials (PROJECT_ID, CLIENT_EMAIL, PRIVATE_KEY) must be configured in production.')
  } else if (!isFirebaseAdminConfigured) {
    warnings.push('Firebase Admin SDK is not configured; dev mock token authentication active.')
  }

  // 3. FIREBASE CLIENT
  const fbClientKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  const isFirebaseClientConfigured = Boolean(fbClientKey && !fbClientKey.includes('your-'))
  if (isProduction && !isFirebaseClientConfigured) {
    errors.push('NEXT_PUBLIC_FIREBASE_API_KEY must be configured for client authentication in production.')
  }

  // 4. PAYMENT PROVIDER
  const paymentProvider = (process.env.PAYMENT_PROVIDER || 'PAYTR').toUpperCase()
  const paytrConfigured = Boolean(
    process.env.PAYTR_MERCHANT_ID &&
    process.env.PAYTR_MERCHANT_KEY &&
    process.env.PAYTR_MERCHANT_SALT &&
    !process.env.PAYTR_MERCHANT_ID.includes('your_')
  )
  if (isProduction) {
    if (paymentProvider !== 'PAYTR') {
      errors.push(`PAYMENT_PROVIDER must be PAYTR in production (got ${paymentProvider}).`)
    } else if (!paytrConfigured) {
      errors.push('PAYTR credentials (PAYTR_MERCHANT_ID, PAYTR_MERCHANT_KEY, PAYTR_MERCHANT_SALT) must be set in production.')
    }
  }

  // 5. INVOICE PROVIDER
  const invoiceProvider = (process.env.INVOICE_PROVIDER || 'UYUMSOFT').toUpperCase()
  const uyumsoftConfigured = Boolean(
    process.env.UYUMSOFT_USERNAME &&
    process.env.UYUMSOFT_PASSWORD &&
    !process.env.UYUMSOFT_USERNAME.includes('your_')
  )
  if (isProduction) {
    if (invoiceProvider === 'UYUMSOFT' && !uyumsoftConfigured) {
      errors.push('UYUMSOFT credentials (UYUMSOFT_USERNAME, UYUMSOFT_PASSWORD) must be configured in production.')
    } else if (invoiceProvider === 'MOCK') {
      errors.push('INVOICE_PROVIDER cannot be set to MOCK in production.')
    }
  }

  // 6. SHIPPING PROVIDERS
  const outboundCarrier = (process.env.OUTBOUND_SHIPPING_PROVIDER || process.env.SHIPPING_PROVIDER || 'MOCK').toUpperCase()
  const returnCarrier = (process.env.RETURN_SHIPPING_PROVIDER || process.env.SHIPPING_PROVIDER || 'MOCK').toUpperCase()
  const suratConfigured = Boolean(
    process.env.SURAT_CUSTOMER_CODE &&
    process.env.SURAT_PASSWORD &&
    !process.env.SURAT_CUSTOMER_CODE.includes('your_')
  )
  const yurticiConfigured = Boolean(
    process.env.YURTICI_WS_USERNAME &&
    process.env.YURTICI_WS_PASSWORD &&
    !process.env.YURTICI_WS_USERNAME.includes('your_')
  )

  if (isProduction) {
    if ((outboundCarrier === 'SURAT' || returnCarrier === 'SURAT') && !suratConfigured) {
      errors.push('SURAT credentials (SURAT_CUSTOMER_CODE, SURAT_PASSWORD) must be configured in production.')
    }
    if ((outboundCarrier === 'YURTICI' || returnCarrier === 'YURTICI') && !yurticiConfigured) {
      errors.push('YURTICI credentials (YURTICI_WS_USERNAME, YURTICI_WS_PASSWORD) must be configured in production.')
    }
    if (outboundCarrier === 'MOCK' || returnCarrier === 'MOCK') {
      warnings.push('Production warning: One or both carriers are set to MOCK; real shipments will not be dispatched.')
    }
  }

  // 7. EMAIL PROVIDER
  const emailProvider = (process.env.EMAIL_PROVIDER || 'MOCK').toUpperCase()
  const resendConfigured = Boolean(
    process.env.RESEND_API_KEY &&
    !process.env.RESEND_API_KEY.includes('your_') &&
    !process.env.RESEND_API_KEY.includes('re_123456789')
  )
  if (isProduction) {
    if (emailProvider === 'RESEND' && !resendConfigured) {
      errors.push('RESEND_API_KEY must be configured when EMAIL_PROVIDER is RESEND in production.')
    } else if (emailProvider === 'MOCK') {
      warnings.push('Production warning: EMAIL_PROVIDER is set to MOCK; transactional emails will not be sent.')
    }
  }

  // 8. CLOUDINARY
  const cloudinaryConfigured = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET &&
    !process.env.CLOUDINARY_API_KEY.includes('12345')
  )
  if (isProduction && !cloudinaryConfigured) {
    warnings.push('Cloudinary credentials not configured; media uploads will use simulated storage.')
  }

  // 9. CRON SECRET
  const cronSecretConfigured = Boolean(
    process.env.CRON_SECRET &&
    !process.env.CRON_SECRET.includes('secure_random')
  )
  if (isProduction && !cronSecretConfigured) {
    errors.push('CRON_SECRET must be configured in production to protect scheduled endpoints.')
  }

  // 10. AUTH & WEBHOOK SECRETS
  if (isProduction) {
    if (!process.env.AUTH_SESSION_SECRET) {
      warnings.push('AUTH_SESSION_SECRET is not set; session signing is derived from the Firebase private key. Set a dedicated random secret.')
    }
    if (!process.env.SHIPPING_WEBHOOK_SECRET) {
      warnings.push('SHIPPING_WEBHOOK_SECRET is not set; all carrier webhooks will be rejected.')
    }
    if (!process.env.TRENDYOL_WEBHOOK_SECRET || !process.env.HEPSIBURADA_WEBHOOK_SECRET) {
      warnings.push('TRENDYOL_WEBHOOK_SECRET / HEPSIBURADA_WEBHOOK_SECRET not set; those marketplace webhooks will be rejected.')
    }
    const credentialsKey = process.env.MARKETPLACE_CREDENTIALS_KEY?.trim() ?? ''
    const keyBytes = /^[0-9a-fA-F]{64}$/.test(credentialsKey)
      ? 32
      : Buffer.from(credentialsKey, 'base64').length
    if (keyBytes !== 32) {
      warnings.push('MARKETPLACE_CREDENTIALS_KEY is missing or not 32 bytes (base64/hex); marketplace API keys cannot be saved or used.')
    }
  }

  // 11. LIVE-READINESS
  if (isProduction) {
    if (paymentProvider === 'PAYTR' && process.env.PAYTR_TEST_MODE !== '0') {
      warnings.push('PAYTR_TEST_MODE is not "0": PayTR runs in TEST mode and real cards are not charged.')
    }
    if (!process.env.SUPPORT_INBOX_EMAIL && !process.env.RESEND_FROM_EMAIL) {
      warnings.push('SUPPORT_INBOX_EMAIL is not set; new support tickets and contact messages trigger no email alert.')
    }
  }

  // 12. APP URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (isProduction && (!appUrl || appUrl.includes('localhost') || appUrl.includes('127.0.0.1'))) {
    warnings.push(`NEXT_PUBLIC_APP_URL in production is set to '${appUrl}'. Webhook callbacks require a public HTTPS domain.`)
  }

  return {
    isValid: errors.length === 0,
    isProduction,
    errors,
    warnings,
    configuredServices: {
      database: isDbConfigured,
      firebaseAdmin: isFirebaseAdminConfigured,
      firebaseClient: isFirebaseClientConfigured,
      paytr: paytrConfigured,
      uyumsoft: uyumsoftConfigured,
      surat: suratConfigured,
      yurtici: yurticiConfigured,
      resend: resendConfigured,
      cloudinary: cloudinaryConfigured,
      cron: cronSecretConfigured,
    },
  }
}

/**
 * Throws explicit error in production if critical configuration is missing.
 */
export function assertProductionConfigReady(): void {
  const result = validateEnvironment()
  if (result.isProduction && !result.isValid) {
    throw new Error(`CRITICAL_CONFIGURATION_ERROR: [${result.errors.join(' | ')}]`)
  }
}
