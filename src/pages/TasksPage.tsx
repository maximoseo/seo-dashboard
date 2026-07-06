import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DataCard } from '@/components/DataCard'
import DataStateBadge from '@/components/DataStateBadge'
import { useSEO } from '@/contexts/SEOContext'
import { authFetch } from '@/lib/authToken'

type TaskStatus = 'queued' | 'working' | 'blocked' | 'verified'
type TaskPriority = 'low' | 'medium' | 'high' | 'critical'

interface SeoTask {
  id: string
  domain: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  module: string
  brief: string
  acceptanceCriteria?: string[]
}

const fallbackTasks: SeoTask[] = [
  { id: 'fallback-rankings', title: 'Investigate ranking drop', module: 'Rankings', priority: 'high', status: 'queued', domain: 'maximo-seo.ai', brief: 'Provider-backed task API is unavailable; use this as a workflow template.' },
]

async function fetchTasks(domain: string): Promise<{ tasks: SeoTask[]; source: string; fetchedAt: string }> {
  const res = await authFetch(`/api/tasks?domain=${encodeURIComponent(domain)}`)
  if (!res.ok) throw new Error(`Tasks API failed: ${res.status}`)
  return res.json()
}

export default function TasksPage() {
  const { domain } = useSEO()
  const [status, setStatus] = useState<TaskStatus | 'all'>('all')
  const { data, isLoading, error } = useQuery({ queryKey: ['tasks', domain], queryFn: () => fetchTasks(domain), staleTime: 5 * 60 * 1000 })
  const tasks = useMemo(() => (data?.tasks?.length ? data.tasks : fallbackTasks.map(task => ({ ...task, domain }))), [data, domain])
  const filtered = status === 'all' ? tasks : tasks.filter(t => t.status === status)
  const dataState = error ? 'unavailable' : data ? 'live' : isLoading ? 'loading' : 'cached'

  return (
    <div className="space-y-4 lg:space-y-5 max-w-[1400px]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-fg">Tasks / Agents</h2>
          <p className="text-xs md:text-sm text-fg-muted mt-0.5">Operator queue generated from alerts, opportunities and audits</p>
        </div>
        <DataStateBadge state={dataState} source={data?.source || 'rules fallback'} fetchedAt={data?.fetchedAt} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(['queued', 'working', 'blocked', 'verified'] as TaskStatus[]).map(s => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded-xl border p-4 text-left transition-colors ${status === s ? 'border-accent bg-accent/10' : 'border-border bg-bg-card hover:border-border-light'}`}>
            <p className="text-[11px] uppercase tracking-wide text-fg-dim">{s}</p>
            <p className="mt-1 text-2xl font-bold text-fg">{tasks.filter(t => t.status === s).length}</p>
          </button>
        ))}
      </div>

      <DataCard
        title="SEO action queue"
        dataState={dataState}
        fetchedAt={data?.fetchedAt}
        headerRight={<button onClick={() => setStatus('all')} className="text-xs text-accent hover:text-accent-light">Show all</button>}
      >
        <div className="space-y-3">
          {filtered.map(task => (
            <div key={task.id} className="rounded-xl border border-border bg-bg-darkest p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-fg">{task.title}</p>
                  <p className="mt-1 text-xs text-fg-muted">{task.module} • {task.domain}</p>
                </div>
                <div className="flex gap-2">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-fg-dim">{task.priority}</span>
                  <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] text-accent-light">{task.status}</span>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-fg-muted whitespace-pre-line">
                {task.brief}
              </div>
              {!!task.acceptanceCriteria?.length && (
                <ul className="mt-3 list-disc pl-5 text-xs text-fg-muted space-y-1">
                  {task.acceptanceCriteria.map(item => <li key={item}>{item}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      </DataCard>
    </div>
  )
}
