// API response types

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  perPage: number
  pages: number
  hasNext: boolean
  hasPrev: boolean
}

export type ApiError = {
  code: string
  message: string
  field?: string
}
