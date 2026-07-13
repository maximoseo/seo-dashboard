import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DataStateBadge from '@/components/DataStateBadge'
import { DataCard } from '@/components/DataCard'
import { authFetch } from '@/lib/authToken'
import { buildProjectPath } from '@/lib/projectRoutes'

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
  }
  worst: Array<{
    domain: string
    name: string
    healthScore: number | null
    alertCount: number
    taskCount: number
    lastFetchedAt: string | null
    status: string
  }>
  hottestAlerts: Array<{
    domain: string
    alertCount: number
    taskCount: number
    healthScore: number | null
  }>
  source: string
  fetchedAt: string
}

export default function CommandCenterPage() {
  const [data, setData] = useState<CommandCenterResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch('/api/command-center')
      if (!res.ok) throw new Error(`Command center failed (${res.status})`)
      setData(await res.json())
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
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Sync failed (${res.status})`)
      setSyncMsg(`Synced ${body.synced || 0} domains · alerts upserted across portfolio`)
      await load()
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const exportCsv = () => {
    window.open('/api/portfolio/export?format=csv', '_blank', 'noopener,noreferrer')
  }

  const state = error ? 'unavailable' : loading ? 'loading' : data ? (data.source === 'supabase' ? 'live' : 'cached') : 'unavailable'
  const kpis = data?.kpis

  return (
    <div className="max-w-[1400px] space-y-4 lg:space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-bold text-fg md:text-2xl">Command Center</h2>
          <p className="mt-1 text-sm text-fg-muted">Portfolio KPIs, stale sites, and operator sync actions.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DataStateBadge state={state as any} source={data?.source} fetchedAt={data?.fetchedAt} />
          <button onClick={() => void load()} className="rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted hover:border-border-light hover:text-fg">Refresh</button>
          <button onClick={exportCsv} className="rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted hover:border-border-light hover:text-fg">Export CSV</button>
          <button disabled={syncing} onClick={() => void runSync(false)} className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent-light hover:border-accent/50 disabled:opacity-50">
            {syncing ? 'Syncing…' : 'Sync spine'}
          </button>
          <button disabled={syncing} onClick={() => void runSync(true)} className="rounded-lg border border-orange-400/30 bg-orange-400/10 px-3 py-1.5 text-xs font-medium text-orange-200 hover:border-orange-400/50 disabled:opacity-50">
            Sync + push bridges
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      {syncMsg && <p className="rounded-xl border border-border bg-bg-card p-3 text-sm text-fg-muted">{syncMsg}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Projects', value: kpis?.projects ?? '—' },
          { label: 'Avg health', value: kpis?.avgHealth ?? '—' },
          { label: 'Open alerts', value: kpis?.openAlerts ?? '—' },
          { label: 'Open tasks', value: kpis?.openTasks ?? '—' },
          { label: 'Synced', value: kpis?.synced ?? '—' },
          { label: 'Stale / no spine', value: kpis?.stale ?? '—' },
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
              <Link key={row.domain} to={buildProjectPath(row.domain)} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-darkest px-3 py-2.5 hover:border-accent/40">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{row.name}</p>
                  <p className="truncate text-xs text-fg-dim">{row.domain} · {row.status}</p>
                </div>
                <div className="text-right text-xs text-fg-muted">
                  <div>Health <b className="text-fg">{row.healthScore ?? '—'}</b></div>
                  <div>Alerts {row.alertCount} · Tasks {row.taskCount}</div>
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
              <Link key={row.domain} to={buildProjectPath(row.domain, 'alerts')} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-darkest px-3 py-2.5 hover:border-accent/40">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{row.domain}</p>
                  <p className="text-xs text-fg-dim">Health {row.healthScore ?? '—'}</p>
                </div>
                <div className="text-right text-xs text-fg-muted">
                  <div>Alerts <b className="text-fg">{row.alertCount}</b></div>
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

      <DataCard title="Spine readiness" dataState={state as any}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 text-sm">
          <div className="rounded-xl border border-border bg-bg-darkest p-3">
            <p className="text-fg-dim text-xs">Service role</p>
            <p className="mt-1 font-medium text-fg">{kpis?.serviceRole ? 'Configured' : 'Missing — set SUPABASE_SERVICE_ROLE'}</p>
          </div>
          <div className="rounded-xl border border-border bg-bg-darkest p-3">
            <p className="text-fg-dim text-xs">Status breakdown</p>
            <p className="mt-1 font-medium text-fg">{Object.entries(kpis?.byStatus || {}).map(([k, v]) => `${k}:${v}`).join(' · ') || '—'}</p>
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
