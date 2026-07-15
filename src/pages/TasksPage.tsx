import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DataCard } from '@/components/DataCard'
import DataStateBadge from '@/components/DataStateBadge'
import { useSEO } from '@/contexts/SEOContext'
import { authFetch } from '@/lib/authToken'
import { readApiError } from '@/lib/apiErrors'
import DomainIntegrityBar from '@/components/DomainIntegrityBar'
import { canonicalizeDomain } from '@/lib/domain'
import { useDomainSwitchCleanup } from '@/lib/useDomainQuery'

type TaskStatus = 'queued' | 'working' | 'blocked' | 'snoozed' | 'verified' | 'closed'
type TaskPriority = 'low' | 'medium' | 'high' | 'critical'

interface SeoTask {
  id: string
  domain?: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  module?: string
  brief: string
  acceptanceCriteria?: string[]
}

async function fetchTasks(domain: string): Promise<{ tasks: SeoTask[]; source: string; fetchedAt: string; message?: string }> {
  const res = await authFetch(`/api/tasks?domain=${encodeURIComponent(domain)}`)
  if (!res.ok) throw new Error(await readApiError(res, 'Tasks API failed'))
  return res.json()
}

async function patchTask(id: string, body: { action?: string; snoozeHours?: number; note?: string }) {
  const res = await authFetch(`/api/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await readApiError(res, 'Task update failed'))
  return res.json()
}

export default function TasksPage() {
  const { domain } = useSEO()
  useDomainSwitchCleanup(domain)
  const clean = canonicalizeDomain(domain)
  const qc = useQueryClient()
  const [status, setStatus] = useState<TaskStatus | 'all'>('all')
  const [actionError, setActionError] = useState<string | null>(null)
  const { data, isLoading, error } = useQuery({
    queryKey: ['tasks', clean],
    queryFn: () => fetchTasks(clean),
    enabled: !!clean,
    staleTime: 60 * 1000,
  })

  const mutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { action?: string; snoozeHours?: number } }) => patchTask(id, body),
    onSuccess: async () => {
      setActionError(null)
      await qc.invalidateQueries({ queryKey: ['tasks', clean] })
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Update failed'),
  })

  const tasks = (data?.tasks || []).filter((t) => {
    const td = canonicalizeDomain(t.domain || (data as any)?.domain)
    // Require same domain when stamp is present; drop foreign items.
    if (td) return td === clean
    // No stamp (legacy empty local) — hide in prod-like UI to avoid cross-project.
    return false
  })
  const filtered = status === 'all' ? tasks : tasks.filter((t) => t.status === status)
  const dataState = error ? 'unavailable' : isLoading ? 'loading' : data?.source === 'empty' ? 'unavailable' : data ? 'live' : 'cached'
  const counts = useMemo(() => {
    const base: Record<string, number> = { queued: 0, working: 0, blocked: 0, verified: 0, snoozed: 0, closed: 0 }
    for (const t of tasks) base[t.status] = (base[t.status] || 0) + 1
    return base
  }, [tasks])

  return (
    <div className="space-y-4 lg:space-y-5 max-w-[1400px]">
      <DomainIntegrityBar
        activeDomain={clean}
        payloadDomain={clean}
        dataState={error ? 'unavailable' : isLoading ? 'loading' : tasks.length ? 'live' : 'unavailable'}
        fetchedAt={data?.fetchedAt}
        rowCount={tasks.length}
        extra={clean ? `queue for ${clean}` : 'no domain'}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-fg">Tasks / Agents</h2>
          <p className="text-xs md:text-sm text-fg-muted mt-0.5">
            Operator queue from live alerts — close, snooze, or reopen without inventing demo work
          </p>
        </div>
        <DataStateBadge state={dataState as any} source={data?.source || 'empty'} fetchedAt={data?.fetchedAt} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(['queued', 'working', 'blocked', 'verified'] as TaskStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-xl border p-4 text-left transition-colors ${
              status === s ? 'border-accent bg-accent/10' : 'border-border bg-bg-card hover:border-border-light'
            }`}
          >
            <p className="text-[11px] uppercase tracking-wide text-fg-dim">{s}</p>
            <p className="mt-1 text-2xl font-bold text-fg">{counts[s] || 0}</p>
          </button>
        ))}
      </div>

      {(error || actionError || data?.message) && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          {error instanceof Error ? error.message : actionError || data?.message}
        </div>
      )}

      <DataCard
        title="SEO action queue"
        dataState={dataState as any}
        fetchedAt={data?.fetchedAt}
        headerRight={
          <button onClick={() => setStatus('all')} className="text-xs text-accent hover:text-accent-light">
            Show all
          </button>
        }
      >
        <div className="space-y-3">
          {filtered.map((task) => (
            <div key={task.id} className="rounded-xl border border-border bg-bg-darkest p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-fg">{task.title}</p>
                  <p className="mt-1 text-xs text-fg-muted">
                    {(task.module || 'SEO') + ' • ' + (task.domain || domain)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-fg-dim">
                    {task.priority}
                  </span>
                  <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] text-accent-light">
                    {task.status}
                  </span>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-fg-muted whitespace-pre-line">
                {task.brief}
              </div>
              {!!task.acceptanceCriteria?.length && (
                <ul className="mt-3 list-disc pl-5 text-xs text-fg-muted space-y-1">
                  {task.acceptanceCriteria.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  disabled={mutation.isPending || task.status === 'verified' || task.status === 'closed'}
                  onClick={() => mutation.mutate({ id: task.id, body: { action: 'close' } })}
                  className="rounded-lg border border-green/30 bg-green/10 px-2.5 py-1 text-[11px] font-medium text-green disabled:opacity-40"
                >
                  Close / verify
                </button>
                <button
                  disabled={mutation.isPending || task.status === 'snoozed'}
                  onClick={() => mutation.mutate({ id: task.id, body: { action: 'snooze', snoozeHours: 24 } })}
                  className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-100 disabled:opacity-40"
                >
                  Snooze 24h
                </button>
                <button
                  disabled={mutation.isPending || task.status === 'queued'}
                  onClick={() => mutation.mutate({ id: task.id, body: { action: 'reopen' } })}
                  className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-fg-muted hover:border-border-light disabled:opacity-40"
                >
                  Reopen
                </button>
              </div>
            </div>
          ))}
          {!isLoading && filtered.length === 0 && (
            <p className="text-sm text-fg-muted">
              No durable tasks for this filter. Run <b>Sync spine</b> from Command Center after alerts exist.
            </p>
          )}
        </div>
      </DataCard>
    </div>
  )
}
