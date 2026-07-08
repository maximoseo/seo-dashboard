import { useMemo, useState } from 'react'
import DataStateBadge from '@/components/DataStateBadge'
import ProjectStatusBadge from '@/components/project/ProjectStatusBadge'
import { DataCard } from '@/components/DataCard'
import { useProject } from '@/contexts/ProjectContext'
import type { ProjectStatus } from '@/types/project'

const filters: Array<ProjectStatus | 'all'> = ['all', 'active', 'ready', 'planned', 'paused']

export default function ProjectsIndexPage() {
  const { projects, loading, error, setActiveProject, source, fetchedAt, refreshProjects } = useProject()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<ProjectStatus | 'all'>('all')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return projects.filter(project => {
      const statusMatch = status === 'all' || project.status === status
      const queryMatch = !needle || [project.name, project.domain, project.clientName, project.market].some(value => value.toLowerCase().includes(needle))
      return statusMatch && queryMatch
    })
  }, [projects, query, status])

  const dataState = error ? 'unavailable' : loading ? 'loading' : projects.length ? (source === 'supabase' ? 'live' : 'cached') : 'unavailable'

  return (
    <div className="max-w-[1400px] space-y-4 lg:space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-bold text-fg md:text-2xl">Projects / Sites</h2>
          <p className="mt-1 text-sm text-fg-muted">Choose a site and open its full SEO workspace.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DataStateBadge state={dataState} source={source || undefined} fetchedAt={fetchedAt} />
          <button onClick={refreshProjects} className="rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted hover:border-border-light hover:text-fg">Refresh</button>
        </div>
      </div>

      <DataCard title="Portfolio selector" dataState={dataState} fetchedAt={fetchedAt}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search by site, domain, client or market…"
            className="w-full rounded-xl border border-border bg-bg-darkest px-3 py-2.5 text-sm text-fg outline-none placeholder:text-fg-dim focus:border-accent/60 md:max-w-md"
          />
          <div className="flex flex-wrap gap-2">
            {filters.map(filter => (
              <button key={filter} onClick={() => setStatus(filter)} className={`rounded-lg border px-3 py-1.5 text-xs capitalize ${status === filter ? 'border-accent bg-accent/10 text-accent-light' : 'border-border text-fg-muted hover:border-border-light hover:text-fg'}`}>{filter}</button>
            ))}
          </div>
        </div>

        {error && <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
        {!loading && filtered.length === 0 && (
          <div className="mt-4 rounded-xl border border-border bg-bg-darkest p-6 text-center text-sm text-fg-muted">
            No projects found. When the API returns an empty portfolio, the dashboard shows this real empty state instead of fake demo domains.
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {filtered.map(project => (
            <button key={project.id} onClick={() => setActiveProject(project.domain)} className="rounded-2xl border border-border bg-bg-darkest p-4 text-left transition-colors hover:border-accent/50 hover:bg-white/[0.04]">
              {project.screenshotUrl && (
                <div className="mb-3 overflow-hidden rounded-xl border border-white/10">
                  <img src={project.screenshotUrl} alt={`${project.domain} preview`} className="h-32 w-full object-cover object-top" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                </div>
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-fg">{project.name}</p>
                  <p className="mt-1 truncate text-sm text-fg-muted">{project.domain}</p>
                  <p className="mt-0.5 truncate text-xs text-fg-dim">{project.clientName} • {project.market}</p>
                </div>
                <ProjectStatusBadge status={project.status} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <span className="rounded-xl border border-white/10 bg-white/[0.03] p-2"><span className="block text-[10px] text-fg-dim">Health</span><b className="text-lg text-fg">{project.healthScore ?? '—'}</b></span>
                <span className="rounded-xl border border-white/10 bg-white/[0.03] p-2"><span className="block text-[10px] text-fg-dim">Alerts</span><b className="text-lg text-fg">{project.alertCount}</b></span>
                <span className="rounded-xl border border-white/10 bg-white/[0.03] p-2"><span className="block text-[10px] text-fg-dim">Tasks</span><b className="text-lg text-fg">{project.taskCount}</b></span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2">
                <DataStateBadge state={project.dataState} fetchedAt={project.lastFetchedAt} />
                <span className="text-xs font-medium text-accent-light">Open workspace →</span>
              </div>
            </button>
          ))}
        </div>
      </DataCard>
    </div>
  )
}
