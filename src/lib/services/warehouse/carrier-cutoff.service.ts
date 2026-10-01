import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import type {
  CarrierCutoffAlertLevel,
  CarrierCutoffConfigRecord,
  CarrierCutoffSummary,
} from './warehouse-types'

// Default carrier cutoff settings (Configuration-driven)
const DEFAULT_CONFIGS: Map<string, CarrierCutoffConfigRecord> = new Map([
  [
    'SURAT',
    {
      id: 'cfg_cutoff_surat',
      carrierKey: 'SURAT',
      carrierName: 'Sürat Kargo',
      cutoffTime: '17:00',
      pickupDays: [1, 2, 3, 4, 5, 6], // Monday to Saturday
      timezone: 'Europe/Istanbul',
      normalThresholdMinutes: 120,
      approachingThresholdMinutes: 60,
      isActive: true,
    },
  ],
  [
    'PTT',
    {
      id: 'cfg_cutoff_ptt',
      carrierKey: 'PTT',
      carrierName: 'PTT Kargo',
      cutoffTime: '16:30',
      pickupDays: [1, 2, 3, 4, 5, 6],
      timezone: 'Europe/Istanbul',
      normalThresholdMinutes: 120,
      approachingThresholdMinutes: 60,
      isActive: true,
    },
  ],
  [
    'YURTICI',
    {
      id: 'cfg_cutoff_yurtici',
      carrierKey: 'YURTICI',
      carrierName: 'Yurtiçi Kargo',
      cutoffTime: '17:30',
      pickupDays: [1, 2, 3, 4, 5, 6],
      timezone: 'Europe/Istanbul',
      normalThresholdMinutes: 120,
      approachingThresholdMinutes: 60,
      isActive: true,
    },
  ],
  [
    'MOCK',
    {
      id: 'cfg_cutoff_mock',
      carrierKey: 'MOCK',
      carrierName: 'Mock Kargo',
      cutoffTime: '18:00',
      pickupDays: [1, 2, 3, 4, 5, 6],
      timezone: 'Europe/Istanbul',
      normalThresholdMinutes: 120,
      approachingThresholdMinutes: 60,
      isActive: true,
    },
  ],
])

// Known statutory holidays (YYYY-MM-DD)
const DEFAULT_HOLIDAYS = new Set<string>([
  '2026-01-01', // Yılbaşı
  '2026-04-23', // Ulusal Egemenlik ve Çocuk Bayramı
  '2026-05-01', // Emek ve Dayanışma Günü
  '2026-05-19', // Atatürk'ü Anma, Gençlik ve Spor Bayramı
  '2026-07-15', // Demokrasi ve Milli Birlik Günü
  '2026-08-30', // Zafer Bayramı
  '2026-10-29', // Cumhuriyet Bayramı
])

export class CarrierCutoffService {
  private static holidays: Set<string> = new Set(DEFAULT_HOLIDAYS)

  /**
   * Add custom holiday for testing or dynamic calendar
   */
  public static addHoliday(dateStr: string): void {
    this.holidays.add(dateStr)
  }

  /**
   * Clear custom holidays or reset
   */
  public static resetHolidays(): void {
    this.holidays = new Set(DEFAULT_HOLIDAYS)
  }

  /**
   * Retrieves cutoff configuration for carrier
   */
  public static async getCarrierConfig(carrierKey: string): Promise<CarrierCutoffConfigRecord> {
    const key = carrierKey.toUpperCase()
    const inMem = DEFAULT_CONFIGS.get(key)
    if (inMem) return inMem

    return {
      id: `cfg_cutoff_${key.toLowerCase()}`,
      carrierKey: key,
      carrierName: `${key} Kargo`,
      cutoffTime: '17:00',
      pickupDays: [1, 2, 3, 4, 5, 6],
      timezone: 'Europe/Istanbul',
      normalThresholdMinutes: 120,
      approachingThresholdMinutes: 60,
      isActive: true,
    }
  }

  /**
   * Updates or registers carrier cutoff configuration
   */
  public static async setCarrierConfig(
    carrierKey: string,
    updates: Partial<CarrierCutoffConfigRecord>
  ): Promise<CarrierCutoffConfigRecord> {
    const key = carrierKey.toUpperCase()
    const current = await this.getCarrierConfig(key)
    const updated: CarrierCutoffConfigRecord = {
      ...current,
      ...updates,
      carrierKey: key,
    }
    DEFAULT_CONFIGS.set(key, updated)
    return updated
  }

