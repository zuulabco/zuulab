/**
 * Store campaigns, coupons on top of them, automatic SKUs and product materials,
 * against the real database. Campaigns here are limited to a run-only category (or to
 * cart sizes no real cart reaches) so a shopper browsing during the run is unaffected.
 * Everything created is removed in afterAll.
 */
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/admin.service', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}))

const { db } = await import('@/prisma/db')
const { quoteCart } = await import('@/lib/services/checkout/pricing.service')
const campaigns = await import('@/lib/services/campaigns.service')
const { validateCoupon } = await import('@/lib/services/coupons.service')
const { nextProductSku } = await import('@/lib/services/catalog-admin.service')
const materials = await import('@/lib/services/product-materials.service')

const RUN = `itcmp${Date.now().toString(36)}`
let categoryId = ''
let cheapId = ''
let bigId = ''
let userId = ''
let couponId = ''
const campaignIds: string[] = []

async function campaign(input: Parameters<typeof campaigns.adminCreateCampaign>[0]) {
  const c = await campaigns.adminCreateCampaign(input)
  campaignIds.push(c.id)
  return c
}

beforeAll(async () => {
  const category = await db.orm.public.Category.create({ name: `Test ${RUN}`, slug: `test-${RUN}`, isActive: true, sortOrder: 999 } as never)
  categoryId = category.id
  const make = async (suffix: string, price: string) =>
    (
      await db.orm.public.Product.create({
        name: `Test ${suffix} ${RUN}`,
        slug: `test-${suffix}-${RUN}`,
        sku: `TEST-${suffix}-${RUN}`.toUpperCase(),
        price: price as never,
        taxRate: '20.00' as never,
        stock: 50,
        isActive: true,
        categoryId,
      } as never)
    ).id
  cheapId = await make('a', '200.00')
  bigId = await make('b', '150000.00')
  userId = (await db.orm.public.User.create({ email: `${RUN}@example.com`, name: 'Test', role: 'CUSTOMER', status: 'ACTIVE' } as never)).id
}, 60_000)

afterAll(async () => {
  const run = (plan: Parameters<ReturnType<typeof db.runtime>['execute']>[0]) => db.runtime().execute(plan)
  for (const id of campaignIds) await run(db.raw.sql`DELETE FROM campaigns WHERE id = ${id}`.affectedCount().build())
  if (couponId) await run(db.raw.sql`DELETE FROM coupons WHERE id = ${couponId}`.affectedCount().build())
  await run(db.raw.sql`DELETE FROM products WHERE category_id = ${categoryId}`.affectedCount().build())
  await run(db.raw.sql`DELETE FROM categories WHERE id = ${categoryId}`.affectedCount().build())
  await run(db.raw.sql`DELETE FROM users WHERE id = ${userId}`.affectedCount().build())
  await run(db.raw.sql`DELETE FROM product_materials WHERE name LIKE ${`${RUN}%`}`.affectedCount().build())
  await db.close()
}, 60_000)

