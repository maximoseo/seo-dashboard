import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * White-label report schedules stored in seo_snapshots with provider='report_schedules'.
 *
 * NOTE: Management API (DDL) is blocked (Cloudflare 1010), so instead of a dedicated
 * seo_report_schedules table (migration 003 kept for future), schedules live as JSONB
 * docs: one singleton snapshot row per domain (snapshot_date = SENTINEL_DATE).
 */

export const SCHEDULES_PROVIDER = 'report_schedules'
const SENTINEL_DATE = '2099-01-01'

export type ReportFrequency = 'weekly' | 'monthly'
export type ReportScheduleTemplate = 'weekly' | 'monthly' | 'executive' | 'local-geo'

export interface ReportSchedule {
  id: string
  template: ReportScheduleTemplate
  locale: 'he' | 'en'
  frequency: ReportFrequency
  recipients: string[]
  brandName?: string | null
  brandColor?: string | null
  clientName?: string | null
  market?: string | null
  enabled: boolean
  /** weekly: 0-6 (Sun-Sat), monthly: 1-28 */
  sendDay: number
  /** 0-23 */
  sendHour: number
  lastRunAt?: string | null
  nextRunAt?: string | null
  lastStatus?: string | null
  lastError?: string | null
  createdAt: string
}

interface SchedulesDoc {
  schedules: ReportSchedule[]
  updatedAt: string
}

function uuid(): string {
  return crypto.randomUUID()
}

export function computeNextRunAt(schedule: Pick<ReportSchedule, 'frequency' | 'sendDay' | 'sendHour'>, from = new Date()): string {
  const now = from
  const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), schedule.sendHour, 0, 0, 0))

  if (schedule.frequency === 'weekly') {
    const targetDay = Math.min(Math.max(schedule.sendDay, 0), 6)
    const dayDiff = (targetDay - now.getUTCDay() + 7) % 7
    candidate.setUTCDate(candidate.getUTCDate() + dayDiff)
    if (dayDiff === 0 && candidate.getTime() <= now.getTime()) candidate.setUTCDate(candidate.getUTCDate() + 7)
  } else {
    const targetDay = Math.min(Math.max(schedule.sendDay, 1), 28)
    candidate.setUTCDate(targetDay)
    if (candidate.getTime() <= now.getTime()) {
      candidate.setUTCMonth(candidate.getUTCMonth() + 1)
      candidate.setUTCDate(targetDay)
    }
  }
  return candidate.toISOString()
}

export function normalizeSchedule(input: Partial<ReportSchedule>): ReportSchedule {
  const frequency: ReportFrequency = input.frequency === 'weekly' ? 'weekly' : 'monthly'
  const sendDayRaw = Number(input.sendDay ?? (frequency === 'weekly' ? 0 : 1))
  const sendDay = frequency === 'weekly' ? Math.min(Math.max(sendDayRaw, 0), 6) : Math.min(Math.max(sendDayRaw, 1), 28)
  const sendHour = Math.min(Math.max(Number(input.sendHour ?? 8), 0), 23)
  const recipients = Array.isArray(input.recipients)
    ? [...new Set(input.recipients.map((r) => String(r).trim().toLowerCase()).filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)))]
    : []
  return {
    id: String(input.id || uuid()),
    template: (['weekly', 'monthly', 'executive', 'local-geo'].includes(String(input.template)) ? input.template : 'monthly') as ReportScheduleTemplate,
    locale: input.locale === 'en' ? 'en' : 'he',
    frequency,
    recipients,
    brandName: input.brandName?.trim() || null,
    brandColor: input.brandColor?.trim() || null,
    clientName: input.clientName?.trim() || null,
    market: input.market?.trim() || null,
    enabled: input.enabled !== false,
    sendDay,
    sendHour,
    lastRunAt: input.lastRunAt || null,
    nextRunAt: input.nextRunAt || computeNextRunAt({ frequency, sendDay, sendHour }),
    lastStatus: input.lastStatus || null,
    lastError: input.lastError || null,
    createdAt: input.createdAt || new Date().toISOString(),
  }
}

export class ReportScheduleStore {
  constructor(private supabase: SupabaseClient) {}

  /** List all schedules for a domain (or all domains when domainId is null). */
  async list(domainId?: string | null): Promise<Array<{ domainId: string; schedule: ReportSchedule }>> {
    let query = this.supabase
      .from('seo_snapshots')
      .select('domain_id, data')
      .eq('provider', SCHEDULES_PROVIDER)
      .eq('snapshot_date', SENTINEL_DATE)
    if (domainId) query = query.eq('domain_id', domainId)
    const { data, error } = await query
    if (error) throw new Error(`list schedules: ${error.message}`)
    const out: Array<{ domainId: string; schedule: ReportSchedule }> = []
    for (const row of data || []) {
      const doc = row.data as SchedulesDoc
      for (const s of doc?.schedules || []) {
        out.push({ domainId: String(row.domain_id), schedule: normalizeSchedule(s) })
      }
    }
    return out
  }

  private async readDoc(domainId: string): Promise<SchedulesDoc> {
    const { data, error } = await this.supabase
      .from('seo_snapshots')
      .select('data')
      .eq('domain_id', domainId)
      .eq('provider', SCHEDULES_PROVIDER)
      .eq('snapshot_date', SENTINEL_DATE)
      .maybeSingle()
    if (error) throw new Error(`read schedules doc: ${error.message}`)
    const doc = (data?.data as SchedulesDoc) || { schedules: [], updatedAt: new Date().toISOString() }
    doc.schedules = (doc.schedules || []).map((s) => normalizeSchedule(s))
    return doc
  }

