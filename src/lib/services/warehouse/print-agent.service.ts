import 'server-only'
import crypto from 'crypto'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { logAuditEvent } from '@/lib/services/admin.service'
import {
  WarehouseValidationError,
  WarehouseNotFoundError,
  WarehouseInvalidStateError,
} from './warehouse-error'
import type {
  WarehousePrinterRecord,
  WarehousePrintJobRecord,
  WarehousePrinterType,
  WarehousePrintJobStatus,
  RegisterPrinterInput,
  RequestPrintJobInput,
} from './warehouse-types'

// In-memory printer and print job storage
const inMemoryPrinters: Map<string, WarehousePrinterRecord> = new Map()
const inMemoryPrintJobs: Map<string, WarehousePrintJobRecord> = new Map()
const inMemoryAgentTokens: Map<string, string> = new Map() // agentId -> tokenHash

// Seed default standard Zebra printer for warehouse operations
function ensureDefaultPrinter() {
  if (inMemoryPrinters.size === 0) {
    const now = new Date().toISOString()
    const printerId = 'prn_zebra_main_01'
    const defaultAgentId = 'agent_wh_station_01'
    const sampleToken = 'zuu_print_sec_agent_token_main_station'
    const tokenHash = crypto.createHash('sha256').update(sampleToken).digest('hex')

    const defaultPrinter: WarehousePrinterRecord = {
      id: printerId,
      warehouseId: 'MAIN',
      name: 'Depo 1 Ana Zebra ZT410 (ZPL II)',
      printerType: 'ZEBRA_ZPL',
      ipAddress: '192.168.1.180',
      port: 9100,
      dpi: 203,
      labelWidthMm: 100,
      labelHeightMm: 100,
      isDefault: true,
      isActive: true,
      agentId: defaultAgentId,
      apiKeyHash: tokenHash,
      lastHeartbeatAt: now,
      createdAt: now,
      updatedAt: now,
    }

    inMemoryPrinters.set(printerId, defaultPrinter)
    inMemoryAgentTokens.set(defaultAgentId, tokenHash)
  }
}

ensureDefaultPrinter()

