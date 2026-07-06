import { Link } from 'react-router-dom'
import DataStateBadge from '@/components/DataStateBadge'
import ProjectStatusBadge from '@/components/project/ProjectStatusBadge'
import { useProject } from '@/contexts/ProjectContext'

export default function ProjectHeader() {
  const { activeProject, activeDomain, refreshProjects, loading, source, error } = useProject()
  const projectUrl = `${window.location.origin}/projects/${encodeURIComponent(activeProject?.domain || activeDomain)}`

  const copyUrl = async () => {
    try {
      await navigator.clipboard?.writeText(projectUrl)
    } catch {
      // Non-critical; browsers may block clipboard in some contexts.
    }
  }

  if (loading && !activeProject) {
    return <div className="rounded-2xl border border-border bg-bg-card p-5 text-sm text-fg-muted">Loading project workspace…</div>
  }

  if (error && !activeProject) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5">
        <p className="text-sm font-semibold text-red-200">Project list unavailable</p>
        <p className="mt-1 text-xs text-red-100/80">{error}</p>
        <button onClick={refreshProjects} className="mt-3 inline-flex rounded-lg border border-red-300/30 px-3 py-1.5 text-xs text-red-100 hover:bg-red-500/10">Retry</button>
      </div>
    )
  }

  if (!activeProject) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5">
        <p className="text-sm font-semibold text-red-200">Project not found</p>
        <p className="mt-1 text-xs text-red-100/80">The requested domain is not in the portfolio yet.</p>
        <Link to="/projects" className="mt-3 inline-flex rounded-lg border border-red-300/30 px-3 py-1.5 text-xs text-red-100">Back to projects</Link>
      </div>
    )
  }

  return (
    <section className="rounded-2xl border border-border bg-bg-card p-4 md:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-dim">
            <Link to="/projects" className="hover:text-fg">Projects</Link>
            <span>/</span>
            <span className="truncate">{activeProject.clientName}</span>
            <span>/</span>
            <span className="truncate text-fg-muted">{activeProject.domain}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-fg md:text-2xl">{activeProject.name}</h2>
            <ProjectStatusBadge status={activeProject.status} />
            <DataStateBadge state={activeProject.dataState} source={source ?? undefined} fetchedAt={activeProject.lastFetchedAt} />
          </div>
          <p className="mt-1 text-sm text-fg-muted">{activeProject.domain} • {activeProject.market} • priority {activeProject.priority}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={refreshProjects} className="rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-xs font-medium text-fg-muted hover:border-border-light hover:text-fg">Refresh</button>
          <button onClick={copyUrl} className="rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-xs font-medium text-fg-muted hover:border-border-light hover:text-fg">Copy project URL</button>
          <Link to={`/projects/${encodeURIComponent(activeProject.domain)}/reports`} className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-medium text-accent-light hover:border-accent/50">Generate report</Link>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-bg-darkest p-3">
          <p className="text-[11px] uppercase tracking-wide text-fg-dim">Health</p>
          <p className="mt-1 text-2xl font-bold text-fg">{activeProject.healthScore ?? '—'}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-bg-darkest p-3">
          <p className="text-[11px] uppercase tracking-wide text-fg-dim">Alerts</p>
          <p className="mt-1 text-2xl font-bold text-fg">{activeProject.alertCount}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-bg-darkest p-3">
          <p className="text-[11px] uppercase tracking-wide text-fg-dim">Tasks</p>
          <p className="mt-1 text-2xl font-bold text-fg">{activeProject.taskCount}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-bg-darkest p-3">
          <p className="text-[11px] uppercase tracking-wide text-fg-dim">Sources</p>
          <p className="mt-1 truncate text-sm font-semibold text-fg">{activeProject.connectedSources.join(', ')}</p>
        </div>
      </div>
    </section>
  )
}
