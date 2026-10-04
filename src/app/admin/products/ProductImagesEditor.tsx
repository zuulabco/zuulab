'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import { uploadAdminImage } from '@/lib/media/admin-upload'
import s from './ProductImagesEditor.module.css'

/** Same ceiling as the server (catalog-admin MAX_PRODUCT_IMAGES) */
const MAX_IMAGES = 12

/**
 * The product's photo gallery in display order; the first one is the cover used on
 * product cards. Upload several files at once (button, or drop them on the box),
 * add one by address, remove with ×, and reorder by dragging a photo (mouse or
 * finger) or with the arrow keys on a focused photo.
 */
export default function ProductImagesEditor({
  value,
  onChange,
  label,
}: {
  value: string[]
  onChange: (urls: string[]) => void
  /** Product name, for the thumbnails' alt text */
  label: string
}) {
  const { token } = useAuthStore()
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)
  const [fileOver, setFileOver] = useState(false)
  const [address, setAddress] = useState('')
  const [dragging, setDragging] = useState<string | null>(null)
  const drag = useRef<{ url: string; x: number; y: number; moved: boolean } | null>(null)
  // Uploads finish one by one; always add to the latest list
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  }, [value])

  const room = MAX_IMAGES - value.length

  const add = (urls: string[]) => {
    const next = [...latest.current, ...urls.filter((u) => !latest.current.includes(u))].slice(0, MAX_IMAGES)
    latest.current = next
    onChange(next)
  }

  const uploadFiles = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return
    const free = MAX_IMAGES - latest.current.length
    if (free <= 0) {
      toast.error(`Bir ürüne en fazla ${MAX_IMAGES} görsel eklenebilir.`)
      return
    }
    if (images.length > free) toast.error(`En fazla ${MAX_IMAGES} görsel: ilk ${free} tanesi yükleniyor.`)
    const batch = images.slice(0, free)
    setUploading(batch.length)
    for (const file of batch) {
      try {
        const { url } = await uploadAdminImage(file, token, { usage: 'product' })
        add([url])
      } catch (err) {
        toast.error((err as Error).message || `${file.name} yüklenemedi.`)
      }
      setUploading((n) => n - 1)
    }
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length || from === to) return
    const next = [...value]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next)
  }

  const addAddress = () => {
    const url = address.trim()
    if (!url) return
    if (!/^(https:\/\/|\/)/.test(url)) {
      toast.error('Görsel adresi https:// ile başlamalı.')
      return
    }
    if (room <= 0) {
      toast.error(`Bir ürüne en fazla ${MAX_IMAGES} görsel eklenebilir.`)
      return
    }
    add([url])
    setAddress('')
  }

  // Dragging a photo: the list reorders live under the pointer
  const onPointerDown = (e: React.PointerEvent<HTMLLIElement>, url: string) => {
    if ((e.target as HTMLElement).closest('button') || e.button !== 0) return
    drag.current = { url, x: e.clientX, y: e.clientY, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLLIElement>) => {
    const d = drag.current
    if (!d) return
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return
      d.moved = true
      setDragging(d.url)
    }
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-photo]')
    const to = over ? Number(over.dataset.photo) : -1
    const from = value.indexOf(d.url)
    if (to >= 0 && from >= 0 && to !== from) move(from, to)
  }
  const endDrag = () => {
    drag.current = null
    setDragging(null)
  }

  return (
    <div
      className={`${s.box} ${fileOver ? s.fileOver : ''}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setFileOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileOver(false)
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        setFileOver(false)
        uploadFiles(Array.from(e.dataTransfer.files))
      }}
    >
      <ul className={s.grid} aria-label="Ürün görselleri">
        {value.map((url, i) => (
          <li
            key={url}
            data-photo={i}
            className={`${s.photo} ${dragging === url ? s.dragging : ''}`}
            tabIndex={0}
            aria-label={`${i + 1}. görsel${i === 0 ? ' (kapak)' : ''}. Yerini değiştirmek için sürükle ya da ok tuşlarını kullan.`}
            onPointerDown={(e) => onPointerDown(e, url)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault()
                move(i, i - 1)
              } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault()
                move(i, i + 1)
              } else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault()
                onChange(value.filter((u) => u !== url))
              }
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of any uploaded or pasted address */}
            <img src={url} alt={`${label || 'Ürün'} görsel ${i + 1}`} draggable={false} />
            {i === 0 && <span className={s.cover}>kapak</span>}
            <span className={s.index} aria-hidden="true">{i + 1}</span>
            <button
              type="button"
              className={s.remove}
              onClick={() => onChange(value.filter((u) => u !== url))}
              aria-label={`${i + 1}. görseli kaldır`}
              title="Görseli kaldır"
            >
              ×
            </button>
          </li>
        ))}
        {Array.from({ length: uploading }, (_, i) => (
          <li key={`uploading-${i}`} className={`${s.photo} ${s.placeholder}`} aria-label="Yükleniyor">
            <span className={s.spinner} aria-hidden="true" />
          </li>
        ))}
        {room - uploading > 0 && (
          <li className={s.addItem}>
            <button type="button" className={s.add} onClick={() => input.current?.click()}>
              <span aria-hidden="true">+</span>
              <span>görsel ekle</span>
            </button>
          </li>
        )}
      </ul>

      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          uploadFiles(files)
        }}
      />

      <p className={s.help}>
        Birden fazla görsel seçebilir ya da dosyaları bu kutuya sürükleyebilirsin. Sırayı değiştirmek için görselleri
        sürükle; ilk görsel kapak olur. En fazla {MAX_IMAGES} görsel.
      </p>

      <div className={s.addressRow}>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addAddress()
            }
          }}
          placeholder="veya görsel adresi: https://…"
          aria-label="Görsel adresi"
          className={s.addressInput}
        />
        <button type="button" className={s.addressBtn} onClick={addAddress} disabled={!address.trim()}>
          ekle
        </button>
      </div>
    </div>
  )
}
