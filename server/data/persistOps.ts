import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeoAlert } from '../alerts/rules.js'
import { createSeoTaskFromAlert } from '../tasks/createSeoTask.js'

export function alertDedupeKey(alert: Pick<SeoAlert, 'domain' | 'module' | 'title'>): string {
  return `${alert.domain}:${alert.module}:${alert.title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 180)
}

export async function persistAlertsAndTasks(opts: {
  admin: SupabaseClient
  domainId: string
  domain: string
  alerts: SeoAlert[]
  createTasks?: boolean
}): Promise<{ alertsUpserted: number; tasksUpserted: number; alertIds: string[] }> {
  const { admin, domainId, domain, alerts, createTasks = true } = opts
  let alertsUpserted = 0
  let tasksUpserted = 0
  const alertIds: string[] = []

  for (const alert of alerts) {
    const dedupe = alertDedupeKey(alert)
    const evidence = { ...(alert.evidence || {}), dedupe_key: dedupe, source_alert_id: alert.id }

    const { data: existingOpen } = await admin
      .from('seo_alerts')
      .select('id, status, evidence')
      .eq('domain_id', domainId)
      .eq('title', alert.title)
      .eq('module', alert.module)
      .in('status', ['open', 'assigned', 'working'])
      .limit(5)

    const match = (existingOpen || []).find((row: any) => {
      const key = row?.evidence?.dedupe_key
      return key === dedupe || !key
    })

    let alertId: string
    if (match?.id) {
      alertId = String(match.id)
      await admin
        .from('seo_alerts')
        .update({
          severity: alert.severity,
          detail: alert.detail,
          evidence,
          updated_at: new Date().toISOString(),
        })
        .eq('id', alertId)
      alertsUpserted += 1
    } else {
      const { data: created, error } = await admin
        .from('seo_alerts')
        .insert({
          domain_id: domainId,
          severity: alert.severity,
          module: alert.module,
          title: alert.title,
          detail: alert.detail,
          evidence,
          status: 'open',
        })
        .select('id')
        .single()
      if (error || !created?.id) {
        console.error('[persistOps] alert insert failed', { domain, title: alert.title, error: error?.message || 'missing id' })
        continue
      }
      alertId = String(created.id)
      alertsUpserted += 1
    }

    alertIds.push(alertId)

    if (!createTasks) continue
    if (alert.severity === 'info') continue

    const task = createSeoTaskFromAlert(alert)
    const { data: existingTasks } = await admin
      .from('seo_tasks')
      .select('id, status, title')
      .eq('domain_id', domainId)
      .eq('title', task.title)
      .in('status', ['queued', 'working', 'blocked'])
      .limit(3)

    if (existingTasks && existingTasks.length > 0) {
      await admin
        .from('seo_tasks')
        .update({
          brief: task.brief,
          priority: task.priority,
          acceptance_criteria: task.acceptanceCriteria,
          alert_id: alertId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingTasks[0].id)
      tasksUpserted += 1
    } else {
      const { error: taskErr } = await admin.from('seo_tasks').insert({
        domain_id: domainId,
        alert_id: alertId,
        title: task.title,
        status: 'queued',
        priority: task.priority,
        brief: task.brief,
        acceptance_criteria: task.acceptanceCriteria,
      })
      if (taskErr) {
        console.error('[persistOps] task insert failed', { domain, title: task.title, error: taskErr.message })
      } else {
        tasksUpserted += 1
      }
    }
  }

  return { alertsUpserted, tasksUpserted, alertIds }
}

export async function loadLatestSnapshots(
  admin: SupabaseClient,
  domainIds: string[],
  limitPerDomain = 12,
): Promise<Array<{
  domain_id: string
  provider: string
  snapshot_date: string
  data: Record<string, unknown> | null
  fetched_at: string
}>> {
  if (!domainIds.length) return []
  // Pull recent day(s) of snapshots for the portfolio powerset; service role only.
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await admin
    .from('seo_snapshots')
    .select('domain_id, provider, snapshot_date, data, fetched_at')
    .in('domain_id', domainIds)
    .gte('fetched_at', since)
    .order('fetched_at', { ascending: false })
    .limit(Math.min(2000, domainIds.length * limitPerDomain))

  if (error) {
    console.error('[loadLatestSnapshots]', error.message)
    return []
  }
  return data || []
}

export async function loadOpenCounts(admin: SupabaseClient, domainIds: string[]) {
  const alertCounts = new Map<string, number>()
  const taskCounts = new Map<string, number>()
  if (!domainIds.length) return { alertCounts, taskCounts }

  const { data: alerts } = await admin
    .from('seo_alerts')
    .select('domain_id, status')
    .in('domain_id', domainIds)
    .in('status', ['open', 'assigned', 'working'])

  for (const row of alerts || []) {
    if (!row.domain_id) continue
    alertCounts.set(row.domain_id, (alertCounts.get(row.domain_id) || 0) + 1)
  }

  // Snoozed rows are stored as status=blocked + brief tag `[SNOOZED until …]`
  // and must not inflate open-task KPIs until the snooze expires.
  const { data: tasks } = await admin
    .from('seo_tasks')
    .select('domain_id, status, brief')
    .in('domain_id', domainIds)
    .in('status', ['queued', 'working', 'blocked'])

  const now = Date.now()
  for (const row of tasks || []) {
    if (!row.domain_id) continue
    const brief = String((row as any).brief || '')
    const m = brief.match(/\[SNOOZED until ([^\]]+)\]/)
    if (m) {
      try {
        if (new Date(m[1]).getTime() > now) continue // still snoozed
      } catch {
        // malformed tag → treat as open
      }
    } else if (row.status === 'blocked' && brief.includes('[SNOOZED until')) {
      continue
    }
    taskCounts.set(row.domain_id, (taskCounts.get(row.domain_id) || 0) + 1)
  }

  return { alertCounts, taskCounts }
}