  /**
   * Helper: Converts any UTC Date to Istanbul local date parts (Turkey is always UTC+3)
   */
  public static toIstanbulParts(d: Date): {
    year: number
    month: number // 1-12
    day: number // 1-31
    dayOfWeek: number // 0 (Sun) - 6 (Sat)
    hours: number
    minutes: number
    dateString: string // YYYY-MM-DD
  } {
    // Turkey timezone offset is UTC+3 (+180 minutes)
    const istanbulMs = d.getTime() + 3 * 3600 * 1000
    const istDate = new Date(istanbulMs)

    const year = istDate.getUTCFullYear()
    const month = istDate.getUTCMonth() + 1
    const day = istDate.getUTCDate()
    const dayOfWeek = istDate.getUTCDay()
    const hours = istDate.getUTCHours()
    const minutes = istDate.getUTCMinutes()

    const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    return { year, month, day, dayOfWeek, hours, minutes, dateString }
  }

  /**
   * Helper: Creates UTC Date corresponding to Istanbul local year, month, day, hour, min
   */
  public static fromIstanbulParts(
    year: number,
    month: number,
    day: number,
    hours: number,
    minutes: number
  ): Date {
    // Local Istanbul time is UTC + 3 -> UTC time is local minus 3 hours
    return new Date(Date.UTC(year, month - 1, day, hours - 3, minutes, 0, 0))
  }

  /**
   * Calculates the exact next carrier pickup cutoff date and time.
   * Takes into account:
   * - Configured cutoff time (e.g. 17:00)
   * - Configured pickup days (e.g. no pickup on Sunday)
   * - Configured public holidays
   * - Whether today's cutoff has already passed
   */
  public static getNextCarrierCutoff(
    carrierKey: string,
    fromDate: Date = new Date()
  ): { cutoffDate: Date; cutoffTimeString: string } {
    const key = carrierKey.toUpperCase()
    const config = DEFAULT_CONFIGS.get(key) || {
      cutoffTime: '17:00',
      pickupDays: [1, 2, 3, 4, 5, 6],
    }

    const [targetH, targetM] = config.cutoffTime.split(':').map((x) => parseInt(x, 10))

    let cursor = new Date(fromDate)

    // Check up to 14 days ahead for next active pickup day
    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const parts = this.toIstanbulParts(cursor)
      const isPickupDay = config.pickupDays.includes(parts.dayOfWeek)
      const isHoliday = this.holidays.has(parts.dateString)

      if (isPickupDay && !isHoliday) {
        const potentialCutoff = this.fromIstanbulParts(
          parts.year,
          parts.month,
          parts.day,
          targetH,
          targetM
        )

        // If today, cutoff must be in the future
        if (dayOffset === 0) {
          if (potentialCutoff.getTime() > fromDate.getTime()) {
            return {
              cutoffDate: potentialCutoff,
              cutoffTimeString: config.cutoffTime,
            }
          }
        } else {
          return {
            cutoffDate: potentialCutoff,
            cutoffTimeString: config.cutoffTime,
          }
        }
      }

      // Advance by 1 day
      cursor = new Date(cursor.getTime() + 24 * 3600 * 1000)
    }

