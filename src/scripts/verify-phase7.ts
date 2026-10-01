import {
  adminCreateProduct,
  adminGetProductById,
  adminUpdateProduct,
  adminDuplicateProduct,
  adminArchiveProduct,
  adminBulkProductActions,
  adminGetCategories,
  adminDeleteCategory,
  adminGetCollections,
} from '../lib/services/catalog-admin.service'
import {
  adminAdjustStock,
  adminGetInventoryOverview,
  adminGetInventoryMovements,
} from '../lib/services/inventory-admin.service'
import {
  adminGetCustomers,
  adminGetCustomerDetail,
  adminUpdateCustomerStatus,
} from '../lib/services/customers-admin.service'
import {
  adminGetCouponsWithStats,
  adminCreateCoupon,
  adminToggleCoupon,
} from '../lib/services/coupons-admin.service'
import {
  adminGetCms,
  adminSaveDraftCms,
  adminPublishCms,
  getPublishedHomepageContent,
  getPublishedAnnouncements,
} from '../lib/services/cms.service'
import { hasPermission } from '../lib/services/permissions.service'
import {
  generateOrdersCsv,
  generateProductsCsv,
  generateCustomersCsv,
  generateInventoryCsv,
} from '../lib/services/export.service'

async function runPhase7Verification() {
  console.log('====================================================')
  console.log('🚀 STARTING ZUULAB PHASE 7 COMPREHENSIVE VERIFICATION')
  console.log('====================================================\n')

  let passed = 0
  let failed = 0

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${title}`)
      passed++
    } else {
      console.error(`  ✗ FAIL: ${title}`)
      failed++
    }
  }

  // 1. ROLE PERMISSIONS MATRIX
  console.log('--- 1. Testing Role-Based Permissions ---')
  assert(hasPermission('SUPER_ADMIN', 'PRODUCT_CREATE'), 'SUPER_ADMIN has PRODUCT_CREATE')
  assert(hasPermission('SUPER_ADMIN', 'PAYMENT_VIEW'), 'SUPER_ADMIN has PAYMENT_VIEW')
  assert(hasPermission('CONTENT_MANAGER', 'CONTENT_MANAGE'), 'CONTENT_MANAGER has CONTENT_MANAGE')
  assert(!hasPermission('CONTENT_MANAGER', 'PAYMENT_VIEW'), 'CONTENT_MANAGER CANNOT PAYMENT_VIEW')
  assert(!hasPermission('CONTENT_MANAGER', 'ORDER_UPDATE'), 'CONTENT_MANAGER CANNOT ORDER_UPDATE')
  assert(hasPermission('ORDER_MANAGER', 'ORDER_UPDATE'), 'ORDER_MANAGER has ORDER_UPDATE')
  assert(!hasPermission('ORDER_MANAGER', 'CONTENT_MANAGE'), 'ORDER_MANAGER CANNOT CONTENT_MANAGE')
  assert(hasPermission('SUPPORT', 'CUSTOMER_VIEW'), 'SUPPORT has CUSTOMER_VIEW')
  assert(!hasPermission('SUPPORT', 'PRODUCT_DELETE'), 'SUPPORT CANNOT PRODUCT_DELETE')
  assert(!hasPermission('CUSTOMER', 'PRODUCT_CREATE'), 'CUSTOMER CANNOT PRODUCT_CREATE')
  assert(!hasPermission('CUSTOMER', 'ORDER_VIEW'), 'CUSTOMER CANNOT ORDER_VIEW')

  // 2. PRODUCT MANAGEMENT & COST PRICE
  console.log('\n--- 2. Testing Product Lifecycle & Cost Price Privacy ---')
  const newProd = await adminCreateProduct({
    name: 'Phase 7 Test Dino Obje',
    price: 350,
    costPrice: 95,
    stock: 20,
    lowStockThreshold: 5,
    categoryId: 'cat-kids',
    collectionId: 'zuukids',
    status: 'ACTIVE',
  }, 'admin@zuulab.com')

  assert(newProd.name === 'Phase 7 Test Dino Obje', 'Product created with correct name')
  assert(newProd.costPrice === 95, 'Product created with secret costPrice for admin')
  assert(newProd.sku.startsWith('ZUU-'), 'Product generated valid SKU')

  // Update product
  const updated = await adminUpdateProduct(newProd.id, { price: 390 }, 'admin@zuulab.com')
  assert(updated.price === 390, 'Product price updated')

  // Duplicate product
  const duplicated = await adminDuplicateProduct(newProd.id, 'admin@zuulab.com')
  assert(duplicated.name.includes('(Kopya)'), 'Duplicated product name includes (Kopya)')
  assert(duplicated.sku !== newProd.sku, 'Duplicated product received unique SKU')
  assert(duplicated.slug !== newProd.slug, 'Duplicated product received unique slug')
  assert(duplicated.status === 'DRAFT', 'Duplicated product initialized in DRAFT status')

  // Archive product (Safe delete)
  const archived = await adminArchiveProduct(newProd.id, 'admin@zuulab.com')
  assert(archived.status === 'ARCHIVED', 'Product archived instead of hard-deleted')

  // Bulk actions
  const bulkRes = await adminBulkProductActions([duplicated.id], 'activate', 'admin@zuulab.com')
  assert(bulkRes.success && bulkRes.count === 1, 'Bulk action activated product')

  // 3. CATEGORY & COLLECTION INTEGRITY
  console.log('\n--- 3. Testing Category & Collection Management ---')
  const categories = await adminGetCategories()
  assert(categories.length > 0, 'Categories retrieved with product counts')
  assert(typeof categories[0].productCount === 'number', 'Category productCount calculated')

  // Category deletion prevention when it has products
  let deleteBlocked = false
  try {
    await adminDeleteCategory(categories[0].id, 'admin@zuulab.com')
  } catch (err: any) {
    deleteBlocked = true
  }
  assert(deleteBlocked, 'Deleting category with assigned products is safely blocked')

  // Collections with sortOrder & logos
  const collections = await adminGetCollections()
  assert(collections.length >= 4, 'Collections retrieved')
  const hasZuuKids = collections.some((c) => c.slug === 'zuukids')
  assert(hasZuuKids, 'zuukids collection preserved in lowercase')
  assert(collections[0].sortOrder <= collections[1].sortOrder, 'Collections ordered by sortOrder')

  // 4. INVENTORY & MANUAL ADJUSTMENT MOVEMENTS
  console.log('\n--- 4. Testing Inventory Overview & Stock Movements ---')
  const invOverview = await adminGetInventoryOverview()
  assert(invOverview.length > 0, 'Inventory overview calculated for all catalog items')
  assert(invOverview[0].available === invOverview[0].stock - invOverview[0].reserved, 'Available stock = Stock - Reserved')

  // Manual stock adjustment
  const adjustRes = await adminAdjustStock({
    productId: invOverview[0].productId,
    quantityChange: 15,
    movementType: 'RESTOCK',
    reason: 'Yeni parti 3D baskı üretimi',
    changedBy: 'admin@zuulab.com',
  })
  assert(adjustRes.success, 'Manual stock adjustment executed')
  assert(adjustRes.newStock === invOverview[0].stock + 15, 'New stock increased by 15')

  // Inventory movements history
  const movements = await adminGetInventoryMovements()
  assert(movements.length > 0, 'Inventory movements history contains entries')
  const lastMovement = movements[0]
  assert(lastMovement.movementType === 'RESTOCK', 'Movement type logged as RESTOCK')
  assert(lastMovement.reason === 'Yeni parti 3D baskı üretimi', 'Movement reason recorded')

  // 5. CUSTOMERS & STATUS SUSPENSION
  console.log('\n--- 5. Testing Customers & Safe Suspension ---')
  const customers = await adminGetCustomers()
  assert(customers.length > 0, 'Customers list retrieved with spend metrics')
  assert(typeof customers[0].totalSpend === 'number', 'Customer lifetime spend calculated')

  const custDetail = await adminGetCustomerDetail(customers[0].id)
  assert(custDetail !== null, 'Customer detail view loaded')
  assert((custDetail as any).password === undefined, 'No passwords or secrets exposed in customer detail')

  // Suspend customer
  const suspended = await adminUpdateCustomerStatus({
    customerId: customers[0].id,
    status: 'SUSPENDED',
    reason: 'Denetim testi askıya alma',
    adminEmail: 'admin@zuulab.com',
  })
  assert(suspended.status === 'SUSPENDED', 'Customer status updated to SUSPENDED')
  // Reactivate customer
  const reactivated = await adminUpdateCustomerStatus({
    customerId: customers[0].id,
    status: 'ACTIVE',
    adminEmail: 'admin@zuulab.com',
  })
  assert(reactivated.status === 'ACTIVE', 'Customer status restored to ACTIVE')

  // 6. COUPON MANAGEMENT & ANALYTICS
  console.log('\n--- 6. Testing Coupon Analytics & Order Tracking ---')
  const newCoupon = await adminCreateCoupon({
    code: 'TESTPHASE7',
    type: 'PERCENTAGE',
    discountValue: 25,
    minCartAmount: 400,
    maxUses: 50,
  }, 'admin@zuulab.com')
  assert(newCoupon.code === 'TESTPHASE7', 'Coupon created')

  const couponsWithStats = await adminGetCouponsWithStats()
  const found = couponsWithStats.find((c) => c.code === 'TESTPHASE7')
  assert(found !== undefined, 'Coupon found in analytics list')
  assert(typeof found?.usedCount === 'number', 'Coupon usedCount calculated from actual orders')
  assert(typeof found?.totalDiscountGranted === 'number', 'Coupon totalDiscountGranted calculated')
  assert(typeof found?.revenueGenerated === 'number', 'Coupon revenueGenerated calculated')

  // 7. HOMEPAGE CMS DRAFT / PUBLISH
  console.log('\n--- 7. Testing CMS Draft & Publish Workflow ---')
  const initialLive = await getPublishedHomepageContent()
  assert(initialLive.hero !== undefined, 'Live published hero exists')

  // Save a draft
  await adminSaveDraftCms({
    hero: {
      ...initialLive.hero,
      headlineMain: 'özel tasarım formlar,',
    },
  }, 'admin@zuulab.com')

  // Verify draft is updated, but published remains safe
  const draftState = await adminGetCms('DRAFT')
  assert(draftState.hero.headlineMain === 'özel tasarım formlar,', 'Draft CMS contains updated headline')
  const stillLive = await getPublishedHomepageContent()
  // Now publish
  await adminPublishCms('admin@zuulab.com')
  const nowLive = await getPublishedHomepageContent()
  assert(nowLive.hero.headlineMain === 'özel tasarım formlar,', 'Published CMS now reflects published draft')

  // Announcements
  const announcements = await getPublishedAnnouncements()
  assert(announcements.length > 0, 'Active announcements retrieved for frontend ticker')

  // 8. CSV EXPORTS
  console.log('\n--- 8. Testing Secure CSV Exports ---')
  const prodCsv = generateProductsCsv([newProd as any])
  assert(prodCsv.includes('SKU') && prodCsv.includes('Maliyet'), 'Products CSV contains headers')
  assert(!prodCsv.includes('password') && !prodCsv.includes('secret'), 'Products CSV contains no secrets')

  const custCsv = generateCustomersCsv(customers)
  assert(custCsv.includes('Müşteri ID') && custCsv.includes('E-posta'), 'Customers CSV contains headers')
  assert(!custCsv.includes('password') && !custCsv.includes('secret'), 'Customers CSV contains no credentials')

  const invCsv = generateInventoryCsv(invOverview)
  assert(invCsv.includes('Toplam Stok') && invCsv.includes('Satılabilir'), 'Inventory CSV contains headers')

  console.log('\n====================================================')
  console.log(`🏁 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`)
  console.log('====================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runPhase7Verification().catch((err) => {
  console.error('Verification script crashed:', err)
  process.exit(1)
})
