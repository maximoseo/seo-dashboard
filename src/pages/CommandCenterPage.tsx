import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DataStateBadge from '@/components/DataStateBadge'
import { DataCard } from '@/components/DataCard'
import { authFetch } from '@/lib/authToken'
import { readApiError } from '@/lib/apiErrors'
import { buildProjectPath } from '@/lib/projectRoutes'

type MovementRow = {
  domain: string
  keyword: string
  position: number | null
  previousPosition?: number | null
  trend?: string | null
  volume?: number | null
  source?: string
}

type GapRow = {
  domain: string
  competitor: string
  ourMissingEstimate: number | null
  note?: string
}

type CommandCenterResponse = {
  kpis: {
    projects: number
    avgHealth: number | null
    openAlerts: number
    openTasks: number
    synced: number
    stale: number
    byStatus: Record<string, number>
    serviceRole: boolean
    movementSignals?: number
    gapSignals?: number
  }
  worst: Array<{
    domain: string
    name: string
    healthScore: number | null
    alertCount: number
    taskCount: number
    lastFetchedAt: string | null
    status: string
    market?: string
  }>
  hottestAlerts: Array<{
    domain: string
    alertCount: number
    taskCount: number
    healthScore: number | null
  }>
  movements?: {
    improved: MovementRow[]
    declined: MovementRow[]
    newEntries: MovementRow[]
  }
  gaps?: GapRow[]
  softDegraded?: Array<{ domain: string; providers: string[] }>
  source: string
  warning?: string | null
  fetchedAt: string
}

function formatPos(row: MovementRow) {
  if (row.previousPosition != null && row.position != null) return `${row.previousPosition} → ${row.position}`
  if (row.position != null) return `#${row.position}`
  return '—'
}

type PortfolioTask = {
  id: string
  title: string
  status: string
  priority: string
  domain: string | null
  domainName?: string | null
  brief?: string
}

