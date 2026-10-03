'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import { SkeletonRows } from '@/components/common/Skeleton'
import { SOCIAL_PLATFORMS, SocialIcon, type SocialLink, type SocialPlatform } from '@/lib/social/platforms'
import SortableList from '../../SortableList'
import styles from '../../admin.module.css'
import s from './Social.module.css'

export default function AdminSocialPage() {
  const { token, canFetch } = useAuthStore()
  const [links, setLinks] = useState<SocialLink[]>([])
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [platform, setPlatform] = useState<SocialPlatform>('instagram')
  const [url, setUrl] = useState('')

  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])

  const load = useCallback(() => {
    if (!canFetch) return
    fetch('/api/admin/social', { headers, cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setLinks(d.links)
        else toast.error(d.error || 'Bağlantılar alınamadı.')
      })
      .catch(() => toast.error('Bağlantılar alınamadı.'))
      .finally(() => setLoading(false))
  }, [canFetch, headers])

  useEffect(() => {
    load()
  }, [load])

  const change = (next: SocialLink[]) => {
    setLinks(next)
    setDirty(true)
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const value = url.trim()
    if (!/^https:\/\//i.test(value)) {
      toast.error('Bağlantı https:// ile başlamalıdır.')
      return
    }
    change([...links, { id: `soc-${Date.now().toString(36)}`, platform, url: value, active: true }])
    setUrl('')
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/social', { method: 'PUT', headers, body: JSON.stringify({ links }) })
      const d = await res.json()
      if (!d.success) throw new Error(d.error)
      setLinks(d.links)
      setDirty(false)
      toast.success('Sosyal medya bağlantıları kaydedildi; footer güncellendi.')
    } catch (e) {
      toast.error((e as Error).message || 'Kaydedilemedi.')
    } finally {
      setSaving(false)
    }
  }

  const visible = links.filter((l) => l.active)

  return (
    <div className={styles.pageContainer} style={{ maxWidth: 880 }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Sosyal medya</h1>
          <p className={styles.pageSubtitle}>Sitenin alt kısmında (footer) görünen ikonlar. Sırayı sürükleyerek değiştirin, sonra kaydedin.</p>
        </div>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={save} disabled={!dirty || saving}>
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>

      {/* Footer preview */}
      <div className={s.preview}>
        <span className={s.previewLabel}>Footer&apos;da görünüş</span>
        <div className={s.previewBar}>
          {visible.length === 0 ? (
            <span className={s.previewEmpty}>Açık bağlantı yok; footer&apos;da ikon gösterilmez.</span>
          ) : (
            visible.map((l) => (
              <span key={l.id} className={s.previewIcon} title={SOCIAL_PLATFORMS[l.platform].name}>
                <SocialIcon platform={l.platform} />
              </span>
            ))
          )}
        </div>
      </div>

      <form onSubmit={add} className={`${styles.formCard} ${s.addForm}`}>
        <div className={styles.formGroup}>
          <label className={styles.formLabel} htmlFor="social-platform">Platform</label>
          <select id="social-platform" className={styles.formSelect} value={platform} onChange={(e) => setPlatform(e.target.value as SocialPlatform)}>
            {(Object.keys(SOCIAL_PLATFORMS) as SocialPlatform[]).map((p) => (
              <option key={p} value={p}>{SOCIAL_PLATFORMS[p].name}</option>
            ))}
          </select>
        </div>
        <div className={styles.formGroup} style={{ flex: 1 }}>
          <label className={styles.formLabel} htmlFor="social-url">Bağlantı</label>
          <input id="social-url" className={styles.formInput} placeholder={SOCIAL_PLATFORMS[platform].placeholder} value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <button type="submit" className={`${styles.btn} ${styles.btnSecondary}`} disabled={!url.trim()}>
          Ekle
        </button>
      </form>

      {loading ? (
        <SkeletonRows rows={3} />
      ) : links.length === 0 ? (
        <div className={styles.emptyState}>Henüz bağlantı yok. Yukarıdan ekleyin.</div>
      ) : (
        <SortableList
          items={links}
          getId={(l) => l.id}
          getLabel={(l) => SOCIAL_PLATFORMS[l.platform].name}
          onReorder={change}
          renderItem={(l) => (
            <div className={`${s.row} ${l.active ? '' : s.rowOff}`}>
              <span className={s.icon}>
                <SocialIcon platform={l.platform} size={20} />
              </span>
              <div className={s.rowBody}>
                <strong>{SOCIAL_PLATFORMS[l.platform].name}</strong>
                <input
                  className={styles.formInput}
                  value={l.url}
                  aria-label={`${SOCIAL_PLATFORMS[l.platform].name} bağlantısı`}
                  onChange={(e) => change(links.map((x) => (x.id === l.id ? { ...x, url: e.target.value } : x)))}
                />
              </div>
              <label className={s.switch} title={l.active ? 'Gizle' : 'Göster'}>
                <input
                  type="checkbox"
                  checked={l.active}
                  aria-label={`${SOCIAL_PLATFORMS[l.platform].name} görünsün`}
                  onChange={(e) => change(links.map((x) => (x.id === l.id ? { ...x, active: e.target.checked } : x)))}
                />
                <span />
              </label>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`}
                onClick={() => change(links.filter((x) => x.id !== l.id))}
              >
                Sil
              </button>
            </div>
          )}
        />
      )}
    </div>
  )
}
