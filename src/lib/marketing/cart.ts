import type { MarketingItem } from './events'

/** The fields of a cart line the marketing events use (structurally a store CartItem) */
interface CartLineLike {
  productId: string
  variantId: string | null
  name: string
  variantLabel: string | null
  price: number
  quantity: number
  sku: string
}

export function cartLineToItem(line: CartLineLike): MarketingItem {
  return {
    productId: line.productId,
    variantId: line.variantId,
    productName: line.name,
    sku: line.sku,
    variantLabel: line.variantLabel,
    price: line.price,
    quantity: line.quantity,
  }
}
