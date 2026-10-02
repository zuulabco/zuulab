/**
 * repair-variant-prices.ts
 *
 * One-shot repair using raw SQL to sync all ProductVariant.price → Product.price.
 * Run: npx tsx --env-file=.env src/scripts/repair-variant-prices.ts
 */
import { Client } from 'pg'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL not set. Run with --env-file=.env or set it.')
  }

  const client = new Client({ connectionString: url })
  await client.connect()

  console.log('=== VARIANT PRICE REPAIR (raw SQL) ===\n')

  // Show current drift
  const { rows: drifted } = await client.query<{
    id: string
    product_id: string
    name: string
    value: string
    variant_price: string
    product_price: string
    product_name: string
  }>(`
    SELECT v.id, v.product_id, v.name, v.value,
           v.price::text AS variant_price,
           p.price::text AS product_price,
           p.name AS product_name
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    WHERE v.price IS NOT NULL
      AND v.price::numeric != p.price::numeric
    ORDER BY p.name
  `)

  console.log(`Found ${drifted.length} drifted variant(s):\n`)
  for (const row of drifted) {
    console.log(
      `  [DRIFT] "${row.product_name}" → variant "${row.name}=${row.value}": ` +
      `${row.variant_price} → ${row.product_price}`
    )
  }

  if (drifted.length === 0) {
    console.log('  All variants already in sync. Nothing to do.')
    await client.end()
    return
  }

  // Apply repair
  const { rows: repaired } = await client.query<{
    id: string
    name: string
    value: string
    new_price: string
  }>(`
    UPDATE product_variants v
    SET price = p.price
    FROM products p
    WHERE v.product_id = p.id
      AND (v.price IS NULL OR v.price::numeric != p.price::numeric)
    RETURNING v.id, v.name, v.value, v.price::text AS new_price
  `)

  console.log(`\n=== REPAIRED ${repaired.length} variant(s) ===`)
  for (const r of repaired) {
    console.log(`  [OK] ${r.id} (${r.name}=${r.value}) → ${r.new_price}`)
  }

  await client.end()
  console.log('\nDone.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
