import { Link } from 'react-router-dom'
import { DataCard } from '@/components/DataCard'
import DataStateBadge from '@/components/DataStateBadge'
import ProjectStatusBadge from '@/components/project/ProjectStatusBadge'
import { useProject } from '@/contexts/ProjectContext'

export default function ProjectSettingsPage() {
  const { activeProject } = useProject()
  if (!activeProject) return null

  return (
    <div className="space-y-4 lg:space-y-5">
      <DataCard title="Project settings" dataState={activeProject.dataState} fetchedAt={activeProject.lastFetchedAt}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-bg-darkest p-4">
            <p className="text-[11px] uppercase tracking-wide text-fg-dim">Identity</p>
            <p className="mt-2 text-sm font-semibold text-fg">{activeProject.name}</p>
            <p className="text-xs text-fg-muted">{activeProject.domain}</p>
          </div>
          <div className="rounded-xl border border-border bg-bg-darkest p-4">
            <p className="text-[11px] uppercase tracking-wide text-fg-dim">Status</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <ProjectStatusBadge status={activeProject.status} />
              <DataStateBadge state={activeProject.dataState} />
            </div>
          </div>
        </div>
      </DataCard>

      <DataCard title="Provider connections" dataState="live">
        <div className="flex flex-wrap gap-2">
          {activeProject.connectedSources.map(source => <span key={source} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-fg-muted">{source}</span>)}
        </div>
        <p className="mt-3 text-xs text-fg-dim">Global provider status is still available in the legacy Settings page.</p>
        <Link to="/settings" className="mt-3 inline-flex rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted hover:border-border-light hover:text-fg">Open global settings</Link>
      </DataCard>
    </div>
  )
}
