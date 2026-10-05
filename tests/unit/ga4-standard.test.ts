import { describe, expect, it, vi } from 'vitest'
import { toGa4Params } from '@/lib/marketing/destinations/ga4-browser'
import { buildEvent, type MarketingEvent } from '@/lib/marketing/events'
import { cartLineToItem } from '@/lib/marketing/cart'
import { buildPurchaseEvent } from '@/lib/marketing/purchase'

vi.mock('@/lib/services/catalog/catalog.service', () => ({
  getProductsByIds: async (ids: string[]) => ids.filter((i) => i === 'p1').map((id) => ({ id, categoryName: 'Aydınlatma' })),
}))

const ev = (name: Parameters<typeof buildEvent>[0], data: Parameters<typeof buildEvent>[1]): MarketingEvent =>
  buildEvent(name, data, { source: 'browser', consent: 'all' })

const line = { productId: 'p1', variantId: 'v1', name: 'muse lamba', variantLabel: 'Beyaz', price: 999, quantity: 2, sku: 'ZL-1', categoryName: 'Aydınlatma' }

describe('GA4 e-commerce events follow the recommended shape', () => {
  it('view_item / add_to_cart: currency, value, items with id, name, price, quantity, category, variant', () => {
    const p = toGa4Params(ev('add_to_cart', { productId: 'p1', productName: 'muse lamba', sku: 'ZL-1', category: 'Aydınlatma', variantLabel: 'Beyaz', quantity: 2, price: 999, currency: 'TRY' }))!
    expect(p).toMatchObject({ currency: 'TRY', value: 1998 })
    expect(p.items).toEqual([{ item_id: 'ZL-1', item_name: 'muse lamba', price: 999, quantity: 2, item_brand: 'zuulab', item_category: 'Aydınlatma', item_variant: 'Beyaz', index: 0 }])
  })

  it('a cart line keeps its category into begin_checkout and add_payment_info', () => {
    const items = [cartLineToItem(line)]
    expect(items[0].category).toBe('Aydınlatma')
    const begin = toGa4Params(ev('begin_checkout', { items, value: 1998, currency: 'TRY', coupon: 'YENI10' }))!
    expect(begin).toMatchObject({ value: 1998, coupon: 'YENI10' })
    expect((begin.items as Array<Record<string, unknown>>)[0].item_category).toBe('Aydınlatma')
    expect(toGa4Params(ev('add_payment_info', { items, value: 1998, currency: 'TRY', paymentMethod: 'CARD' }))).toMatchObject({ payment_type: 'CARD' })
  })

  it('purchase: transaction_id, revenue without shipping, shipping, coupon, items', () => {
    const built = buildPurchaseEvent({
      id: 'o', orderNumber: 'ZUU-5', userId: 'u', status: 'CONFIRMED', channel: 'DIRECT', paymentMethod: 'CARD',
      totalAmount: 1998 - 100 + 49.9, shippingAmount: 49.9, couponCode: 'YENI10', createdAt: '',
      items: [{ productId: 'p1', variantId: null, variantInfo: null, productName: 'muse lamba', sku: 'ZL-1', quantity: 2, unitPrice: 999 }],
    })!
    const p = toGa4Params({ ...built, source: 'browser', consent: 'all' })!
    expect(p.transaction_id).toBe('ZUU-5')
    expect(p.currency).toBe('TRY')
    // customer paid 1947.90 in total; GA4 revenue excludes the 49.90 shipping, which has its own field
    expect(p.value).toBe(1898)
    expect(p.shipping).toBe(49.9)
    expect(p.coupon).toBe('YENI10')
    expect((p.items as unknown[]).length).toBe(1)
  })

  it('sign_up and search', () => {
    expect(toGa4Params(ev('signup', { method: 'google' }))).toEqual({ method: 'google' })
    expect(toGa4Params(ev('search', { searchTerm: 'lamba' }))).toEqual({ search_term: 'lamba' })
  })
})

describe('purchase items get their category from the catalog', () => {
  it('adds the category of known products and leaves the rest alone', async () => {
    const { withItemCategories } = await import('@/lib/marketing/item-category')
    const out = await withItemCategories({
      items: [
        { productId: 'p1', productName: 'a', quantity: 1, price: 1 },
        { productId: 'gone', productName: 'b', quantity: 1, price: 1 },
        { productId: 'p1', productName: 'c', quantity: 1, price: 1, category: 'Kendi' },
      ],
    })
    expect(out.items!.map((i) => i.category)).toEqual(['Aydınlatma', undefined, 'Kendi'])
  })
})