describe('campaigns in cart pricing', () => {
  it('takes a category percentage off automatically and records it separately', async () => {
    const before = await quoteCart({ items: [{ productId: cheapId, quantity: 2 }] })
    expect(before.campaignDiscount).toBe(0)

    await campaign({ name: 'Yüzde', kind: 'DISCOUNT', type: 'PERCENTAGE', discountValue: 10, categoryIds: [categoryId] })
    const q = await quoteCart({ items: [{ productId: cheapId, quantity: 2 }] })
    expect(q.subtotal).toBe(400)
    expect(q.campaignDiscount).toBe(40)
    expect(q.discountAmount).toBe(40)
    expect(q.campaign?.name).toBe('Yüzde')
    expect(q.total).toBe(Math.round((400 - 40 + q.shippingAmount) * 100) / 100)
  }, 60_000)

  it('picks the campaign that saves most and respects a minimum cart', async () => {
    await campaign({ name: 'Sabit', kind: 'DISCOUNT', type: 'FIXED', discountValue: 60, minSubtotal: 500, categoryIds: [categoryId] })
    expect((await quoteCart({ items: [{ productId: cheapId, quantity: 2 }] })).campaign?.name).toBe('Yüzde') // 400 < 500
    const q = await quoteCart({ items: [{ productId: cheapId, quantity: 3 }] }) // 600: 10% = 60 vs 60 fixed
    expect(q.campaignDiscount).toBe(60)
  }, 60_000)

  it('ignores switched-off and expired campaigns', async () => {
    const off = await campaign({ name: 'Kapalı', kind: 'DISCOUNT', type: 'FIXED', discountValue: 300, isActive: false, categoryIds: [categoryId] })
    await campaign({
      name: 'Bitti',
      kind: 'DISCOUNT',
      type: 'FIXED',
      discountValue: 300,
      startsAt: new Date(Date.now() - 86_400_000 * 2).toISOString(),
      endsAt: new Date(Date.now() - 86_400_000).toISOString(),
      categoryIds: [categoryId],
    })
    const q = await quoteCart({ items: [{ productId: cheapId, quantity: 3 }] })
    expect(q.campaignDiscount).toBe(60)
    await campaigns.adminSetCampaignActive(off.id, false)
  }, 60_000)

  it('gives first-order campaigns only to signed-in customers without a paid order', async () => {
    await campaign({ name: 'Hoş geldin', kind: 'DISCOUNT', type: 'FIXED', discountValue: 150, audience: 'FIRST_ORDER', categoryIds: [categoryId] })
    const guest = await quoteCart({ items: [{ productId: cheapId, quantity: 1 }] })
    expect(guest.campaign?.name).not.toBe('Hoş geldin')
    // A guest checkout carries a user id too (or a member's, if they typed that e-mail);
    // without a signed-in member it must not get the member-only discount.
    const guestWithOwner = await quoteCart({ items: [{ productId: cheapId, quantity: 1 }], userId })
    expect(guestWithOwner.campaign?.name).not.toBe('Hoş geldin')
    const member = await quoteCart({ items: [{ productId: cheapId, quantity: 1 }], userId, memberUserId: userId })
    expect(member.campaign?.name).toBe('Hoş geldin')
    expect(member.campaignDiscount).toBe(150)
  }, 60_000)

  it('applies a coupon on what the campaign left, and the coupon check reports only its own part', async () => {
    const coupon = await db.orm.public.Coupon.create({
      code: `${RUN}C`.toUpperCase(),
      type: 'PERCENTAGE',
      discountValue: '10.00',
      isActive: true,
      currentUses: 0,
    } as never)
    couponId = coupon.id
    const q = await quoteCart({ items: [{ productId: cheapId, quantity: 3 }], couponCode: coupon.code })
    expect(q.campaignDiscount).toBe(60)
    expect(q.couponDiscount).toBe(54) // 10% of 540
    expect(q.discountAmount).toBe(114)

    const check = await validateCoupon({ code: coupon.code, items: [{ productId: cheapId, quantity: 3 }] })
    expect(check.valid).toBe(true)
    expect(check.discountAmount).toBe(54)
  }, 60_000)

  it('free-shipping campaigns zero the delivery fee only above their minimum', async () => {
    await campaign({ name: 'Kargo bedava', kind: 'DISCOUNT', type: 'FREE_SHIPPING', minSubtotal: 100000 })
    const small = await quoteCart({ items: [{ productId: cheapId, quantity: 1 }] })
    expect(small.shippingAmount).toBeGreaterThanOrEqual(0)
    const big = await quoteCart({ items: [{ productId: bigId, quantity: 1 }] })
    expect(big.shippingAmount).toBe(0)
  }, 60_000)

  it('announcement campaigns change no price and are listed for the site only when shown', async () => {
    const ann = await campaign({ name: 'Duyuru', kind: 'ANNOUNCEMENT', type: 'PERCENTAGE', discountValue: 0, display: 'NONE' })
    expect((await campaigns.getPublicCampaigns()).some((c) => c.id === ann.id)).toBe(false)
    await expect(
      campaigns.adminUpdateCampaign(ann.id, { name: 'Duyuru', kind: 'ANNOUNCEMENT', type: 'PERCENTAGE', display: 'MODAL' })
    ).rejects.toThrow(/başlığı/)
  }, 60_000)

  it('rejects impossible values', async () => {
    await expect(campaign({ name: 'x', kind: 'DISCOUNT', type: 'PERCENTAGE', discountValue: 10 })).rejects.toThrow(/2 karakter/)
    await expect(campaign({ name: 'Çok', kind: 'DISCOUNT', type: 'PERCENTAGE', discountValue: 95 })).rejects.toThrow(/%90/)
    await expect(campaign({ name: 'Sıfır', kind: 'DISCOUNT', type: 'FIXED', discountValue: 0 })).rejects.toThrow(/0’dan/)
  }, 60_000)
})

describe('catalog helpers', () => {
  it('suggests the next ZL running number for a blank SKU', async () => {
    expect(await nextProductSku()).toMatch(/^ZL\d{4,}$/)
  }, 60_000)

  it('keeps one material per name, renames on products and blocks deleting a used one', async () => {
    const m = await materials.createProductMaterial({ name: `${RUN} PETG` })
    await expect(materials.createProductMaterial({ name: `${RUN} petg` })).rejects.toThrow(/zaten var/)

    await db.orm.public.Product.where({ id: cheapId }).update({ material: `${RUN} PETG` })
    expect((await materials.listProductMaterials()).find((x) => x.id === m.id)?.productCount).toBe(1)
    await expect(materials.deleteProductMaterial(m.id)).rejects.toThrow(/kullanılıyor/)

    await materials.updateProductMaterial(m.id, { name: `${RUN} PETG-HF` })
    const p = await db.orm.public.Product.select('material').where({ id: cheapId }).first()
    expect(p?.material).toBe(`${RUN} PETG-HF`)

    await db.orm.public.Product.where({ id: cheapId }).update({ material: 'PLA' })
    await materials.deleteProductMaterial(m.id)
    expect((await materials.listProductMaterials()).some((x) => x.id === m.id)).toBe(false)
  }, 60_000)
})
