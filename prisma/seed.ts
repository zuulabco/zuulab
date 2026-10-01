import { db, isDatabaseConfigured } from '../src/prisma/db'
import { MOCK_PRODUCTS, MOCK_CATEGORIES } from '../src/lib/mock-data'
import { COLLECTION_CONFIGS } from '../src/config/collections'
import { SEED_COUPONS } from '../src/lib/services/db-fallback'

async function main() {
  console.log('🌱 Starting Zuulab database seed...')

  if (!isDatabaseConfigured) {
    console.log(
      '⚠️ DATABASE_URL is not set or using dummy placeholder. Seed is running in preview verification mode.'
    )
  }

  // 1. Seed Collections
  console.log('📦 Seeding Collections...')
  for (const col of Object.values(COLLECTION_CONFIGS)) {
    try {
      if (isDatabaseConfigured) {
        await db.orm.public.Collection.create({
          name: col.name,
          slug: col.slug,
          description: col.description,
          shortDescription: col.tagline,
          logo: col.logo || null,
          heroImage: col.heroImage || null,
          accentColor: col.accentColor || null,
          status: 'ACTIVE',
          seoTitle: col.seo.title,
          seoDescription: col.seo.description,
        })
      }
      console.log(`  ✓ Collection: ${col.name}`)
    } catch (e: any) {
      console.log(`  ℹ Collection ${col.name} already exists or skipped:`, e.message?.slice(0, 80))
    }
  }

  // 2. Seed Categories
  console.log('📂 Seeding Categories...')
  for (const cat of MOCK_CATEGORIES) {
    try {
      if (isDatabaseConfigured) {
        await db.orm.public.Category.create({
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
          description: cat.description,
          image: cat.image,
          isActive: true,
        })
      }
      console.log(`  ✓ Category: ${cat.name}`)
    } catch (e: any) {
      console.log(`  ℹ Category ${cat.name} already exists or skipped:`, e.message?.slice(0, 80))
    }
  }

  // 3. Seed Products
  console.log('✨ Seeding Products...')
  for (const prod of MOCK_PRODUCTS) {
    try {
      if (isDatabaseConfigured) {
        await db.orm.public.Product.create({
          id: prod.id,
          name: prod.name,
          slug: prod.slug,
          sku: prod.sku,
          description: prod.description,
          shortDescription: prod.shortDescription,
          categoryId: prod.categoryId,
          price: String(prod.price) as any,
          oldPrice: prod.oldPrice ? (String(prod.oldPrice) as any) : null,
          costPrice: String(prod.cost || Math.round(prod.price * 0.35)) as any,
          material: prod.material,
          productionTime: prod.productionTime,
          isFeatured: prod.isFeatured,
          featured: prod.isFeatured,
          isNew: prod.isNew,
          isBestSeller: prod.isBestSeller || false,
          bestSeller: prod.isBestSeller || false,
          stock: prod.stock,
          isActive: prod.isActive,
        })
      }
      console.log(`  ✓ Product: ${prod.name}`)
    } catch (e: any) {
      console.log(`  ℹ Product ${prod.name} already exists or skipped:`, e.message?.slice(0, 80))
    }
  }

  // 4. Seed Coupons
  console.log('🎟️ Seeding Coupons...')
  for (const coup of SEED_COUPONS) {
    try {
      if (isDatabaseConfigured) {
        await db.orm.public.Coupon.create({
          id: coup.id,
          code: coup.code,
          type: coup.type as any,
          discountValue: String(coup.discountValue) as any,
          minCartAmount: coup.minCartAmount ? (String(coup.minCartAmount) as any) : null,
          maxUses: coup.maxUses || null,
          currentUses: coup.currentUses,
          isActive: coup.isActive,
        })
      }
      console.log(`  ✓ Coupon: ${coup.code}`)
    } catch (e: any) {
      console.log(`  ℹ Coupon ${coup.code} already exists or skipped:`, e.message?.slice(0, 80))
    }
  }

  // 5. Seed Users (Admin & Customer)
  console.log('👤 Seeding Users...')
  const users = [
    {
      id: 'usr-admin-001',
      firebaseUid: 'admin-firebase-uid',
      email: 'admin@zuulab.com',
      name: 'Zuulab Admin',
      role: 'ADMIN',
      status: 'ACTIVE',
    },
    {
      id: 'usr-cust-001',
      firebaseUid: 'demo-customer-uid',
      email: 'demo@zuulab.com',
      name: 'Örnek Müşteri',
      role: 'CUSTOMER',
      status: 'ACTIVE',
    },
  ]

  for (const u of users) {
    try {
      if (isDatabaseConfigured) {
        await db.orm.public.User.create({
          id: u.id,
          firebaseUid: u.firebaseUid,
          email: u.email,
          name: u.name,
          role: u.role as any,
          status: u.status,
          emailVerified: true,
        })
      }
      console.log(`  ✓ User: ${u.email} (${u.role})`)
    } catch (e: any) {
      console.log(`  ℹ User ${u.email} skipped:`, e.message?.slice(0, 80))
    }
  }

  console.log('✅ Seed routine completed successfully!')
}

main().catch((err) => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
