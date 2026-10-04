/**
 * One-time Geliver setup: creates the sender/return address (the workshop's return
 * address in config/company.ts) and registers the tracking webhook.
 *
 *   npx tsx --env-file=.env scripts/geliver-setup.ts
 *
 * Needs GELIVER_API_TOKEN and GELIVER_WEBHOOK_SECRET. Prints the variables to copy to
 * Vercel and fills GELIVER_SENDER_ADDRESS_ID / GELIVER_RETURN_ADDRESS_ID in .env.
 * Safe to run again: an existing address or webhook is reused.
 */
import fs from 'node:fs'
import { COMPANY } from '../src/config/company'

const API = 'https://api.geliver.io/api/v1'
/** Geliver must reach the live site; a local NEXT_PUBLIC_APP_URL (localhost) is never used */
const SITE = (process.env.GELIVER_WEBHOOK_BASE_URL || 'https://www.zuulab.com').replace(/\/$/, '')
/** Postal code of the return address (Beşkavaklar Mah., Merkez / Bolu) */
const SENDER_ZIP = '14100'
const SHORT_NAME = 'zuulab-atolye'

const token = process.env.GELIVER_API_TOKEN?.trim()
const secret = process.env.GELIVER_WEBHOOK_SECRET?.trim()
if (!token) throw new Error('GELIVER_API_TOKEN is empty: paste the token from https://app.geliver.io/apitokens into .env')
if (!secret) throw new Error('GELIVER_WEBHOOK_SECRET is empty')

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = (await res.json().catch(() => null)) as { result?: boolean; data?: T; additionalMessage?: string } | null
  if (!res.ok || !json || json.result === false) throw new Error(`${method} ${path}: ${json?.additionalMessage || res.status}`)
  return json.data as T
}

// The return address: "Beşkavaklar Mah. ... , Merkez / Bolu"
const [street] = COMPANY.returnAddress.split(/,\s*Merkez\s*\/\s*Bolu/i)
const districts = await call<Array<{ name: string; districtID: number }>>('GET', '/districts?countryCode=TR&cityCode=14')
const merkez = districts.find((d) => d.name === 'Merkez')
if (!merkez) throw new Error('Bolu Merkez not found in Geliver districts')

type Address = { id: string; shortName?: string; isRecipientAddress?: boolean }
const existing = (await call<Address[]>('GET', '/addresses?isRecipientAddress=false&limit=100&page=1').catch(() => [] as Address[])).find(
  (a) => a.shortName === SHORT_NAME
)
const address =
  existing ??
  (await call<Address>('POST', '/addresses', {
    name: COMPANY.tradeName,
    email: COMPANY.email,
    phone: COMPANY.phoneE164,
    address1: street.trim(),
    countryCode: 'TR',
    cityName: 'Bolu',
    cityCode: '14',
    districtName: merkez.name,
    districtID: merkez.districtID,
    zip: SENDER_ZIP,
    isRecipientAddress: false,
    shortName: SHORT_NAME,
  }))
console.log(existing ? 'Sender address already exists:' : 'Sender address created:', address.id)

const webhookUrl = `${SITE}/api/shipping/geliver/webhook?token=${encodeURIComponent(secret)}`
type Hook = { id: string; url: string; type: string }
const hooks = await call<Hook[]>('GET', '/webhook').catch(() => [] as Hook[])
// Webhooks of this shop pointing elsewhere (an old secret, a local address) are removed
for (const h of hooks.filter((h) => h.url.includes('/api/shipping/geliver/webhook') && h.url !== webhookUrl)) {
  await call('DELETE', `/webhook/${h.id}`)
  console.log('Removed old webhook:', h.id, h.url.split('?')[0])
}
if (hooks.some((h) => h.url === webhookUrl && h.type === 'TRACK_UPDATED')) {
  console.log('Webhook already registered')
} else {
  const hook = await call<Hook>('POST', '/webhook', { type: 'TRACK_UPDATED', url: webhookUrl })
  console.log('Webhook registered:', hook.id, `${SITE}/api/shipping/geliver/webhook?token=…`)
}

// Fill the ids into the local .env
const envPath = '.env'
let env = fs.readFileSync(envPath, 'utf8')
for (const key of ['GELIVER_SENDER_ADDRESS_ID', 'GELIVER_RETURN_ADDRESS_ID']) {
  env = env.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}="${address.id}"`)
}
fs.writeFileSync(envPath, env)

console.log('\nAdd these to Vercel (Settings → Environment Variables → Production):')
console.log('  GELIVER_API_TOKEN          = (your token)')
console.log(`  GELIVER_SENDER_ADDRESS_ID  = ${address.id}`)
console.log(`  GELIVER_RETURN_ADDRESS_ID  = ${address.id}`)
console.log('  GELIVER_WEBHOOK_SECRET     = (same value as in .env)')
console.log('  GELIVER_TEST_MODE          = false (or leave unset)')
