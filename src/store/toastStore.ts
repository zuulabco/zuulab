'use client'

import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
  duration?: number
}

interface ToastStore {
  toasts: ToastItem[]
  addToast: (message: string, type?: ToastType, duration?: number) => string
  removeToast: (id: string) => void
  clearToasts: () => void
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  addToast: (message: string, type: ToastType = 'info', duration: number = 3000) => {
    const trimmed = message.trim()
    const currentToasts = get().toasts

    // Deduplication: if identical message is already showing, avoid duplicate spam
    const existing = currentToasts.find((t) => t.message === trimmed && t.type === type)
    if (existing) {
      return existing.id
    }

    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const newToast: ToastItem = { id, message: trimmed, type, duration }

    // Keep at most 3 toasts visible at once
    set({ toasts: [...currentToasts.slice(-2), newToast] })

    return id
  },

  removeToast: (id: string) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },

  clearToasts: () => set({ toasts: [] }),
}))

/** Standalone convenience helper for triggering toasts anywhere in client code */
export const toast = {
  success: (message: string, duration?: number) =>
    useToastStore.getState().addToast(message, 'success', duration),
  error: (message: string, duration?: number) =>
    useToastStore.getState().addToast(message, 'error', duration),
  warning: (message: string, duration?: number) =>
    useToastStore.getState().addToast(message, 'warning', duration),
  info: (message: string, duration?: number) =>
    useToastStore.getState().addToast(message, 'info', duration),
}
