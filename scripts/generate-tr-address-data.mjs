/**
 * Builds src/lib/geo/tr-address-data.json: every province, its districts, and for each district the postal
 * codes in use (most common first, at most 8). The checkout and address forms use it to offer the right
 * districts for a province and a postal code for a district.
 *
 * Source: the npm package `turkey-neighbourhoods` (MIT licence, data from PTT, updated monthly). It is 24 MB, so
 * it is NOT a dependency of the shop; run this script on demand to refresh the data:
 *
 *   mkdir tn && cd tn && npm pack turkey-neighbourhoods && tar -xzf turkey-neighbourhoods-*.tgz
 *   node ../scripts/generate-tr-address-data.mjs package/src/data/neighbourhoods.json ../src/lib/geo/tr-address-data.json
 *
 * Each row of the source is [cityCode, city, district, neighbourhood, postalCode]. A postal code belongs to a
 * neighbourhood, so a district can have several; the most common one is only a suggestion.
 */
import fs from 'node:fs'

const [source = 'package/src/data/neighbourhoods.json', target = 'tr-address-data.json'] = process.argv.slice(2)
const rows = JSON.parse(fs.readFileSync(source, 'utf8'))

const by = {}
for (const [, city, district, , postal] of rows) {
  if (!/^\d{5}$/.test(postal)) continue
  const c = (by[city] ??= {})
  const d = (c[district] ??= new Map())
  d.set(postal, (d.get(postal) ?? 0) + 1)
}

const out = {}
let districts = 0
for (const city of Object.keys(by).sort((a, b) => a.localeCompare(b, 'tr'))) {
  out[city] = {}
  for (const district of Object.keys(by[city]).sort((a, b) => a.localeCompare(b, 'tr'))) {
    out[city][district] = [...by[city][district].entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([postal]) => postal)
    districts++
  }
}

fs.writeFileSync(target, JSON.stringify(out))
console.log(`${Object.keys(out).length} provinces, ${districts} districts -> ${target} (${fs.statSync(target).size} bytes)`)