export class PrintAgentService {
  /**
   * Hashes an agent token with SHA-256 for secure comparison
   */
  public static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token.trim()).digest('hex')
  }

  /**
   * Registers a new warehouse printer
   */
  public static async registerPrinter(
    input: RegisterPrinterInput
  ): Promise<WarehousePrinterRecord> {
    ensureDefaultPrinter()

    if (!input.name || !input.name.trim()) {
      throw new WarehouseValidationError('Yazıcı adı zorunludur.')
    }
    if (!input.ipAddress || !input.ipAddress.trim()) {
      throw new WarehouseValidationError('Yazıcı yerel IP adresi zorunludur.')
    }

    const id = `prn_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    const now = new Date().toISOString()

    const record: WarehousePrinterRecord = {
      id,
      warehouseId: input.warehouseId || 'MAIN',
      name: input.name.trim(),
      printerType: input.printerType || 'ZEBRA_ZPL',
      ipAddress: input.ipAddress.trim(),
      port: input.port || 9100,
      dpi: input.dpi || 203,
      labelWidthMm: input.labelWidthMm || 100,
      labelHeightMm: input.labelHeightMm || 100,
      isDefault: input.isDefault || false,
      isActive: true,
      agentId: input.agentId || null,
      apiKeyHash: null,
      lastHeartbeatAt: null,
      createdAt: now,
      updatedAt: now,
    }

    inMemoryPrinters.set(id, record)

    await logAuditEvent({
      action: 'warehouse.printer.registered',
      entity: 'WarehousePrinter',
      entityId: id,
      metadata: { name: record.name, printerType: record.printerType },
    }).catch(() => {})

    return record
  }

  /**
   * Registers a local agent for a printer and generates a secure revocable token
   */
  public static async registerAgent(input: {
    printerId: string
    agentId: string
    adminUserId: string
  }): Promise<{ agentId: string; rawToken: string }> {
    const printer = await this.getPrinter(input.printerId)
    const rawToken = `agt_${crypto.randomBytes(24).toString('hex')}`
    const tokenHash = this.hashToken(rawToken)

    printer.agentId = input.agentId
    printer.apiKeyHash = tokenHash
    printer.updatedAt = new Date().toISOString()

    inMemoryAgentTokens.set(input.agentId, tokenHash)

    await logAuditEvent({
      action: 'warehouse.printer.agent_registered',
      entity: 'WarehousePrinter',
      entityId: printer.id,
      userId: input.adminUserId,
      metadata: { agentId: input.agentId },
    }).catch(() => {})

    return { agentId: input.agentId, rawToken }
  }

  /**
   * Authenticates local agent token securely
   */
  public static authenticateAgent(agentId: string, providedToken: string): boolean {
    if (!providedToken || !agentId) return false
    const expectedHash = inMemoryAgentTokens.get(agentId)
    if (!expectedHash) return false

    const providedHash = this.hashToken(providedToken)
    return crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(expectedHash))
  }

  /**
   * Records heartbeat from local Zebra print agent
   */
  public static async recordHeartbeat(
    agentId: string,
    token: string
  ): Promise<{ success: boolean; lastHeartbeatAt: string }> {
    if (!this.authenticateAgent(agentId, token)) {
      throw new WarehouseValidationError('Geçersiz veya yetkisiz agent token.')
    }

    const now = new Date().toISOString()

    // Find printers connected to this agent
    let found = false
    for (const p of inMemoryPrinters.values()) {
      if (p.agentId === agentId) {
        p.lastHeartbeatAt = now
        p.updatedAt = now
        found = true
      }
    }

    if (!found) {
      throw new WarehouseNotFoundError(`Bu agentId (#${agentId}) ile eşleşen yazıcı bulunamadı.`)
    }

    return { success: true, lastHeartbeatAt: now }
  }

  /**
   * Checks if printer is online based on heartbeat threshold (60 seconds)
   */
  public static isPrinterOnline(printer: WarehousePrinterRecord): boolean {
    if (!printer.isActive || !printer.lastHeartbeatAt) return false
    const lastHeartbeat = new Date(printer.lastHeartbeatAt).getTime()
    const now = Date.now()
    return now - lastHeartbeat <= 60 * 1000
  }

  /**
   * Retrieves printer by ID
   */
  public static async getPrinter(printerId: string): Promise<WarehousePrinterRecord> {
    ensureDefaultPrinter()
    const p = inMemoryPrinters.get(printerId)
    if (!p) {
      throw new WarehouseNotFoundError(`Yazıcı bulunamadı: ${printerId}`)
    }
    return p
  }

  /**
   * Lists printers
   */
  public static async listPrinters(filter?: {
    warehouseId?: string
    isActive?: boolean
  }): Promise<Array<WarehousePrinterRecord & { isOnline: boolean }>> {
    ensureDefaultPrinter()
    let list = Array.from(inMemoryPrinters.values())
    if (filter) {
      if (filter.warehouseId) list = list.filter((p) => p.warehouseId === filter.warehouseId)
      if (filter.isActive !== undefined) list = list.filter((p) => p.isActive === filter.isActive)
    }

    return list.map((p) => ({
      ...p,
      isOnline: this.isPrinterOnline(p),
    }))
  }

  /**
   * Creates or enqueues a print job.
   *
   * Idempotency Invariant:
   * Same shipmentId + labelVersion + printerId does not result in duplicate jobs
   * unless operator explicitly requests a reprint (isReprint = true).
   */
  public static async requestPrintJob(
    input: RequestPrintJobInput
  ): Promise<{ job: WarehousePrintJobRecord; idempotent: boolean }> {
    ensureDefaultPrinter()

    const printer = await this.getPrinter(input.printerId)
    if (!printer.isActive) {
      throw new WarehouseInvalidStateError(`Yazıcı (#${printer.name}) pasif durumdadır.`)
    }

    const version = input.labelVersion || 'v1'
    const isReprint = Boolean(input.isReprint)

    // Base idempotency key
    const baseKey = `ZEBRA_PRINT:${input.shipmentId}:${version}:${printer.id}`
    const idempotencyKey = isReprint ? `${baseKey}:REPRINT_${Date.now()}` : baseKey

    // Deduplication check for non-reprints
    if (!isReprint) {
      for (const j of inMemoryPrintJobs.values()) {
        if (j.idempotencyKey === idempotencyKey && j.status !== 'FAILED') {
          return { job: j, idempotent: true }
        }
      }
    }

    const jobId = `pjob_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    const now = new Date().toISOString()

    // Sample default standard ZPL template if no payload provided
    const payloadReference = `^XA^FO50,50^ADN,36,20^FDZUULAB CARGO LABEL^FS^FO50,120^BCN,100,Y,N,N^FD${input.shipmentId}^FS^XZ`

    const jobRecord: WarehousePrintJobRecord = {
      id: jobId,
      printerId: printer.id,
      shipmentId: input.shipmentId,
      labelId: input.labelId || null,
      format: input.format || 'ZPL',
      payloadReference,
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 3,
      isReprint,
      idempotencyKey,
      requestedBy: input.requestedBy,
      printedAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    }

    inMemoryPrintJobs.set(jobId, jobRecord)

    await logAuditEvent({
      action: 'warehouse.print.requested',
      entity: 'WarehousePrintJob',
      entityId: jobId,
      userId: input.requestedBy,
      metadata: {
        printerId: printer.id,
        shipmentId: input.shipmentId,
        isReprint,
      },
    }).catch(() => {})

    return { job: jobRecord, idempotent: false }
  }

  /**
   * Fetches pending print jobs for local agent polling
   */
  public static async pollPendingJobs(
    agentId: string,
    token: string
  ): Promise<WarehousePrintJobRecord[]> {
    if (!this.authenticateAgent(agentId, token)) {
      throw new WarehouseValidationError('Geçersiz veya yetkisiz agent token.')
    }

    const assignedPrinters = Array.from(inMemoryPrinters.values())
      .filter((p) => p.agentId === agentId && p.isActive)
      .map((p) => p.id)

    const pendingJobs: WarehousePrintJobRecord[] = []
    for (const j of inMemoryPrintJobs.values()) {
      if (assignedPrinters.includes(j.printerId) && j.status === 'PENDING') {
        j.status = 'ASSIGNED'
        j.updatedAt = new Date().toISOString()
        pendingJobs.push(j)
      }
    }

    return pendingJobs
  }

  /**
   * Reports successful print job execution by agent
   */
  public static async completeJob(
    jobId: string,
    agentToken: string
  ): Promise<WarehousePrintJobRecord> {
    const job = inMemoryPrintJobs.get(jobId)
    if (!job) {
      throw new WarehouseNotFoundError(`Yazdırma işi bulunamadı: ${jobId}`)
    }

    const printer = await this.getPrinter(job.printerId)
    if (printer.agentId && !this.authenticateAgent(printer.agentId, agentToken)) {
      throw new WarehouseValidationError('Geçersiz agent yetkilendirmesi.')
    }

    const now = new Date().toISOString()
    job.status = 'COMPLETED'
    job.printedAt = now
    job.updatedAt = now

    await logAuditEvent({
      action: 'warehouse.print.completed',
      entity: 'WarehousePrintJob',
      entityId: jobId,
      metadata: { shipmentId: job.shipmentId },
    }).catch(() => {})

    return job
  }

  /**
   * Reports failed print job with automatic retry backoff logic
   */
  public static async failJob(
    jobId: string,
    error: string,
    agentToken: string
  ): Promise<WarehousePrintJobRecord> {
    const job = inMemoryPrintJobs.get(jobId)
    if (!job) {
      throw new WarehouseNotFoundError(`Yazdırma işi bulunamadı: ${jobId}`)
    }

    const printer = await this.getPrinter(job.printerId)
    if (printer.agentId && !this.authenticateAgent(printer.agentId, agentToken)) {
      throw new WarehouseValidationError('Geçersiz agent yetkilendirmesi.')
    }

    const now = new Date().toISOString()
    job.attempts += 1
    job.lastError = error
    job.updatedAt = now

    if (job.attempts < job.maxAttempts) {
      // Re-queue for retry
      job.status = 'PENDING'
      await logAuditEvent({
        action: 'warehouse.print.retried',
        entity: 'WarehousePrintJob',
        entityId: jobId,
        metadata: { attempt: job.attempts, maxAttempts: job.maxAttempts, error },
      }).catch(() => {})
    } else {
      job.status = 'FAILED'
      await logAuditEvent({
        action: 'warehouse.print.failed',
        entity: 'WarehousePrintJob',
        entityId: jobId,
        metadata: { attempts: job.attempts, error },
      }).catch(() => {})
    }

    return job
  }

  /**
   * Admin: manually retries a failed print job
   */
  public static async retryJob(
    jobId: string,
    adminUserId: string
  ): Promise<WarehousePrintJobRecord> {
    const job = inMemoryPrintJobs.get(jobId)
    if (!job) {
      throw new WarehouseNotFoundError(`Yazdırma işi bulunamadı: ${jobId}`)
    }

    job.status = 'PENDING'
    job.attempts = 0
    job.lastError = null
    job.updatedAt = new Date().toISOString()

    await logAuditEvent({
      action: 'warehouse.print.retried',
      entity: 'WarehousePrintJob',
      entityId: jobId,
      userId: adminUserId,
      metadata: { shipmentId: job.shipmentId },
    }).catch(() => {})

    return job
  }
}
