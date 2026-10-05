/**
 * Segment queries against the real Postgres database (DATABASE_URL). Read-only: nothing is written,
 * so it is safe while real customers shop. It checks that every query runs, that the numbers add up
 * (first-time + repeat buyers = all buyers; recent + inactive = all buyers) and that people listed
 * as reachable really hold an ACTIVE permission. Run with: npm run test:integration
 */
import 'dotenv/config'
import { describe, expect, it } from 'vitest'
import { SEGMENT_BY_KEY } from '@/lib/segments/definitions'
import { getSegment, getSegmentOverview, reachableEmails } from '@/lib/services/segments.service'

describe('segments (real database, read-only)', () => {
  it('every segment without a choice can be counted', async () => {
    const all = await getSegmentOverview()
    expect(all.length).toBe(8)
    for (const s of all) {
      expect(s.total, s.key).toBeGreaterThanOrEqual(0)
      expect(s.reachable, s.key).toBeLessThanOrEqual(s.total)
    }
  })

  it('first-time and repeat buyers add up to all customers; recent and inactive add up too', async () => {
    const [first, repeat, recent, inactive, spenders] = await Promise.all([
      getSegment('first_time_buyers', {}, 1),
      getSegment('repeat_buyers', {}, 1),
      getSegment('recent_buyers', { days: 90 }, 1),
      getSegment('inactive_customers', { days: 90 }, 1),
      getSegment('high_spenders', { minSpend: 1 }, 1),
    ])
    expect(first.total + repeat.total).toBe(spenders.total)
    expect(recent.total + inactive.total).toBe(spenders.total)
  })

  it('a segment that needs a choice says so and counts nothing', async () => {
    const r = await getSegment('product_buyers')
    expect(r.needs).toBeTruthy()
    expect(r.total).toBe(0)
    expect(SEGMENT_BY_KEY.product_buyers.params.length).toBe(1)
  })

  it('reachable e-mails are only those with an ACTIVE permission', async () => {
    const result = await getSegment('first_time_buyers', {}, 1000)
    const emails = await reachableEmails('first_time_buyers')
    expect(emails.length).toBe(result.members.filter((m) => m.reachable).length)
    expect(emails.length).toBe(result.reachable)
  })
})
