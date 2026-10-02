// Conditional class name helper (without clsx dep, manual implementation)
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

// Format price in Turkish Lira
export function formatPrice(
  amount: number | string | { toString(): string } | null | undefined,
  options?: { currency?: string; locale?: string }
): string {
  // A missing amount is a data bug; show a dash instead of crashing the page or
  // implying the price is zero.
  if (amount === null || amount === undefined) return '—'
  const num = typeof amount === 'number' ? amount : parseFloat(amount.toString())
  if (isNaN(num)) return '₺0,00'

  return new Intl.NumberFormat(options?.locale ?? 'tr-TR', {
    style: 'currency',
    currency: options?.currency ?? 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

// Format date in Turkish locale
export function formatDate(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    ...options,
  }).format(d)
}

// Format date with time
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

// Generate order number
export function generateOrderNumber(id: string): string {
  const year = new Date().getFullYear()
  const short = id.slice(-6).toUpperCase()
  return `ZUU-${year}-${short}`
}

// Calculate discount percentage
export function calcDiscountPercent(price: number, oldPrice: number): number {
  if (!oldPrice || oldPrice <= price) return 0
  return Math.round(((oldPrice - price) / oldPrice) * 100)
}

// Slugify a string (Turkish character support)
export function slugify(text: string): string {
  const trMap: Record<string, string> = {
    ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i',
    ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u',
  }
  return text
    .split('')
    .map((c) => trMap[c] || c)
    .join('')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

// Truncate text
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trim() + '…'
}

// Safe JSON parse
export function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str) as T
  } catch {
    return fallback
  }
}

// Debounce function
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

// Check if value is a valid positive number
export function isPositiveNumber(val: unknown): val is number {
  return typeof val === 'number' && isFinite(val) && val > 0
}

// Paginate array (for server-side use)
export function paginate<T>(
  items: T[],
  page: number,
  perPage: number
): { items: T[]; total: number; pages: number; page: number } {
  const total = items.length
  const pages = Math.ceil(total / perPage)
  const start = (page - 1) * perPage
  return {
    items: items.slice(start, start + perPage),
    total,
    pages,
    page,
  }
}

// Build pagination meta for API responses
export function buildPaginationMeta(
  total: number,
  page: number,
  perPage: number
) {
  return {
    total,
    page,
    perPage,
    pages: Math.ceil(total / perPage),
    hasNext: page * perPage < total,
    hasPrev: page > 1,
  }
}
