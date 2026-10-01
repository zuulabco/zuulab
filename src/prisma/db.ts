import 'server-only'
import { Temporal } from '@js-temporal/polyfill'

if (typeof (globalThis as any).Temporal === 'undefined') {
  ;(globalThis as any).Temporal = Temporal
}

import postgres from '@prisma/orm-postgres/runtime'
import type { Contract } from './contract.d'
import contractJson from './contract.json' with { type: 'json' }

const connectionUrl =
  process.env['DATABASE_URL'] ||
  'postgresql://postgres:postgres@localhost:5432/zuulab_e'

export const db = postgres<Contract>({
  contractJson,
  url: connectionUrl,
})

export const isDatabaseConfigured = Boolean(
  process.env['DATABASE_URL'] &&
    !process.env['DATABASE_URL'].includes('USER:PASSWORD')
)

export function assertProductionDatabase(): void {
  if (process.env.NODE_ENV === 'production' && !isDatabaseConfigured) {
    throw new Error('DATABASE_CONFIGURATION_ERROR: DATABASE_URL must be configured in production.')
  }
}
