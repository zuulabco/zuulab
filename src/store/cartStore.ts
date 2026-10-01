import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
        set((state) => {
          const existing = state.items.find(
            (i) => i.productId === productId && i.variantId === variantId
          )
          if (existing) {
            return {
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
            items: [
              ...state.items,
              { ...newItem, variantId, quantity },
            ],
          }
        })
      },

      removeItem: (productId, variantId = null) => {
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

      applyCoupon: (code, discount, type) => {
        const sub = get().subtotal()
        let calculated = 0
        if (type === 'PERCENTAGE') {
          calculated = (sub * discount) / 100
        } else if (type === 'FIXED') {
          calculated = Math.min(discount, sub)
        } else if (type === 'FREE_SHIPPING') {
          calculated = discount
        }

        set({
          coupon: { code, discount, type },
          discountAmount: Math.round(calculated * 100) / 100,
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
