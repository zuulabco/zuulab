/**
 * Prisma 8 types `Decimal` columns as branded strings (Numeric<P, S>). This formats a
 * JS number with the column's scale; P and S are inferred from the target field, so
 * a value written to Decimal(10,2) and Decimal(5,2) both type-check without casts.
 */
export function dbNumeric<P extends number, S extends number>(
  value: number,
  scale = 2
): string & { readonly __numericPrecision: P; readonly __numericScale: S } {
  return value.toFixed(scale) as string & { readonly __numericPrecision: P; readonly __numericScale: S }
}
