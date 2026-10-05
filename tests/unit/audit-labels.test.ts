import { describe, expect, it } from 'vitest'
import { describeAudit } from '@/lib/admin/audit-labels'

describe('describeAudit', () => {
  it('writes known actions as Turkish sentences', () => {
    expect(describeAudit({ action: 'CONTENT_PUBLISHED', entity: 'CMS', entityId: 'homepage' })).toBe('Ana sayfa içeriği yayınlandı')
    expect(describeAudit({ action: 'NOTIFICATION_SENT', entity: 'Notification', entityId: 'notif-1' })).toBe(
      'Müşteriye bilgilendirme e-postası gönderildi',
    )
  })

  it('adds the order number and amount, never the internal id', () => {
    const line = describeAudit({ action: 'PAYMENT_CREATED', entity: 'Payment', entityId: 'cmabc123', metadata: { orderNumber: 'ZUU-1', amount: 1250 } })
    expect(line).toContain('Sipariş ZUU-1')
    expect(line).toContain('1.250,00')
    expect(line).not.toContain('cmabc123')
  })

  it('shows e-mail campaign results', () => {
    expect(describeAudit({ action: 'EMAIL_CAMPAIGN_SENT', entity: 'EmailCampaign', entityId: 'x', metadata: { recipients: 2, sent: 2, failed: 0 } })).toBe(
      'E-posta kampanyası gönderildi — 2/2 kişiye gitti',
    )
  })

  it('falls back to a readable form for unknown codes', () => {
    expect(describeAudit({ action: 'SOME_NEW_THING' })).toBe('Some new thing')
  })
})
