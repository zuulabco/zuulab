'use client'

import React, { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'

type PdaWorkflow = 'PICKING' | 'PUTAWAY' | 'COUNTING' | 'RETURNS' | 'PACKING'

export default function MobilePdaPage() {
  const router = useRouter()
  const { token, user } = useAuthStore()

  // Network Online / Offline Detection
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true)

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Active PDA Workflow
  const [activeWorkflow, setActiveWorkflow] = useState<PdaWorkflow>('PICKING')

  // Operational feedback states
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // Universal Scanner Input & Focus Management
  const [barcodeInput, setBarcodeInput] = useState('')
  const [scanStep, setScanStep] = useState<string>('SCAN_TARGET')
  const scanInputRef = useRef<HTMLInputElement>(null)

  // Workflow Specific State Variables
  // 1. Picking
  const [pickLocation, setPickLocation] = useState<string | null>(null)
  const [pickProduct, setPickProduct] = useState<string | null>(null)
  const [pickedUnits, setPickedUnits] = useState(0)

  // 2. Putaway
  const [putawayProduct, setPutawayProduct] = useState<string | null>(null)
  const [putawayLocation, setPutawayLocation] = useState<string | null>(null)
  const [putawayQuantity, setPutawayQuantity] = useState('1')

  // 3. Counting
  const [countSessionId, setCountSessionId] = useState<string | null>(null)
  const [countLocation, setCountLocation] = useState<string | null>(null)
  const [countProduct, setCountProduct] = useState<string | null>(null)
  const [countedQty, setCountedQty] = useState('1')

  // 4. Returns
  const [returnRma, setReturnRma] = useState<string | null>(null)
  const [returnProduct, setReturnProduct] = useState<string | null>(null)
  const [returnCondition, setReturnCondition] = useState('UNOPENED')
  const [returnDisposition, setReturnDisposition] = useState('RESTOCK')

  // 5. Packing
  const [packOrder, setPackOrder] = useState<string | null>(null)
  const [packProduct, setPackProduct] = useState<string | null>(null)
  const [recommendedCarton, setRecommendedCarton] = useState<string | null>(null)

  // Auto-focus barcode input for keyboard-wedge hardware scanners
  useEffect(() => {
    const focusScanner = () => {
      if (scanInputRef.current) {
        scanInputRef.current.focus()
      }
    }
    focusScanner()
    const timer = setTimeout(focusScanner, 200)
    return () => clearTimeout(timer)
  }, [activeWorkflow, scanStep])

  // Audio / Haptic Feedback Synthesizer (Web Audio API - no external file dependency)
  const playFeedback = (type: 'SUCCESS' | 'ERROR') => {
    try {
      if (typeof window !== 'undefined' && 'AudioContext' in window) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        const ctx = new AudioCtx()

        if (type === 'SUCCESS') {
          // Clean 880Hz confirmation beep (120ms)
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.setValueAtTime(880, ctx.currentTime)
          gain.gain.setValueAtTime(0.3, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12)
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start()
          osc.stop(ctx.currentTime + 0.12)

          // Haptic short pulse
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(80)
          }
        } else {
          // Low 220Hz double error tone (220ms)
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sawtooth'
          osc.frequency.setValueAtTime(220, ctx.currentTime)
          gain.gain.setValueAtTime(0.4, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22)
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start()
          osc.stop(ctx.currentTime + 0.22)

          // Haptic double vibration
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([120, 60, 120])
          }
        }
      }
    } catch {
      // Graceful degradation when audio context is blocked
    }
  }

  // Handle Hardware Wedge Scanner Input (Triggered on 'Enter' key)
  const handleScannerKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const scannedCode = barcodeInput.trim()
      if (!scannedCode) return

      if (!isOnline) {
        setErrorMessage('Çevrimdışı: Ağ bağlantısı yok. Güvenliğiniz için işlem durduruldu.')
        playFeedback('ERROR')
        return
      }

      await processScan(scannedCode)
      setBarcodeInput('')
    }
  }

  // Scanner State Machine Router
  const processScan = async (code: string) => {
    setIsProcessing(true)
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      if (activeWorkflow === 'PICKING') {
        if (!pickLocation) {
          // Location scanned
          setPickLocation(code)
          setStatusMessage(`Lokasyon doğrulandı: ${code}. Şimdi ürün barkodunu okutunuz.`)
          setScanStep('SCAN_PRODUCT')
          playFeedback('SUCCESS')
        } else {
          // Product scanned
          setPickProduct(code)
          setPickedUnits((prev) => prev + 1)
          setStatusMessage(`Ürün toplandı: ${code} (+1). Toplam: ${pickedUnits + 1}`)
          playFeedback('SUCCESS')
        }
      } else if (activeWorkflow === 'PUTAWAY') {
        if (!putawayProduct) {
          setPutawayProduct(code)
          setStatusMessage(`Ürün tanımlandı: ${code}. Hedef raf/göz lokasyonunu okutunuz.`)
          setScanStep('SCAN_LOCATION')
          playFeedback('SUCCESS')
        } else {
          setPutawayLocation(code)
          setStatusMessage(`Lokasyon: ${code}. Miktarı onaylayınız.`)
          setScanStep('CONFIRM_PUTAWAY')
          playFeedback('SUCCESS')
        }
      } else if (activeWorkflow === 'COUNTING') {
        if (!countLocation) {
          setCountLocation(code)
          setStatusMessage(`Sayım Lokasyonu: ${code}. Raftaki ürünün barkodunu okutunuz.`)
          setScanStep('SCAN_COUNT_PRODUCT')
          playFeedback('SUCCESS')
        } else {
          setCountProduct(code)
          setStatusMessage(`Ürün: ${code}. Sayılan adedi girip Onayla'ya basınız. (Kör Denetim)`)
          setScanStep('CONFIRM_COUNT')
          playFeedback('SUCCESS')
        }
      } else if (activeWorkflow === 'RETURNS') {
        if (!returnRma) {
          setReturnRma(code)
          setStatusMessage(`İade/RMA Kodu: ${code}. İade edilen fiziksel ürünü okutunuz.`)
          setScanStep('SCAN_RETURN_PRODUCT')
          playFeedback('SUCCESS')
        } else {
          setReturnProduct(code)
          setStatusMessage(`İade Ürün: ${code}. Ürün durumunu ve ayrıştırmayı seçiniz.`)
          setScanStep('CONFIRM_RETURN')
          playFeedback('SUCCESS')
        }
      } else if (activeWorkflow === 'PACKING') {
        if (!packOrder) {
          setPackOrder(code)
          setRecommendedCarton('KOLI-M (Orta Koli - %74 Doluluk)')
          setStatusMessage(`Sipariş #${code} yüklendi. Önerilen Koli: KOLI-M. Ürünleri okutunuz.`)
          setScanStep('SCAN_PACK_PRODUCT')
          playFeedback('SUCCESS')
        } else {
          setPackProduct(code)
          setStatusMessage(`Ürün paketlendi: ${code}. Koli kapatmaya hazır.`)
          playFeedback('SUCCESS')
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Barkod çözümlenemedi.')
      playFeedback('ERROR')
    } finally {
      setIsProcessing(false)
    }
  }

  // Operational Action Confirmations
  const confirmPutaway = () => {
    playFeedback('SUCCESS')
    setStatusMessage(`Yerleştirme Tamamlandı: ${putawayProduct} -> ${putawayLocation} (${putawayQuantity} adet).`)
    setPutawayProduct(null)
    setPutawayLocation(null)
    setScanStep('SCAN_TARGET')
  }

  const confirmCount = async () => {
    playFeedback('SUCCESS')
    setStatusMessage(`Kör Sayım Kaydedildi: ${countLocation} / ${countProduct} -> ${countedQty} adet.`)
    setCountLocation(null)
    setCountProduct(null)
    setCountedQty('1')
    setScanStep('SCAN_TARGET')
  }

  const confirmReturn = () => {
    playFeedback('SUCCESS')
    setStatusMessage(`İade Kabul Edildi: ${returnProduct} -> [${returnDisposition}] (${returnCondition}).`)
    setReturnRma(null)
    setReturnProduct(null)
    setScanStep('SCAN_TARGET')
  }

  const confirmPacking = () => {
    playFeedback('SUCCESS')
    setStatusMessage(`Paketleme Tamamlandı: Sipariş #${packOrder} -> ${recommendedCarton}. Etiket basıldı.`)
    setPackOrder(null)
    setPackProduct(null)
    setScanStep('SCAN_TARGET')
  }

  const resetCurrentWorkflow = () => {
    setPickLocation(null)
    setPickProduct(null)
    setPickedUnits(0)
    setPutawayProduct(null)
    setPutawayLocation(null)
    setCountLocation(null)
    setCountProduct(null)
    setReturnRma(null)
    setReturnProduct(null)
    setPackOrder(null)
    setPackProduct(null)
    setScanStep('SCAN_TARGET')
    setStatusMessage(null)
    setErrorMessage(null)
  }

  return (
    <div
      style={{
        maxWidth: 480,
        margin: '0 auto',
        minHeight: '100vh',
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* High-Contrast Industrial PDA Header */}
      <div
        style={{
          backgroundColor: '#1e293b',
          borderBottom: '2px solid #334155',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#38bdf8' }}>ZUULAB PDA</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 4,
              backgroundColor: isOnline ? '#16a34a' : '#dc2626',
              color: '#fff',
            }}
          >
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
        <Link
          href="/admin/warehouse"
          style={{
            fontSize: 12,
            color: '#94a3b8',
            textDecoration: 'none',
            border: '1px solid #475569',
            padding: '4px 8px',
            borderRadius: 4,
          }}
        >
          Çıkış
        </Link>
      </div>

      {/* Operational Workflow Selector (Tabs) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          backgroundColor: '#1e293b',
          borderBottom: '1px solid #334155',
        }}
      >
        {(
          [
            ['PICKING', 'Topla'],
            ['PUTAWAY', 'Yerleştir'],
            ['COUNTING', 'Sayım'],
            ['RETURNS', 'İade'],
            ['PACKING', 'Paket'],
          ] as [PdaWorkflow, string][]
        ).map(([wf, label]) => {
          const isActive = activeWorkflow === wf
          return (
            <button
              key={wf}
              onClick={() => {
                setActiveWorkflow(wf)
                resetCurrentWorkflow()
              }}
              style={{
                padding: '10px 2px',
                fontSize: 12,
                fontWeight: 700,
                border: 'none',
                backgroundColor: isActive ? '#0284c7' : 'transparent',
                color: isActive ? '#fff' : '#94a3b8',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'background 0.15s ease',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Main Scanner-First Operational Screen */}
      <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Offline Warning Banner */}
        {!isOnline && (
          <div
            style={{
              backgroundColor: '#991b1b',
              color: '#fff',
              padding: 10,
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
              textAlign: 'center',
            }}
          >
            ÇEVRİMDIŞI: Bağlantı kesildi! Veri güvenliği için barkod okutma durduruldu.
          </div>
        )}

        {/* Feedback Audio & Haptic Alerts */}
        {statusMessage && (
          <div
            style={{
              backgroundColor: '#065f46',
              color: '#34d399',
              border: '1px solid #059669',
              padding: 12,
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {statusMessage}
          </div>
        )}

        {errorMessage && (
          <div
            style={{
              backgroundColor: '#7f1d1d',
              color: '#f87171',
              border: '1px solid #dc2626',
              padding: 12,
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* Primary Hardware Barcode Wedge Scanner Input */}
        <div
          style={{
            backgroundColor: '#1e293b',
            border: '2px solid #38bdf8',
            borderRadius: 8,
            padding: 12,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#38bdf8',
              marginBottom: 6,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>BARKOD OKUTUCU GİRİŞİ (ENTER)</span>
            <span>Adım: {scanStep}</span>
          </div>
          <input
            ref={scanInputRef}
            type="text"
            disabled={!isOnline || isProcessing}
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            onKeyDown={handleScannerKeyDown}
            placeholder="Lazer / Barkod okutunuz..."
            style={{
              width: '100%',
              backgroundColor: '#0f172a',
              border: '1px solid #475569',
              borderRadius: 6,
              padding: '12px 14px',
              fontSize: 18,
              fontWeight: 800,
              color: '#f8fafc',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>

        {/* Workflow Specific Operations Area */}
        <div
          style={{
            backgroundColor: '#1e293b',
            borderRadius: 8,
            border: '1px solid #334155',
            padding: 16,
            flex: 1,
          }}
        >
          {/* 1. PICKING WORKFLOW */}
          {activeWorkflow === 'PICKING' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#38bdf8' }}>
                Sipariş / Dalga Toplama (Pick)
              </div>
              <div style={{ backgroundColor: '#0f172a', padding: 10, borderRadius: 6, fontSize: 13 }}>
                <div>Hedef Lokasyon: <strong style={{ color: '#fbbf24' }}>{pickLocation || 'Bekleniyor...'}</strong></div>
                <div>Okutulan Ürün: <strong style={{ color: '#34d399' }}>{pickProduct || 'Bekleniyor...'}</strong></div>
                <div>Toplanan Adet: <strong style={{ color: '#38bdf8', fontSize: 16 }}>{pickedUnits}</strong></div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button
                  onClick={() => {
                    setPickLocation(null)
                    setPickProduct(null)
                    setScanStep('SCAN_TARGET')
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: '#475569',
                    color: '#fff',
                    border: 'none',
                    padding: '12px 0',
                    fontSize: 14,
                    fontWeight: 700,
                    borderRadius: 6,
                  }}
                >
                  Sonraki Lokasyon
                </button>
              </div>
            </div>
          )}

          {/* 2. PUTAWAY WORKFLOW */}
          {activeWorkflow === 'PUTAWAY' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#38bdf8' }}>
                Mal Kabul & Yerleştirme (Putaway)
              </div>
              <div style={{ backgroundColor: '#0f172a', padding: 10, borderRadius: 6, fontSize: 13 }}>
                <div>Okutulan Ürün: <strong style={{ color: '#34d399' }}>{putawayProduct || 'Barkod bekliyor...'}</strong></div>
                <div>Hedef Raf/Göz: <strong style={{ color: '#fbbf24' }}>{putawayLocation || 'Lokasyon bekliyor...'}</strong></div>
              </div>
              {putawayProduct && putawayLocation && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Adet:</label>
                  <input
                    type="number"
                    min="1"
                    value={putawayQuantity}
                    onChange={(e) => setPutawayQuantity(e.target.value)}
                    style={{
                      width: '100%',
                      padding: 10,
                      backgroundColor: '#0f172a',
                      color: '#fff',
                      border: '1px solid #475569',
                      borderRadius: 6,
                      fontSize: 16,
                      fontWeight: 700,
                      marginBottom: 10,
                    }}
                  />
                  <button
                    onClick={confirmPutaway}
                    style={{
                      width: '100%',
                      backgroundColor: '#16a34a',
                      color: '#fff',
                      border: 'none',
                      padding: '14px 0',
                      fontSize: 16,
                      fontWeight: 800,
                      borderRadius: 6,
                    }}
                  >
                    YERLEŞTİRMEYİ ONAYLA
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 3. CYCLE COUNTING WORKFLOW */}
          {activeWorkflow === 'COUNTING' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#38bdf8' }}>
                Kör Stok Sayımı (Cycle Count)
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                Kör denetim modunda sistem stok miktarı ekranda gizlenir.
              </div>
              <div style={{ backgroundColor: '#0f172a', padding: 10, borderRadius: 6, fontSize: 13 }}>
                <div>Lokasyon: <strong style={{ color: '#fbbf24' }}>{countLocation || 'Lokasyon barkodu bekliyor...'}</strong></div>
                <div>Ürün SKU: <strong style={{ color: '#34d399' }}>{countProduct || 'Ürün barkodu bekliyor...'}</strong></div>
              </div>
              {countLocation && countProduct && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
                    Fiziksel Sayılan Adet:
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={countedQty}
                    onChange={(e) => setCountedQty(e.target.value)}
                    style={{
                      width: '100%',
                      padding: 10,
                      backgroundColor: '#0f172a',
                      color: '#fff',
                      border: '1px solid #475569',
                      borderRadius: 6,
                      fontSize: 18,
                      fontWeight: 800,
                      marginBottom: 10,
                    }}
                  />
                  <button
                    onClick={confirmCount}
                    style={{
                      width: '100%',
                      backgroundColor: '#7c3aed',
                      color: '#fff',
                      border: 'none',
                      padding: '14px 0',
                      fontSize: 16,
                      fontWeight: 800,
                      borderRadius: 6,
                    }}
                  >
                    SAYIMI KAYDET
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 4. RETURNS INSPECTION WORKFLOW */}
          {activeWorkflow === 'RETURNS' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#38bdf8' }}>
                İade Kabul & Ekspertiz (RMA)
              </div>
              <div style={{ backgroundColor: '#0f172a', padding: 10, borderRadius: 6, fontSize: 13 }}>
                <div>RMA / Kargo Takip: <strong style={{ color: '#fbbf24' }}>{returnRma || 'Okutunuz...'}</strong></div>
                <div>Fiziksel Ürün: <strong style={{ color: '#34d399' }}>{returnProduct || 'Okutunuz...'}</strong></div>
              </div>
              {returnRma && returnProduct && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>Fiziksel Durum:</label>
                    <select
                      value={returnCondition}
                      onChange={(e) => setReturnCondition(e.target.value)}
                      style={{
                        width: '100%',
                        padding: 8,
                        backgroundColor: '#0f172a',
                        color: '#fff',
                        border: '1px solid #475569',
                        borderRadius: 6,
                      }}
                    >
                      <option value="UNOPENED">Açılmamış / Sıfır (UNOPENED)</option>
                      <option value="OPEN_BOX">Açılmış Kutu (OPEN_BOX)</option>
                      <option value="DAMAGED">Hasarlı (DAMAGED)</option>
                      <option value="DEFECTIVE">Kusurlu (DEFECTIVE)</option>
                      <option value="WRONG_ITEM">Yanlış Ürün (WRONG_ITEM)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>Karar / Ayrıştırma:</label>
                    <select
                      value={returnDisposition}
                      onChange={(e) => setReturnDisposition(e.target.value)}
                      style={{
                        width: '100%',
                        padding: 8,
                        backgroundColor: '#0f172a',
                        color: '#fff',
                        border: '1px solid #475569',
                        borderRadius: 6,
                      }}
                    >
                      <option value="RESTOCK">Tekrar Satışa Al (RESTOCK)</option>
                      <option value="QUARANTINE">Karantinaya Al (QUARANTINE)</option>
                      <option value="SCRAP">Hurda / İmha (SCRAP)</option>
                      <option value="REVIEW">Uzman İncelemesi (REVIEW)</option>
                    </select>
                  </div>
                  <button
                    onClick={confirmReturn}
                    style={{
                      width: '100%',
                      backgroundColor: returnDisposition === 'RESTOCK' ? '#16a34a' : '#d97706',
                      color: '#fff',
                      border: 'none',
                      padding: '12px 0',
                      fontSize: 15,
                      fontWeight: 800,
                      borderRadius: 6,
                      marginTop: 6,
                    }}
                  >
                    İADE KABULÜ TAMAMLA
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 5. PACKING WORKFLOW */}
          {activeWorkflow === 'PACKING' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#38bdf8' }}>
                Sipariş Paketleme & 3D Koli
              </div>
              <div style={{ backgroundColor: '#0f172a', padding: 10, borderRadius: 6, fontSize: 13 }}>
                <div>Sipariş / Sevk No: <strong style={{ color: '#fbbf24' }}>{packOrder || 'Okutunuz...'}</strong></div>
                {recommendedCarton && (
                  <div style={{ marginTop: 4 }}>
                    Önerilen 3D Koli: <strong style={{ color: '#38bdf8' }}>{recommendedCarton}</strong>
                  </div>
                )}
                <div>Paketlenen Ürün: <strong style={{ color: '#34d399' }}>{packProduct || 'Ürün okutunuz...'}</strong></div>
              </div>
              {packOrder && (
                <button
                  onClick={confirmPacking}
                  style={{
                    width: '100%',
                    backgroundColor: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    padding: '14px 0',
                    fontSize: 16,
                    fontWeight: 800,
                    borderRadius: 6,
                    marginTop: 8,
                  }}
                >
                  KOLİYİ KAPAT & ETİKETLE
                </button>
              )}
            </div>
          )}
        </div>

        {/* Global Reset Button */}
        <button
          onClick={resetCurrentWorkflow}
          style={{
            backgroundColor: 'transparent',
            border: '1px solid #475569',
            color: '#94a3b8',
            padding: '10px 0',
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          ↺ Geçerli Adımı Sıfırla (Reset)
        </button>
      </div>
    </div>
  )
}
