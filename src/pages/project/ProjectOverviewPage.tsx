import { Link } from 'react-router-dom'
import { DataCard } from '@/components/DataCard'
import DataStateBadge from '@/components/DataStateBadge'
import { useProject } from '@/contexts/ProjectContext'

export default function ProjectOverviewPage() {
  const { activeProject, error, refreshProjects } = useProject()

  if (error && !activeProject) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-200">
        <p className="font-semibold">Project data unavailable</p>
        <p className="mt-1 text-xs text-red-100/80">{error}</p>
        <button onClick={refreshProjects} className="mt-3 rounded-lg border border-red-300/30 px-3 py-1.5 text-xs text-red-100 hover:bg-red-500/10">Retry</button>
      </div>
    )
  }

  if (!activeProject) {
    return <div className="rounded-xl border border-border bg-bg-card p-5 text-sm text-fg-muted">Choose a project to view its workspace.</div>
  }

  const liveModules = activeProject.modules.filter(module => module.state === 'live' || module.state === 'cached').length
  const plannedModules = activeProject.modules.filter(module => module.state === 'planned').length

  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-fg-dim">Workspace health</p>
          <p className="mt-1 text-3xl font-bold text-fg">{activeProject.healthScore ?? '—'}</p>
        </div>
        <div className="rounded-xl border border-border bg-bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-fg-dim">Open alerts</p>
          <p className="mt-1 text-3xl font-bold text-fg">{activeProject.alertCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-fg-dim">Tasks</p>
          <p className="mt-1 text-3xl font-bold text-fg">{activeProject.taskCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-fg-dim">Modules</p>
          <p className="mt-1 text-3xl font-bold text-fg">{liveModules}<span className="text-sm text-fg-dim">/{activeProject.modules.length}</span></p>
        </div>
      </div>

      <DataCard title="Module hub" dataState={activeProject.dataState} fetchedAt={activeProject.lastFetchedAt}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {activeProject.modules.map(module => (
            <Link key={module.slug} to={module.href} className="rounded-xl border border-border bg-bg-darkest p-4 transition-colors hover:border-border-light hover:bg-white/[0.04]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-fg">{module.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-fg-muted">{module.description}</p>
                </div>
                <DataStateBadge state={module.state} />
              </div>
            </Link>
          ))}
        </div>
      </DataCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DataCard title="Next best actions" dataState="live">
          <ul className="space-y-2 text-sm text-fg-muted">
            <li>• Review {activeProject.alertCount} active alert signals.</li>
            <li>• Triage {activeProject.taskCount} SEO implementation tasks.</li>
            <li>• Generate a report for {activeProject.clientName}.</li>
          </ul>
        </DataCard>
        <DataCard title="Connected sources" dataState={activeProject.dataState}>
          <div className="flex flex-wrap gap-2">
            {activeProject.connectedSources.map(source => <span key={source} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-fg-muted">{source}</span>)}
          </div>
        </DataCard>
        <DataCard title="Roadmap modules" dataState={plannedModules ? 'planned' : activeProject.dataState}>
          <p className="text-sm text-fg-muted">{plannedModules} modules are marked planned and will show explicit planned states until real data is connected.</p>
        </DataCard>
      </div>
    </div>
  )
}