  private async writeDoc(domainId: string, doc: SchedulesDoc): Promise<void> {
    doc.updatedAt = new Date().toISOString()
    const { error } = await this.supabase
      .from('seo_snapshots')
      .upsert(
        {
          domain_id: domainId,
          provider: SCHEDULES_PROVIDER,
          snapshot_date: SENTINEL_DATE,
          data: doc,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'domain_id,provider,snapshot_date' },
      )
    if (error) throw new Error(`write schedules doc: ${error.message}`)
  }

  async create(domainId: string, input: Partial<ReportSchedule>): Promise<ReportSchedule> {
    const doc = await this.readDoc(domainId)
    const schedule = normalizeSchedule({ ...input, id: uuid() })
    if (doc.schedules.length >= 10) throw new Error('Maximum 10 schedules per domain')
    doc.schedules.push(schedule)
    await this.writeDoc(domainId, doc)
    return schedule
  }

  async update(domainId: string, id: string, patch: Partial<ReportSchedule>): Promise<ReportSchedule | null> {
    const doc = await this.readDoc(domainId)
    const idx = doc.schedules.findIndex((s) => s.id === id)
    if (idx < 0) return null
    const current = doc.schedules[idx]
    const merged = normalizeSchedule({ ...current, ...patch, id: current.id, createdAt: current.createdAt })
    // Recompute next run when timing/frequency changed or re-enabled after being disabled
    if (patch.sendDay != null || patch.sendHour != null || patch.frequency != null || (patch.enabled === true && !current.enabled)) {
      merged.nextRunAt = computeNextRunAt(merged)
    }
    doc.schedules[idx] = merged
    await this.writeDoc(domainId, doc)
    return merged
  }

  async remove(domainId: string, id: string): Promise<boolean> {
    const doc = await this.readDoc(domainId)
    const before = doc.schedules.length
    doc.schedules = doc.schedules.filter((s) => s.id !== id)
    if (doc.schedules.length === before) return false
    await this.writeDoc(domainId, doc)
    return true
  }

  /** Mark a schedule as sent (or failed) and advance its next run. */
  async markRun(domainId: string, id: string, result: { ok: boolean; error?: string | null }): Promise<void> {
    const doc = await this.readDoc(domainId)
    const idx = doc.schedules.findIndex((s) => s.id === id)
    if (idx < 0) return
    const current = doc.schedules[idx]
    current.lastRunAt = new Date().toISOString()
    current.lastStatus = result.ok ? 'sent' : 'error'
    current.lastError = result.ok ? null : result.error || 'unknown error'
    current.nextRunAt = computeNextRunAt(current)
    doc.schedules[idx] = current
    await this.writeDoc(domainId, doc)
  }

  /** All due schedules across domains (enabled and nextRunAt <= now). */
  async due(now = new Date()): Promise<Array<{ domainId: string; schedule: ReportSchedule }>> {
    const all = await this.list(null)
    const t = now.getTime()
    return all.filter(({ schedule }) => schedule.enabled && schedule.nextRunAt && Date.parse(schedule.nextRunAt) <= t)
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Report share links — persisted in seo_snapshots (provider='report_share').
 * In-memory Map dies between serverless cold starts/deployments, so shares live
 * as arrays inside per-domain daily docs. Lookup by id scans the (small) set.
 * ─────────────────────────────────────────────────────────────────────────── */

export const SHARES_PROVIDER = 'report_share'

export interface ShareRecord {
  id: string
  domain: string
  locale: 'he' | 'en'
  template: string
  markdown: string
  html: string
  createdAt: string
  expiresAt: string
}

interface SharesDoc {
  shares: ShareRecord[]
}

export class ReportShareStore {
  constructor(private supabase: SupabaseClient) {}

  private today(): string {
    return new Date().toISOString().split('T')[0]
  }

  private isExpired(rec: ShareRecord): boolean {
    return Date.parse(rec.expiresAt) < Date.now()
  }

  async create(domainId: string, record: ShareRecord): Promise<void> {
    const date = this.today()
    const { data, error } = await this.supabase
      .from('seo_snapshots')
      .select('data')
      .eq('domain_id', domainId)
      .eq('provider', SHARES_PROVIDER)
      .eq('snapshot_date', date)
      .maybeSingle()
    if (error) throw new Error(`read shares doc: ${error.message}`)
    const doc = (data?.data as SharesDoc) || { shares: [] }
    doc.shares = (doc.shares || []).filter((s) => s.id !== record.id && !this.isExpired(s))
    doc.shares.push(record)
    // Cap per-day shares to avoid unbounded docs
    doc.shares = doc.shares.slice(-50)
    const { error: upErr } = await this.supabase
      .from('seo_snapshots')
      .upsert(
        {
          domain_id: domainId,
          provider: SHARES_PROVIDER,
          snapshot_date: date,
          data: doc,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'domain_id,provider,snapshot_date' },
      )
    if (upErr) throw new Error(`write shares doc: ${upErr.message}`)
  }

  async get(id: string): Promise<ShareRecord | null> {
    // Scan recent share docs (30 days) — provider rows are few
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const { data, error } = await this.supabase
      .from('seo_snapshots')
      .select('data')
      .eq('provider', SHARES_PROVIDER)
      .gte('snapshot_date', since)
    if (error) throw new Error(`scan shares: ${error.message}`)
    for (const row of data || []) {
      const doc = row.data as SharesDoc
      const rec = (doc?.shares || []).find((s) => s.id === id)
      if (rec) {
        if (this.isExpired(rec)) return null
        return rec
      }
    }
    return null
  }
}