    // Fallback
    return {
      cutoffDate: new Date(fromDate.getTime() + 24 * 3600 * 1000),
      cutoffTimeString: config.cutoffTime,
    }
  }

  /**
   * Calculates remaining minutes until the next carrier cutoff.
   */
  public static getRemainingMinutes(carrierKey: string, fromDate: Date = new Date()): number {
    const next = this.getNextCarrierCutoff(carrierKey, fromDate)
    const diffMs = next.cutoffDate.getTime() - fromDate.getTime()
    return Math.max(0, Math.floor(diffMs / (60 * 1000)))
  }

  /**
   * Determines if today's standard cutoff has already passed.
   */
  public static isCutoffPassed(carrierKey: string, fromDate: Date = new Date()): boolean {
    const key = carrierKey.toUpperCase()
    const config = DEFAULT_CONFIGS.get(key) || { cutoffTime: '17:00' }
    const [targetH, targetM] = config.cutoffTime.split(':').map((x) => parseInt(x, 10))

    const parts = this.toIstanbulParts(fromDate)
    const todayCutoff = this.fromIstanbulParts(
      parts.year,
      parts.month,
      parts.day,
      targetH,
      targetM
    )

    return fromDate.getTime() >= todayCutoff.getTime()
  }

  /**
   * Checks if cutoff is approaching (within 60-120 minutes of cutoff).
   */
  public static isCutoffApproaching(carrierKey: string, fromDate: Date = new Date()): boolean {
    const remaining = this.getRemainingMinutes(carrierKey, fromDate)
    const passed = this.isCutoffPassed(carrierKey, fromDate)
    return !passed && remaining <= 120 && remaining > 0
  }

  /**
   * Returns standardized cutoff alert level:
   * NORMAL: > 120 min
   * APPROACHING: 60-120 min
   * CRITICAL: < 60 min (and not passed today)
   * PASSED: today's cutoff has already passed
   */
  public static getCutoffAlertLevel(
    carrierKey: string,
    fromDate: Date = new Date()
  ): CarrierCutoffAlertLevel {
    const passed = this.isCutoffPassed(carrierKey, fromDate)
    if (passed) return 'PASSED'

    const remaining = this.getRemainingMinutes(carrierKey, fromDate)
    if (remaining <= 60) return 'CRITICAL'
    if (remaining <= 120) return 'APPROACHING'
    return 'NORMAL'
  }

  /**
   * Calculates dispatch priority score:
   * Lower score = higher dispatch urgency.
   * CRITICAL (<60 min): -35 priority score
   * APPROACHING (<120 min): -15 priority score
   * PASSED: +10 priority score (next day dispatch)
   */
  public static getDispatchPriority(carrierKey: string, fromDate: Date = new Date()): number {
    const level = this.getCutoffAlertLevel(carrierKey, fromDate)
    switch (level) {
      case 'CRITICAL':
        return 10 // Maximum urgency
      case 'APPROACHING':
        return 25 // High urgency
      case 'NORMAL':
        return 50 // Standard urgency
      case 'PASSED':
        return 80 // Can wait for tomorrow's cycle
    }
  }

  /**
   * Formats remaining time into human-friendly Turkish string:
   * e.g. "01:42", "00:35", "Yarın 16:30"
   */
  public static formatRemainingTime(carrierKey: string, fromDate: Date = new Date()): string {
    const remainingMinutes = this.getRemainingMinutes(carrierKey, fromDate)
    const passed = this.isCutoffPassed(carrierKey, fromDate)

    if (passed) {
      return 'Geçti (Yarına Kaldı)'
    }

    const hours = Math.floor(remainingMinutes / 60)
    const minutes = remainingMinutes % 60
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  /**
   * Returns a comprehensive cutoff summary across all configured carriers
   */
  public static async getCarrierCutoffSummary(
    fromDate: Date = new Date(),
    waitingCounts: Record<string, number> = {}
  ): Promise<CarrierCutoffSummary[]> {
    const results: CarrierCutoffSummary[] = []

    for (const [key, config] of DEFAULT_CONFIGS.entries()) {
      if (!config.isActive) continue

      const next = this.getNextCarrierCutoff(key, fromDate)
      const remainingMinutes = this.getRemainingMinutes(key, fromDate)
      const alertLevel = this.getCutoffAlertLevel(key, fromDate)

      let statusLabelTr = 'Normal'
      if (alertLevel === 'CRITICAL') statusLabelTr = 'Kritik'
      else if (alertLevel === 'APPROACHING') statusLabelTr = 'Yaklaşıyor'
      else if (alertLevel === 'PASSED') statusLabelTr = 'Geçti'

      const waitingCount = waitingCounts[key] || 0
      const dispatchPriority = this.getDispatchPriority(key, fromDate)

      results.push({
        carrierKey: key,
        carrierName: config.carrierName,
        cutoffTime: config.cutoffTime,
        nextCutoff: next.cutoffDate.toISOString(),
        remainingMinutes,
        alertLevel,
        statusLabelTr,
        waitingShipmentsCount: waitingCount,
        dispatchPriority,
      })
    }

    // Sort by dispatch priority (most urgent first)
    return results.sort((a, b) => a.dispatchPriority - b.dispatchPriority)
  }
}
