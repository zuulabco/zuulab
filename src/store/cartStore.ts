import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { trackEvent } from '@/lib/marketing/client'

export interface CartItem {
  productId: string
  variantId: string | null
  name: string
  variantLabel: string | null
  price: number
  imageUrl: string | null
  slug: string
  quantity: number
  maxStock: number
  sku: string
  /** For analytics only (item category); carts saved before this field was added have none */
  categoryName?: string
}

export interface CouponState {
  code: string
  discount: number
  type: 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING'
}

interface CartState {
  items: CartItem[]
  coupon: CouponState | null
  discountAmount: number
  isDrawerOpen: boolean
  // Computed
  itemCount: () => number
  subtotal: () => number
  // Actions
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }, qty?: number) => void
  removeItem: (productId: string, variantId?: string | null) => void
  updateQuantity: (productId: string, variantId: string | null, qty: number) => void
  applyCoupon: (code: string, discount: number, type: 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING') => void
  removeCoupon: () => void
  clearCart: () => void
  hasItem: (productId: string, variantId?: string | null) => boolean
  getItem: (productId: string, variantId?: string | null) => CartItem | undefined
  openDrawer: () => void
  closeDrawer: () => void
  toggleDrawer: () => void
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      coupon: null,
      discountAmount: 0,
      isDrawerOpen: false,

      openDrawer: () => set({ isDrawerOpen: true }),
      closeDrawer: () => set({ isDrawerOpen: false }),
      toggleDrawer: () => set((state) => ({ isDrawerOpen: !state.isDrawerOpen })),

      itemCount: () =>
        get().items.reduce((sum, item) => sum + item.quantity, 0),

      subtotal: () =>
        get().items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        ),

      addItem: (newItem, extraQty) => {
        const { productId, variantId = null } = newItem
        const quantity = extraQty ?? newItem.quantity ?? 1
        trackEvent('add_to_cart', {
          productId,
          variantId,
          productName: newItem.name,
          sku: newItem.sku,
          category: newItem.categoryName,
          variantLabel: newItem.variantLabel,
          quantity,
          price: newItem.price,
        })
        // Every add opens the cart drawer so the customer sees what is in the cart
        set((state) => {
          const existing = state.items.find(
            (i) => i.productId === productId && i.variantId === variantId
          )
          if (existing) {
            return {
              isDrawerOpen: true,
              items: state.items.map((i) =>
                i.productId === productId && i.variantId === variantId
                  ? {
                      ...i,
                      quantity: Math.min(
                        i.quantity + quantity,
                        i.maxStock
                      ),
                    }
                  : i
              ),
            }
          }
          return {
            isDrawerOpen: true,
            items: [
              ...state.items,
              { ...newItem, variantId, quantity },
            ],
          }
        })
      },

      removeItem: (productId, variantId = null) => {
        const gone = get().getItem(productId, variantId)
        if (gone) {
          trackEvent('remove_from_cart', {
            productId: gone.productId,
            variantId: gone.variantId,
            productName: gone.name,
            sku: gone.sku,
            variantLabel: gone.variantLabel,
            quantity: gone.quantity,
            price: gone.price,
          })
        }
        set((state) => ({
          items: state.items.filter(
            (i) => !(i.productId === productId && i.variantId === variantId)
          ),
        }))
      },

      updateQuantity: (productId, variantId, qty) => {
        if (qty <= 0) {
          get().removeItem(productId, variantId)
          return
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.productId === productId && i.variantId === variantId
              ? { ...i, quantity: Math.min(qty, i.maxStock) }
              : i
          ),
        }))
      },

      // `discount` is the amount the server computed for this cart. Pages display the
      // live server quote (useCartQuote); this value is only a last-known snapshot.
      applyCoupon: (code, discount, type) => {
        set({
          coupon: { code, discount, type },
          discountAmount: Math.round(discount * 100) / 100,
        })
      },

      removeCoupon: () => {
        set({
          coupon: null,
          discountAmount: 0,
        })
      },

      clearCart: () => set({ items: [], coupon: null, discountAmount: 0 }),

      hasItem: (productId, variantId = null) =>
        get().items.some(
          (i) => i.productId === productId && i.variantId === variantId
        ),

      getItem: (productId, variantId = null) =>
        get().items.find(
          (i) => i.productId === productId && i.variantId === variantId
        ),
    }),
    {
      name: 'zuulab-cart',
      partialize: (state) => ({
        items: state.items,
        coupon: state.coupon,
        discountAmount: state.discountAmount,
      }),
    }
  )
)
