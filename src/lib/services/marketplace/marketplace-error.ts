import type { MarketplaceProviderType } from './marketplace.interface'

export type MarketplaceErrorCode =
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'RATE_LIMITED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'TEMPORARY_ERROR'
  | 'PROVIDER_ERROR'
  | 'NOT_IMPLEMENTED'
  | 'NOT_CONFIGURED'
  | 'UNKNOWN_ERROR'

export class MarketplaceError extends Error {
  public readonly code: MarketplaceErrorCode
  public readonly provider: MarketplaceProviderType
  public readonly statusCode?: number
  public readonly retryAfterSeconds?: number
  public readonly isRetryable: boolean
  public readonly rawError?: unknown

  constructor(options: {
    message: string
    code: MarketplaceErrorCode
    provider: MarketplaceProviderType
    statusCode?: number
    retryAfterSeconds?: number
    isRetryable?: boolean
    rawError?: unknown
  }) {
    super(options.message)
    this.name = 'MarketplaceError'
    this.code = options.code
    this.provider = options.provider
    this.statusCode = options.statusCode
    this.retryAfterSeconds = options.retryAfterSeconds
    this.rawError = options.rawError

    // Calculate retryable default if not explicitly provided
    if (typeof options.isRetryable === 'boolean') {
      this.isRetryable = options.isRetryable
    } else {
      this.isRetryable = isCodeRetryable(options.code, options.statusCode)
    }

    Object.setPrototypeOf(this, MarketplaceError.prototype)
  }
}

export class NotImplementedMarketplaceError extends MarketplaceError {
  constructor(operation: string, provider: MarketplaceProviderType) {
    super({
      message: `Operation '${operation}' is not implemented for provider '${provider}' in Phase 16 (Foundation). Scheduled for subsequent marketplace operation phases.`,
      code: 'NOT_IMPLEMENTED',
      provider,
      isRetryable: false,
    })
    this.name = 'NotImplementedMarketplaceError'
    Object.setPrototypeOf(this, NotImplementedMarketplaceError.prototype)
  }
}

function isCodeRetryable(code: MarketplaceErrorCode, statusCode?: number): boolean {
  if (code === 'RATE_LIMITED' || code === 'TEMPORARY_ERROR') return true
  if (statusCode && (statusCode === 429 || (statusCode >= 500 && statusCode < 600))) {
    return true
  }
  return false
}

export function isRetryableMarketplaceError(error: unknown): boolean {
  if (error instanceof MarketplaceError) {
    return error.isRetryable
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return (
      msg.includes('etimedout') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('timeout') ||
      msg.includes('fetch failed')
    )
  }
  return false
}

export interface RetryOptions {
  maxRetries?: number
  initialDelayMs?: number
  maxDelayMs?: number
  factor?: number
  jitter?: boolean
}

/**
 * Executes a function with rate limit awareness, exponential backoff, and full jitter
 */
export async function executeWithRetryAndBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  provider: MarketplaceProviderType,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3
  const initialDelayMs = options.initialDelayMs ?? 500
  const maxDelayMs = options.maxDelayMs ?? 10000
  const factor = options.factor ?? 2
  const useJitter = options.jitter ?? true

  let attempt = 0

  while (true) {
    attempt++
    try {
      return await operation(attempt)
    } catch (err: unknown) {
      const isRetryable = isRetryableMarketplaceError(err)

      if (!isRetryable || attempt > maxRetries) {
        throw err
      }

      // Check for explicit Retry-After in MarketplaceError
      let delayMs: number
      if (err instanceof MarketplaceError && err.retryAfterSeconds) {
        delayMs = Math.min(err.retryAfterSeconds * 1000, maxDelayMs)
      } else {
        // Exponential backoff
        const calculatedDelay = initialDelayMs * Math.pow(factor, attempt - 1)
        delayMs = Math.min(calculatedDelay, maxDelayMs)
        if (useJitter) {
          // Full jitter: random between 0 and delayMs
          delayMs = Math.floor(Math.random() * delayMs)
        }
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}
