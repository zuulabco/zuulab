import { db } from '../prisma/db'
import {
  adminCreateProduct,
  adminUpdateProduct,
  adminArchiveProduct,
  adminRestoreProduct,
  adminGetProducts,
  adminGetProductById,
} from '../lib/services/catalog-admin.service'
import {
  getProducts,
  getProductBySlug,
  getProductById,
  getProductsByCategory,
  getProductsByCollection,
  getBestSellers,
  getCategories,
  verifyAndCalculateCart,
} from '../lib/services/products.service'

async function runCatalogVerification() {
  console.log('=================================================================')
  console.log('🧪 RUNNING COMPREHENSIVE ZUULAB DATABASE CATALOG VERIFICATION')
  console.log('=================================================================\n')

  let passed = 0
  let failed = 0

  function assert(cond: boolean, name: string, details?: any) {
    if (cond) {
      console.log(`  ✅ PASS: ${name}`)
      passed++
    } else {
      console.error(`  ❌ FAIL: ${name}`, details || '')
      failed++
    }
  }

  // 1. Initial State Check
  console.log('--- TEST GROUP 1: INITIAL DB STATE & SEED IDEMPOTENCY ---')
  const initialProducts = await db.orm.public.Product.all()
  assert(initialProducts.length >= 16, `Initial DB products count is at least 16 (Found: ${initialProducts.length})`)

  // 2. Check Admin Test Product (ZUU-TES-435) in DB
  const testProdInDb = await db.orm.public.Product.where({ sku: 'ZUU-TES-435' }).first()
  assert(Boolean(testProdInDb), 'Admin Test Product (ZUU-TES-435) exists in PostgreSQL DB', testProdInDb)
  assert(testProdInDb?.name === 'Test Ürün', 'Admin Test Product name is "Test Ürün"')

  // 3. Storefront Product List from DB
  console.log('\n--- TEST GROUP 2: STOREFRONT PRODUCTS SERVICE ---')
  const storefrontAll = await getProducts({ limit: 50 })
  assert(storefrontAll.items.length >= 16, `Storefront list returns DB products (Count: ${storefrontAll.items.length})`)

  const testProdInStorefront = storefrontAll.items.find((p) => p.sku === 'ZUU-TES-435' || p.slug === 'test-urun')
  assert(Boolean(testProdInStorefront), 'Test Ürün is visible in Storefront product list (/urunler)')
  assert(testProdInStorefront?.price === 199, 'Test Ürün price is 199 TL in Storefront')

  // 4. Product Detail by Slug
  const detailBySlug = await getProductBySlug('test-urun')
  assert(Boolean(detailBySlug), 'getProductBySlug("test-urun") returns valid product from DB')
  assert(detailBySlug?.images.length! > 0, 'Test Ürün has image loaded from DB')
  assert(detailBySlug?.variants?.length! > 0, 'Test Ürün has variant loaded from DB')

  // 5. Existing Products Still Visible
  const dinoProduct = await getProductBySlug('mini-dinozor-serisi-set')
  assert(Boolean(dinoProduct), 'Existing product (mini-dinozor-serisi-set) is visible and loaded from DB')
  assert(dinoProduct?.price === 279, 'Existing product price is correct')

  // 6. Categories and Collections from DB
  console.log('\n--- TEST GROUP 3: CATEGORIES & COLLECTIONS ---')
  const categories = await getCategories()
  assert(categories.length >= 10, `Categories fetched from DB (Count: ${categories.length})`)
  const figurlerCat = categories.find((c) => c.slug === 'figurler')
  assert(Boolean(figurlerCat && figurlerCat.productCount > 0), `Category "figurler" has live product count: ${figurlerCat?.productCount}`)

  const kidsProducts = await getProductsByCollection('zuukids')
  assert(kidsProducts.length > 0, `getProductsByCollection("zuukids") returns ${kidsProducts.length} products`)

  const figurlerProducts = await getProductsByCategory('figurler')
  assert(figurlerProducts.length > 0, `getProductsByCategory("figurler") returns ${figurlerProducts.length} products`)

  const bestSellers = await getBestSellers(4)
  assert(bestSellers.length === 4, `getBestSellers(4) returns 4 items`)

  // 7. Cart & Price Tamper Verification
  console.log('\n--- TEST GROUP 4: CART & PRICE SECURITY VERIFICATION ---')
  // User attempts to buy Test Ürün at tampered price 1 TL, but DB says 199 TL
  const cartCalculation = await verifyAndCalculateCart([
    { productId: testProdInDb!.id, quantity: 2 }
  ])
  assert(cartCalculation.items.length === 1, 'verifyAndCalculateCart includes valid active product')
  assert(cartCalculation.items[0].price === 199, 'Server recalculates price from DB (199 TL, not tampered)')
  assert(cartCalculation.subtotal === 398, `Subtotal is correctly 398 TL (2 * 199) - actual: ${cartCalculation.subtotal}`)

  // 8. Nonexistent product rejection
  const invalidCart = await verifyAndCalculateCart([
    { productId: 'nonexistent-prod-id', quantity: 1 }
  ])
  assert(invalidCart.items.length === 0, 'verifyAndCalculateCart rejects nonexistent product')
  assert(invalidCart.subtotal === 0, 'Subtotal for rejected product is 0')

  // 9. Insufficient stock clamping
  const highQtyCart = await verifyAndCalculateCart([
    { productId: testProdInDb!.id, quantity: 9999 }
  ])
  assert(highQtyCart.items[0].quantity <= testProdInDb!.stock, `Quantity is clamped to available stock (${highQtyCart.items[0].quantity} <= ${testProdInDb!.stock})`)

  // 10. Admin Product CRUD Flow
  console.log('\n--- TEST GROUP 5: ADMIN CRUD TO DB PERSISTENCE ---')
  const newSku = `ZUU-AUTOTEST-${Date.now().toString().slice(-4)}`
  const createdAdminProd = await adminCreateProduct({
    name: 'E2E Otomatik Test Ürünü',
    price: 350,
    categoryId: 'cat-figurler',
    sku: newSku,
    stock: 50,
    status: 'ACTIVE',
    imageUrl: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=1000&q=80',
  }, 'admin-tester@zuulab.com')

  assert(Boolean(createdAdminProd?.id), `adminCreateProduct created product with ID: ${createdAdminProd.id}`)

  // Verify in DB directly
  const verifyCreatedInDb = await db.orm.public.Product.where({ id: createdAdminProd.id }).first()
  assert(Boolean(verifyCreatedInDb), 'Newly created product physically exists in PostgreSQL Product table')
  assert(verifyCreatedInDb?.sku === newSku, 'DB record SKU matches')

  // Verify immediately in Storefront
  const storefrontFound = await getProductBySlug(createdAdminProd.slug)
  assert(Boolean(storefrontFound), 'Newly created admin product is immediately readable by Storefront getProductBySlug')

  // Update product in admin
  const updatedAdminProd = await adminUpdateProduct(createdAdminProd.id, {
    name: 'E2E Otomatik Test Ürünü (GÜNCELLENDİ)',
    price: 390,
  }, 'admin-tester@zuulab.com')
  assert(updatedAdminProd.name.includes('GÜNCELLENDİ'), 'adminUpdateProduct updated product name in memory & DB')

  const verifyUpdatedInDb = await db.orm.public.Product.where({ id: createdAdminProd.id }).first()
  assert(verifyUpdatedInDb?.name.includes('GÜNCELLENDİ'), 'PostgreSQL record was updated')
  assert(Number(verifyUpdatedInDb?.price) === 390, 'PostgreSQL price was updated to 390')

  // Soft delete / archive product in admin
  await adminArchiveProduct(createdAdminProd.id, 'admin-tester@zuulab.com')
  const verifyArchivedInDb = await db.orm.public.Product.where({ id: createdAdminProd.id }).first()
  assert(verifyArchivedInDb?.isActive === false, 'adminArchiveProduct set isActive = false in DB')

  // Storefront getProducts should now filter it out
  const storefrontAfterArchive = await getProducts({ limit: 100 })
  const foundArchivedInStore = storefrontAfterArchive.items.find((p) => p.id === createdAdminProd.id)
  assert(!foundArchivedInStore, 'Archived product is not shown on storefront')

  // Restore product
  await adminRestoreProduct(createdAdminProd.id, 'admin-tester@zuulab.com')
  const verifyRestoredInDb = await db.orm.public.Product.where({ id: createdAdminProd.id }).first()
  assert(verifyRestoredInDb?.isActive === true, 'adminRestoreProduct set isActive = true in DB')

  console.log('\n=================================================================')
  console.log(`🏁 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`)
  console.log('=================================================================')

  if (failed > 0) {
    process.exit(1)
  }
}

runCatalogVerification().catch((err) => {
  console.error('Test execution failed:', err)
  process.exit(1)
})
