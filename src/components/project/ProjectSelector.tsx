import { useEffect, useMemo, useState } from 'react'
import { useProject } from '@/contexts/ProjectContext'
import DataStateBadge from '@/components/DataStateBadge'
import ProjectStatusBadge from '@/components/project/ProjectStatusBadge'

interface ProjectSelectorProps {
  onSelected?: () => void
}

export default function ProjectSelector({ onSelected }: ProjectSelectorProps) {
  const { activeProject, activeDomain, projects, loading, error, setActiveProject } = useProject()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return projects
    return projects.filter(project => [project.name, project.domain, project.clientName, project.market, project.status].some(value => value.toLowerCase().includes(needle)))
  }, [projects, query])

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  const selectProject = (domain: string) => {
    setActiveProject(domain, { preserveModule: true })
    setOpen(false)
    onSelected?.()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border hover:border-border-light transition-colors text-sm touch-target-reset"
        aria-label="Choose project"
      >
        <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="#60A5FA" strokeWidth="1.5" />
            <circle cx="8" cy="8" r="2" fill="#60A5FA" />
          </svg>
        </div>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[13px] font-medium text-fg">{activeProject?.name || activeDomain}</span>
          <span className="block truncate text-[11px] text-fg-dim">{activeProject?.domain || activeDomain}</span>
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-fg-dim shrink-0">
          <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-selector-title"
            className="fixed left-3 right-3 top-20 z-[80] mx-auto max-w-2xl overflow-hidden rounded-2xl border border-border-light bg-bg-card shadow-2xl lg:left-[260px] lg:right-auto lg:top-24 lg:w-[520px]"
          >
            <div className="border-b border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p id="project-selector-title" className="text-sm font-semibold text-fg">Choose site project</p>
                  <p className="mt-0.5 text-xs text-fg-muted">Search a client/domain and jump into its workspace.</p>
                </div>
                <button onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-sm text-fg-dim hover:bg-white/[0.06] hover:text-fg">✕</button>
              </div>
              <input
                autoFocus
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search name, domain, client, market…"
                className="mt-4 w-full rounded-xl border border-border bg-bg-darkest px-3 py-2.5 text-sm text-fg outline-none placeholder:text-fg-dim focus:border-accent/60"
              />
            </div>

            <div className="max-h-[60vh] overflow-auto p-2">
              {loading && <p className="p-4 text-sm text-fg-muted">Loading projects…</p>}
              {error && <p className="p-4 text-sm text-red-300">{error}</p>}
              {!loading && filtered.length === 0 && <p className="p-4 text-sm text-fg-muted">No projects match this search.</p>}
              {filtered.map(project => {
                const active = project.domain === activeProject?.domain
                return (
                  <button
                    key={project.id}
                    onClick={() => selectProject(project.domain)}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${active ? 'border-accent bg-accent/10' : 'border-transparent hover:border-border hover:bg-white/[0.04]'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-fg">{project.name}</p>
                        <p className="mt-0.5 truncate text-xs text-fg-muted">{project.clientName} • {project.domain}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <ProjectStatusBadge status={project.status} />
                        <DataStateBadge state={project.dataState} fetchedAt={project.lastFetchedAt} />
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <span className="rounded-lg bg-bg-darkest px-2 py-1 text-fg-muted">Health <b className="text-fg">{project.healthScore ?? '—'}</b></span>
                      <span className="rounded-lg bg-bg-darkest px-2 py-1 text-fg-muted">Alerts <b className="text-fg">{project.alertCount}</b></span>
                      <span className="rounded-lg bg-bg-darkest px-2 py-1 text-fg-muted">Tasks <b className="text-fg">{project.taskCount}</b></span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
