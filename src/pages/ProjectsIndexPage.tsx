import { useMemo, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useVirtualizer } from '@tanstack/react-virtual'
import DataStateBadge from '@/components/DataStateBadge'
import ProjectStatusBadge from '@/components/project/ProjectStatusBadge'
import { DataCard } from '@/components/DataCard'
import { useProject } from '@/contexts/ProjectContext'
import { authFetch } from '@/lib/authToken'
import type { ProjectStatus } from '@/types/project'

const filters: Array<ProjectStatus | 'all'> = ['all', 'active', 'ready', 'planned', 'paused']

interface NewProjectForm {
  name: string
  domain: string
  clientName: string
  market: string
}

function CreateProjectModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<NewProjectForm>({ name: '', domain: '', clientName: '', market: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.domain) return
    setSaving(true)
    setError(null)
    try {
      const res = await authFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Failed: ${res.status}`)
      }
      setForm({ name: '', domain: '', clientName: '', market: '' })
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-overlay" onClick={onClose}>
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="w-full max-w-md bg-bg-card border border-border rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
          <h3 className="text-lg font-bold text-fg">New Project</h3>
          <p className="text-xs text-fg-muted mt-1">Add a new site to your SEO portfolio</p>
          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <div>
              <label className="text-[11px] text-fg-dim mb-1 block">Project Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My Website" required className="w-full bg-bg-darkest border border-border rounded-lg px-3 py-2.5 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-[11px] text-fg-dim mb-1 block">Domain *</label>
              <input value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} placeholder="example.com" required className="w-full bg-bg-darkest border border-border rounded-lg px-3 py-2.5 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-[11px] text-fg-dim mb-1 block">Client Name</label>
              <input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} placeholder="Client or company name" className="w-full bg-bg-darkest border border-border rounded-lg px-3 py-2.5 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-[11px] text-fg-dim mb-1 block">Market</label>
              <input value={form.market} onChange={e => setForm(f => ({ ...f, market: e.target.value }))} placeholder="US, IL, Global" className="w-full bg-bg-darkest border border-border rounded-lg px-3 py-2.5 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent" />
            </div>
            {error && <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-border text-sm text-fg-muted hover:text-fg transition-colors">Cancel</button>
              <button type="submit" disabled={saving || !form.name || !form.domain} className="flex-1 py-2.5 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-40 hover:bg-accent-light transition-colors">{saving ? 'Creating…' : 'Create Project'}</button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default function ProjectsIndexPage() {
  const { projects, loading, error, setActiveProject, source, fetchedAt, refreshProjects } = useProject()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<ProjectStatus | 'all'>('all')
  const [showCreate, setShowCreate] = useState(false)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return projects.filter(project => {
      const statusMatch = status === 'all' || project.status === status
      // Null-safe: API rows can omit optional strings; avoid crashing the /projects screen.
      const queryMatch = !needle || [project.name, project.domain, project.clientName, project.market]
        .map(value => (value ?? '').toString().toLowerCase())
        .some(value => value.includes(needle))
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
          <a href="/command-center" className="rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted hover:border-border-light hover:text-fg">Command Center</a>
          <button
            onClick={() => {
              const params = new URLSearchParams()
              if (status !== 'all') params.set('status', status)
              if (query.trim()) params.set('q', query.trim())
              params.set('format', 'csv')
              window.open(`/api/portfolio/export?${params.toString()}`, '_blank', 'noopener,noreferrer')
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted hover:border-border-light hover:text-fg"
          >
            Export CSV
          </button>
          <button onClick={refreshProjects} className="rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted hover:border-border-light hover:text-fg">Refresh</button>
          <button onClick={() => setShowCreate(true)} className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent-light hover:border-accent/50">+ New Project</button>
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

        {/* Virtual scrolling for 39+ projects — only renders visible items */}
        <VirtualProjectGrid projects={filtered} onSelect={setActiveProject} />
      </DataCard>
      <CreateProjectModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={refreshProjects} />
    </div>
  )
}

/** Virtualized grid — renders only visible project cards */
function VirtualProjectGrid({ projects, onSelect }: { projects: any[]; onSelect: (domain: string) => void }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: projects.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 220, // estimated card height
    overscan: 5,
  })

  return (
    <div
      ref={parentRef}
      className="mt-4 overflow-auto virtual-scroll"
      style={{ maxHeight: 'calc(100vh - 280px)' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map(virtualRow => {
          const project = projects[virtualRow.index]
          return (
            <div
              key={project.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="px-0.5">
                <button onClick={() => onSelect(project.domain)} className="rounded-2xl border border-border bg-bg-darkest p-3 md:p-4 text-left transition-colors hover:border-accent/50 hover:bg-white/[0.04] w-full">
                  {project.screenshotUrl && (
                    <div className="mb-3 overflow-hidden rounded-xl border border-white/10 hidden min-[380px]:block">
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
                  <div className="mt-3 md:mt-4 grid grid-cols-3 gap-1.5 md:gap-2">
                    <span className="rounded-lg md:rounded-xl border border-white/10 bg-white/[0.03] p-1.5 md:p-2"><span className="block text-[10px] text-fg-dim">Health</span><b className="text-base md:text-lg text-fg">{project.healthScore ?? '—'}</b></span>
                    <span className="rounded-lg md:rounded-xl border border-white/10 bg-white/[0.03] p-1.5 md:p-2"><span className="block text-[10px] text-fg-dim">Alerts</span><b className="text-base md:text-lg text-fg">{project.alertCount}</b></span>
                    <span className="rounded-lg md:rounded-xl border border-white/10 bg-white/[0.03] p-1.5 md:p-2"><span className="block text-[10px] text-fg-dim">Tasks</span><b className="text-base md:text-lg text-fg">{project.taskCount}</b></span>
                  </div>
                  <div className="mt-3 md:mt-4 flex items-center justify-between gap-2">
                    <DataStateBadge state={project.dataState} fetchedAt={project.lastFetchedAt} />
                    <span className="text-xs font-medium text-accent-light">Open workspace →</span>
                  </div>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