export default function CommandCenterPage() {
  const [data, setData] = useState<CommandCenterResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [openTasks, setOpenTasks] = useState<PortfolioTask[]>([])
  const [taskBusy, setTaskBusy] = useState<string | null>(null)
  const [taskMsg, setTaskMsg] = useState<string | null>(null)

  const loadTasks = async () => {
    try {
      const res = await authFetch('/api/tasks/open-portfolio?limit=12')
      if (!res.ok) return
      const body = await res.json()
      setOpenTasks(body.tasks || [])
    } catch {
      // non-blocking
    }
  }

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch('/api/command-center')
      if (!res.ok) throw new Error(await readApiError(res, 'Command center failed'))
      setData(await res.json())
      await loadTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load command center')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const runSync = async (push = false) => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await authFetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 15, createTasks: true, push }),
      })
      if (!res.ok) throw new Error(await readApiError(res, 'Sync failed'))
      const body = await res.json()
      setSyncMsg(`Synced ${body.synced || 0} domains · alerts upserted across portfolio`)
      await load()
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const actOnTask = async (id: string, action: 'close' | 'snooze' | 'reopen') => {
    setTaskBusy(id)
    setTaskMsg(null)
    try {
      const res = await authFetch(`/api/tasks/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'snooze' ? { action, snoozeHours: 24 } : { action }),
      })
      if (!res.ok) throw new Error(await readApiError(res, 'Task update failed'))
      setTaskMsg(action === 'close' ? 'Task closed' : action === 'snooze' ? 'Task snoozed 24h' : 'Task reopened')
      await load()
    } catch (err) {
      setTaskMsg(err instanceof Error ? err.message : 'Task update failed')
    } finally {
      setTaskBusy(null)
    }
  }

  const exportCsv = () => {
    window.open('/api/portfolio/export?format=csv', '_blank', 'noopener,noreferrer')
  }

  const state = error
    ? 'unavailable'
    : loading
      ? 'loading'
      : data
        ? data.source === 'supabase'
          ? 'live'
          : data.source === 'empty'
            ? 'unavailable'
            : 'cached'
        : 'unavailable'
  const kpis = data?.kpis
  const declined = data?.movements?.declined || []
  const improved = data?.movements?.improved || []
  const newEntries = data?.movements?.newEntries || []
  const gaps = data?.gaps || []
  const softDegraded = data?.softDegraded || []

  return (
    <div className="max-w-[1400px] space-y-4 lg:space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-bold text-fg md:text-2xl">Command Center</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Portfolio KPIs, ranking movements, competitor gaps, and operator sync actions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DataStateBadge state={state as any} source={data?.source} fetchedAt={data?.fetchedAt} />
          <button onClick={() => void load()} className="rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted hover:border-border-light hover:text-fg">
            Refresh
          </button>
          <button onClick={exportCsv} className="rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted hover:border-border-light hover:text-fg">
            Export CSV
          </button>
          <button
            disabled={syncing}
            onClick={() => void runSync(false)}
            className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent-light hover:border-accent/50 disabled:opacity-50"
          >
            {syncing ? 'Syncing…' : 'Sync spine'}
          </button>
          <button
            disabled={syncing}
            onClick={() => void runSync(true)}
            className="rounded-lg border border-orange-400/30 bg-orange-400/10 px-3 py-1.5 text-xs font-medium text-orange-200 hover:border-orange-400/50 disabled:opacity-50"
          >
            Sync + push bridges
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      {data?.warning && (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">{data.warning}</p>
      )}
      {syncMsg && <p className="rounded-xl border border-border bg-bg-card p-3 text-sm text-fg-muted">{syncMsg}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-8">
        {[
          { label: 'Projects', value: kpis?.projects ?? '—' },
          { label: 'Avg health', value: kpis?.avgHealth ?? '—' },
          { label: 'Open alerts', value: kpis?.openAlerts ?? '—' },
          { label: 'Open tasks', value: kpis?.openTasks ?? '—' },
          { label: 'Synced', value: kpis?.synced ?? '—' },
          { label: 'Stale / no spine', value: kpis?.stale ?? '—' },
          { label: 'Movements', value: kpis?.movementSignals ?? declined.length + improved.length + newEntries.length },
          { label: 'Gap signals', value: kpis?.gapSignals ?? gaps.length },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-border bg-bg-card p-4">
            <p className="text-[11px] text-fg-dim">{card.label}</p>
            <p className="mt-2 text-2xl font-bold text-fg">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <DataCard title="Lowest health sites" dataState={state as any} fetchedAt={data?.fetchedAt}>
          <div className="space-y-2">
            {(data?.worst || []).map((row) => (
              <Link
                key={row.domain}
                to={buildProjectPath(row.domain)}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-darkest px-3 py-2.5 hover:border-accent/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{row.name}</p>
                  <p className="truncate text-xs text-fg-dim">
                    {row.domain} · {row.status}
                    {row.market ? ` · ${row.market}` : ''}
                  </p>
                </div>
                <div className="text-right text-xs text-fg-muted">
                  <div>
                    Health <b className="text-fg">{row.healthScore ?? '—'}</b>
                  </div>
                  <div>
                    Alerts {row.alertCount} · Tasks {row.taskCount}
                  </div>
                </div>
              </Link>
            ))}
            {!loading && (data?.worst?.length || 0) === 0 && (
              <p className="text-sm text-fg-muted">No scored projects yet. Run Sync spine after SERVICE_ROLE is live.</p>
            )}
          </div>
        </DataCard>

        <DataCard title="Hottest alert backlog" dataState={state as any} fetchedAt={data?.fetchedAt}>
          <div className="space-y-2">
            {(data?.hottestAlerts || []).map((row) => (
              <Link
                key={row.domain}
                to={buildProjectPath(row.domain, 'alerts')}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-darkest px-3 py-2.5 hover:border-accent/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{row.domain}</p>
                  <p className="text-xs text-fg-dim">Health {row.healthScore ?? '—'}</p>
                </div>
                <div className="text-right text-xs text-fg-muted">
                  <div>
                    Alerts <b className="text-fg">{row.alertCount}</b>
                  </div>
                  <div>Tasks {row.taskCount}</div>
                </div>
              </Link>
            ))}
            {!loading && (data?.hottestAlerts?.length || 0) === 0 && (
              <p className="text-sm text-fg-muted">No open alerts persisted yet.</p>
            )}
          </div>
        </DataCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <DataCard title="Declined rankings" dataState={state as any} fetchedAt={data?.fetchedAt}>
          <div className="space-y-2">
            {declined.map((row) => (
              <Link
                key={`${row.domain}-${row.keyword}-down`}
                to={buildProjectPath(row.domain, 'keywords')}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-darkest px-3 py-2.5 hover:border-red-400/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{row.keyword}</p>
                  <p className="truncate text-xs text-fg-dim">{row.domain}</p>
                </div>
                <div className="text-right text-xs text-red-200">
                  <div className="font-semibold">{formatPos(row)}</div>
                  <div className="text-fg-dim">vol {row.volume ?? '—'}</div>
                </div>
              </Link>
            ))}
            {!loading && declined.length === 0 && (
              <p className="text-sm text-fg-muted">No declined keyword signals in focus snapshots yet.</p>
            )}
          </div>
        </DataCard>

        <DataCard title="Improved + new entries" dataState={state as any} fetchedAt={data?.fetchedAt}>
          <div className="space-y-2">
            {[...improved, ...newEntries].slice(0, 12).map((row) => (
              <Link
                key={`${row.domain}-${row.keyword}-up`}
                to={buildProjectPath(row.domain, 'keywords')}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-darkest px-3 py-2.5 hover:border-green/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{row.keyword}</p>
                  <p className="truncate text-xs text-fg-dim">
                    {row.domain}
                    {row.trend === 'new' ? ' · new' : ''}
                  </p>
                </div>
                <div className="text-right text-xs text-green">
                  <div className="font-semibold">{formatPos(row)}</div>
                  <div className="text-fg-dim">vol {row.volume ?? '—'}</div>
                </div>
              </Link>
            ))}
            {!loading && improved.length === 0 && newEntries.length === 0 && (
              <p className="text-sm text-fg-muted">No uplift / new-entry signals in focus snapshots yet.</p>
            )}
          </div>
        </DataCard>

        <DataCard title="Competitor gaps" dataState={state as any} fetchedAt={data?.fetchedAt}>
          <div className="space-y-2">
            {gaps.map((row) => (
              <Link
                key={`${row.domain}-${row.competitor}`}
                to={buildProjectPath(row.domain, 'competitors')}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-darkest px-3 py-2.5 hover:border-accent/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{row.competitor}</p>
                  <p className="truncate text-xs text-fg-dim">{row.domain}</p>
                  {row.note && <p className="mt-0.5 line-clamp-2 text-[11px] text-fg-dim">{row.note}</p>}
                </div>
                <div className="shrink-0 text-right text-xs text-fg-muted">
                  <div className="text-[10px] uppercase tracking-wider text-fg-dim">Missing est.</div>
                  <div className="font-semibold text-fg">{row.ourMissingEstimate ?? '—'}</div>
                </div>
              </Link>
            ))}
            {!loading && gaps.length === 0 && (
              <p className="text-sm text-fg-muted">No competitor gap estimates yet. Refresh competitors after keywords sync.</p>
            )}
          </div>
        </DataCard>
      </div>

      {softDegraded.length > 0 && (
        <DataCard title="Provider soft-degrade" dataState="cached">
          <div className="flex flex-wrap gap-2">
            {softDegraded.map((row) => (
              <span
                key={row.domain}
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-100"
              >
                {row.domain}: {row.providers.join(', ')}
              </span>
            ))}
          </div>
        </DataCard>
      )}

      <DataCard title="Open task actions" dataState={state as any} fetchedAt={data?.fetchedAt}>
        {taskMsg && <p className="mb-3 text-xs text-fg-muted">{taskMsg}</p>}
        <div className="space-y-2">
          {openTasks.map((task) => (
            <div
              key={task.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-bg-darkest px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-fg">{task.title}</p>
                <p className="truncate text-xs text-fg-dim">
                  {task.domain || '—'} · {task.priority} · {task.status}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={taskBusy === task.id}
                  onClick={() => void actOnTask(task.id, 'close')}
                  className="rounded-lg border border-green/30 bg-green/10 px-2.5 py-1 text-[11px] text-green disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  disabled={taskBusy === task.id}
                  onClick={() => void actOnTask(task.id, 'snooze')}
                  className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] text-amber-100 disabled:opacity-50"
                >
                  Snooze 24h
                </button>
                <Link
                  to={task.domain ? buildProjectPath(task.domain, 'tasks') : '/tasks'}
                  className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-fg-muted hover:border-border-light"
                >
                  Open
                </Link>
              </div>
            </div>
          ))}
          {!loading && openTasks.length === 0 && (
            <p className="text-sm text-fg-muted">No open portfolio tasks. Sync spine to materialize alerts → tasks.</p>
          )}
        </div>
      </DataCard>

      <DataCard title="Spine readiness" dataState={state as any}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 text-sm">
          <div className="rounded-xl border border-border bg-bg-darkest p-3">
            <p className="text-fg-dim text-xs">Service role</p>
            <p className="mt-1 font-medium text-fg">{kpis?.serviceRole ? 'Configured' : 'Missing — set SUPABASE_SERVICE_ROLE'}</p>
          </div>
          <div className="rounded-xl border border-border bg-bg-darkest p-3">
            <p className="text-fg-dim text-xs">Status breakdown</p>
            <p className="mt-1 font-medium text-fg">
              {Object.entries(kpis?.byStatus || {})
                .map(([k, v]) => `${k}:${v}`)
                .join(' · ') || '—'}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-bg-darkest p-3">
            <p className="text-fg-dim text-xs">Source</p>
            <p className="mt-1 font-medium text-fg">{data?.source || '—'}</p>
          </div>
        </div>
      </DataCard>
    </div>
  )
}
