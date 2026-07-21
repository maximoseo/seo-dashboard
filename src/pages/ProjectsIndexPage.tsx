import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useVirtualizer } from '@tanstack/react-virtual'
import DataStateBadge from '@/components/DataStateBadge'
import ProjectStatusBadge from '@/components/project/ProjectStatusBadge'
import { DataCard } from '@/components/DataCard'
import { useProject } from '@/contexts/ProjectContext'
import { authFetch } from '@/lib/authToken'
import type { ProjectStatus, ProjectSummary } from '@/types/project'

const filters: Array<ProjectStatus | 'all'> = ['all', 'active', 'ready', 'planned', 'paused']

type SortKey = 'name-asc' | 'health-desc' | 'health-asc' | 'alerts-desc' | 'tasks-desc'
type ViewMode = 'grid' | 'list'

const sortOptions: Array<{ value: SortKey; label: string }> = [
  { value: 'name-asc', label: 'Name (A–Z)' },
  { value: 'health-desc', label: 'Health (high→low)' },
  { value: 'health-asc', label: 'Health (low→high)' },
  { value: 'alerts-desc', label: 'Alerts (most)' },
  { value: 'tasks-desc', label: 'Tasks (most)' },
]

const STORAGE_KEYS = {
  sort: 'projects:sort',
  viewMode: 'projects:viewMode',
  expandedGroups: 'projects:expandedGroups',
  pinned: 'projects:pinned',
  recent: 'projects:recent',
} as const

interface NewProjectForm {
  name: string
  domain: string
  clientName: string
  market: string
}

interface RecentEntry {
  domain: string
  openedAt: number
}

interface GroupedProjects {
  clientName: string
  projects: ProjectSummary[]
  avgHealth: number | null
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore quota / private-mode errors
  }
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

function BulkActionModal({
  open,
  action,
  count,
  onClose,
  onConfirm,
  busy,
}: {
  open: boolean
  action: 'pause' | 'archive' | 'delete' | 'tag' | null
  count: number
  onClose: () => void
  onConfirm: (tag?: string) => void
  busy: boolean
}) {
  const [tag, setTag] = useState('')
  useEffect(() => {
    if (open) setTag('')
  }, [open])

  if (!open || !action) return null

  const title = { pause: 'Pause Projects', archive: 'Archive Projects', delete: 'Delete Projects', tag: 'Tag Projects' }[action]
  const isDanger = action === 'delete'

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-overlay" onClick={onClose}>
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="w-full max-w-md bg-bg-card border border-border rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
          <h3 className="text-lg font-bold text-fg">{title}</h3>
          <p className="text-xs text-fg-muted mt-1">
            {action === 'delete'
              ? `Permanently delete ${count} project${count !== 1 ? 's' : ''}? This cannot be undone.`
              : `Apply "${action}" to ${count} selected project${count !== 1 ? 's' : ''}?`}
          </p>
          {action === 'tag' && (
            <div className="mt-4">
              <label className="text-[11px] text-fg-dim mb-1 block">Tag</label>
              <input
                value={tag}
                onChange={e => setTag(e.target.value)}
                placeholder="e.g. priority, q3-focus"
                className="w-full bg-bg-darkest border border-border rounded-lg px-3 py-2.5 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:border-accent"
              />
            </div>
          )}
          <div className="flex gap-2 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-border text-sm text-fg-muted hover:text-fg transition-colors">Cancel</button>
            <button
              type="button"
              disabled={busy || (action === 'tag' && !tag.trim())}
              onClick={() => onConfirm(action === 'tag' ? tag.trim() : undefined)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${
                isDanger ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-accent text-white hover:bg-accent-light'
              }`}
            >
              {busy ? 'Working…' : isDanger ? 'Delete' : 'Confirm'}
            </button>
          </div>
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
  const [sortKey, setSortKey] = useState<SortKey>(() => readStorage<SortKey>(STORAGE_KEYS.sort, 'name-asc'))
  const [viewMode, setViewMode] = useState<ViewMode>(() => readStorage<ViewMode>(STORAGE_KEYS.viewMode, 'grid'))
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => readStorage<Record<string, boolean>>(STORAGE_KEYS.expandedGroups, {}))
  const [pinned, setPinned] = useState<string[]>(() => readStorage<string[]>(STORAGE_KEYS.pinned, []))
  const [recent, setRecent] = useState<RecentEntry[]>(() => readStorage<RecentEntry[]>(STORAGE_KEYS.recent, []))
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<'pause' | 'archive' | 'delete' | 'tag' | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [kbIndex, setKbIndex] = useState(-1)
  const searchRef = useRef<HTMLInputElement>(null)

  // ---------- persistence helpers ----------
  useEffect(() => writeStorage(STORAGE_KEYS.sort, sortKey), [sortKey])
  useEffect(() => writeStorage(STORAGE_KEYS.viewMode, viewMode), [viewMode])
  useEffect(() => writeStorage(STORAGE_KEYS.expandedGroups, expandedGroups), [expandedGroups])
  useEffect(() => writeStorage(STORAGE_KEYS.pinned, pinned), [pinned])
  useEffect(() => writeStorage(STORAGE_KEYS.recent, recent), [recent])

  // ---------- derived data ----------
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return projects.filter(project => {
      const statusMatch = status === 'all' || project.status === status
      const queryMatch = !needle || [project.name, project.domain, project.clientName, project.market]
        .map(value => (value ?? '').toString().toLowerCase())
        .some(value => value.includes(needle))
      return statusMatch && queryMatch
    })
  }, [projects, query, status])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    switch (sortKey) {
      case 'name-asc':
        arr.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
        break
      case 'health-desc':
        arr.sort((a, b) => (b.healthScore ?? -1) - (a.healthScore ?? -1))
        break
      case 'health-asc':
        arr.sort((a, b) => (a.healthScore ?? 999) - (b.healthScore ?? 999))
        break
      case 'alerts-desc':
        arr.sort((a, b) => (b.alertCount ?? 0) - (a.alertCount ?? 0))
        break
      case 'tasks-desc':
        arr.sort((a, b) => (b.taskCount ?? 0) - (a.taskCount ?? 0))
        break
    }
    return arr
  }, [filtered, sortKey])

  const grouped = useMemo<GroupedProjects[]>(() => {
    const map = new Map<string, ProjectSummary[]>()
    for (const p of sorted) {
      const key = (p.clientName ?? '').trim() || 'Uncategorized'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    const groups: GroupedProjects[] = Array.from(map.entries()).map(([clientName, projs]) => {
      const scores = projs.map(p => p.healthScore).filter((s): s is number => s != null)
      const avgHealth = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
      return { clientName, projects: projs, avgHealth }
    })
    // Sort groups alphabetically, keep "Uncategorized" last
    groups.sort((a, b) => {
      if (a.clientName === 'Uncategorized') return 1
      if (b.clientName === 'Uncategorized') return -1
      return a.clientName.localeCompare(b.clientName)
    })
    return groups
  }, [sorted])

  // Flatten for virtualizer: pinned first, then grouped
  const flatList = useMemo(() => {
    const pinnedSet = new Set(pinned)
    const pinnedProjects = sorted.filter(p => pinnedSet.has(p.id))
    const restGroups = grouped.map(g => ({
      ...g,
      projects: g.projects.filter(p => !pinnedSet.has(p.id)),
    })).filter(g => g.projects.length > 0)

    const items: Array<{ type: 'pinned' | 'group-header' | 'project'; project?: ProjectSummary; group?: GroupedProjects }> = []
    if (pinnedProjects.length) {
      items.push({ type: 'pinned', project: undefined, group: undefined })
      for (const p of pinnedProjects) items.push({ type: 'project', project: p })
    }
    for (const g of restGroups) {
      const isExpanded = expandedGroups[g.clientName] !== false // default expanded
      items.push({ type: 'group-header', group: g })
      if (isExpanded) {
        for (const p of g.projects) items.push({ type: 'project', project: p })
      }
    }
    return items
  }, [sorted, grouped, pinned, expandedGroups])

  const visibleProjects = useMemo(() => flatList.filter(i => i.type === 'project').map(i => i.project!), [flatList])

  const recentProjects = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    return recent
      .filter(r => r.openedAt > cutoff)
      .sort((a, b) => b.openedAt - a.openedAt)
      .slice(0, 5)
      .map(r => projects.find(p => p.domain === r.domain))
      .filter((p): p is ProjectSummary => Boolean(p))
  }, [recent, projects])

  // ---------- interactions ----------
  const openProject = useCallback((domain: string) => {
    setRecent(prev => [{ domain, openedAt: Date.now() }, ...prev.filter(r => r.domain !== domain)].slice(0, 20))
    setActiveProject(domain)
  }, [setActiveProject])

  const togglePin = useCallback((id: string) => {
    setPinned(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }, [])

  const toggleGroup = useCallback((clientName: string) => {
    setExpandedGroups(prev => ({ ...prev, [clientName]: prev[clientName] === false }))
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(visibleProjects.map(p => p.id)))
  }, [visibleProjects])

  const deselectAll = useCallback(() => setSelectedIds(new Set()), [])

  const handleBulkConfirm = useCallback(async (tag?: string) => {
    if (!bulkAction || selectedIds.size === 0) return
    setBulkBusy(true)
    try {
      const ids = Array.from(selectedIds)
      if (bulkAction === 'delete') {
        await Promise.all(ids.map(id =>
          authFetch(`/api/projects/${id}`, { method: 'DELETE' })
        ))
      } else if (bulkAction === 'tag') {
        await Promise.all(ids.map(id =>
          authFetch(`/api/projects/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: [tag] }),
          })
        ))
      } else {
        const statusMap = { pause: 'paused', archive: 'archived' } as const
        await Promise.all(ids.map(id =>
          authFetch(`/api/projects/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: statusMap[bulkAction] }),
          })
        ))
      }
      setSelectedIds(new Set())
      setSelectMode(false)
      setBulkAction(null)
      await refreshProjects()
    } catch (err) {
      console.error('Bulk action failed', err)
    } finally {
      setBulkBusy(false)
    }
  }, [bulkAction, selectedIds, refreshProjects])

  // ---------- keyboard navigation ----------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      if (e.key === '/' && !isInput) {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (e.key === 'Escape') {
        if (query) setQuery('')
        if (showCreate) setShowCreate(false)
        if (bulkAction) setBulkAction(null)
        setKbIndex(-1)
        return
      }
      if (isInput) return

      const max = visibleProjects.length - 1
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        setKbIndex(i => Math.min(i + 1, max))
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        setKbIndex(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && kbIndex >= 0 && kbIndex <= max) {
        e.preventDefault()
        openProject(visibleProjects[kbIndex].domain)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [visibleProjects, kbIndex, query, showCreate, bulkAction, openProject])

  // Reset keyboard index when list changes
  useEffect(() => setKbIndex(-1), [query, status, sortKey, viewMode, pinned, expandedGroups])

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

      {/* Recent projects */}
      {recentProjects.length > 0 && (
        <DataCard title="Recent" className="border-accent/20">
          <div className="flex flex-wrap gap-2">
            {recentProjects.map(p => (
              <button
                key={p.id}
                onClick={() => openProject(p.domain)}
                className="group flex items-center gap-2 rounded-xl border border-border bg-bg-darkest px-3 py-2 text-left text-xs hover:border-accent/50 hover:bg-white/[0.04]"
              >
                <span className="font-medium text-fg">{p.name}</span>
                <span className="text-fg-dim">{p.domain}</span>
                <span className="text-accent-light opacity-0 group-hover:opacity-100">→</span>
              </button>
            ))}
          </div>
        </DataCard>
      )}

      <DataCard title="Portfolio selector" dataState={dataState} fetchedAt={fetchedAt}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input
            ref={searchRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search by site, domain, client or market…"
            className="w-full rounded-xl border border-border bg-bg-darkest px-3 py-2.5 text-sm text-fg outline-none placeholder:text-fg-dim focus:border-accent/60 md:max-w-md"
          />
          <div className="flex flex-wrap items-center gap-2">
            {filters.map(filter => (
              <button key={filter} onClick={() => setStatus(filter)} className={`rounded-lg border px-3 py-1.5 text-xs capitalize ${status === filter ? 'border-accent bg-accent/10 text-accent-light' : 'border-border text-fg-muted hover:border-border-light hover:text-fg'}`}>{filter}</button>
            ))}
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
              className="rounded-lg border border-border bg-bg-darkest px-2 py-1.5 text-xs text-fg-muted outline-none focus:border-accent/60"
              aria-label="Sort projects"
            >
              {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button
              onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
              className="rounded-lg border border-border p-1.5 text-fg-muted hover:border-border-light hover:text-fg"
              title={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
            >
              {viewMode === 'grid' ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 3h12M2 8h12M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/></svg>
              )}
            </button>
            <button
              onClick={() => { setSelectMode(s => !s); if (selectMode) setSelectedIds(new Set()) }}
              className={`rounded-lg border px-3 py-1.5 text-xs ${selectMode ? 'border-accent bg-accent/10 text-accent-light' : 'border-border text-fg-muted hover:border-border-light hover:text-fg'}`}
            >
              {selectMode ? 'Cancel' : 'Select'}
            </button>
          </div>
        </div>

        {/* Bulk actions bar */}
        {selectMode && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-bg-darkest p-2">
            <span className="text-xs text-fg-muted">{selectedIds.size} selected</span>
            <button onClick={selectAll} className="rounded-lg border border-border px-2 py-1 text-[11px] text-fg-muted hover:text-fg">Select all</button>
            <button onClick={deselectAll} className="rounded-lg border border-border px-2 py-1 text-[11px] text-fg-muted hover:text-fg">Deselect all</button>
            <div className="mx-2 h-4 w-px bg-border" />
            <button onClick={() => setBulkAction('pause')} disabled={selectedIds.size === 0} className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-[11px] text-yellow-300 disabled:opacity-40">Pause</button>
            <button onClick={() => setBulkAction('archive')} disabled={selectedIds.size === 0} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-fg-dim disabled:opacity-40">Archive</button>
            <button onClick={() => setBulkAction('tag')} disabled={selectedIds.size === 0} className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-[11px] text-blue-300 disabled:opacity-40">Tag</button>
            <button onClick={() => setBulkAction('delete')} disabled={selectedIds.size === 0} className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-300 disabled:opacity-40">Delete</button>
          </div>
        )}

        {error && <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
        {!loading && filtered.length === 0 && (
          <div className="mt-4 rounded-xl border border-border bg-bg-darkest p-6 text-center text-sm text-fg-muted">
            No projects found. When the API returns an empty portfolio, the dashboard shows this real empty state instead of fake demo domains.
          </div>
        )}

        {/* Virtual scrolling for 39+ projects — only renders visible items */}
        <VirtualProjectList
          items={flatList}
          viewMode={viewMode}
          selectMode={selectMode}
          selectedIds={selectedIds}
          pinned={pinned}
          kbIndex={kbIndex}
          visibleProjects={visibleProjects}
          expandedGroups={expandedGroups}
          onToggleGroup={toggleGroup}
          onToggleSelect={toggleSelect}
          onTogglePin={togglePin}
          onOpen={openProject}
        />
      </DataCard>
      <CreateProjectModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={refreshProjects} />
      <BulkActionModal open={bulkAction !== null} action={bulkAction} count={selectedIds.size} onClose={() => setBulkAction(null)} onConfirm={handleBulkConfirm} busy={bulkBusy} />
    </div>
  )
}

/** Virtualized list with grouping, pinning, selection, keyboard nav, grid/list views.
 * Desktop renders 2–3 cards per row (responsive); mobile renders 1. */
function VirtualProjectList({
  items,
  viewMode,
  selectMode,
  selectedIds,
  pinned,
  kbIndex,
  visibleProjects,
  expandedGroups,
  onToggleGroup,
  onToggleSelect,
  onTogglePin,
  onOpen,
}: {
  items: Array<{ type: 'pinned' | 'group-header' | 'project'; project?: ProjectSummary; group?: GroupedProjects }>
  viewMode: ViewMode
  selectMode: boolean
  selectedIds: Set<string>
  pinned: string[]
  kbIndex: number
  visibleProjects: ProjectSummary[]
  expandedGroups: Record<string, boolean>
  onToggleGroup: (clientName: string) => void
  onToggleSelect: (id: string) => void
  onTogglePin: (id: string) => void
  onOpen: (domain: string) => void
}) {
  const parentRef = useRef<HTMLDivElement>(null)

  // Responsive column count via container width
  const [containerWidth, setContainerWidth] = useState(1024)
  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    setContainerWidth(el.clientWidth)
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const columns = useMemo(() => {
    if (viewMode === 'list') return 1
    if (containerWidth >= 1280) return 3
    if (containerWidth >= 860) return 2
    return 1
  }, [viewMode, containerWidth])

  const GRID_CARD_H = 300
  const LIST_ROW_H = 64

  // Chunk consecutive projects into rows of `columns`; headers stay full-width
  type Row =
    | { kind: 'header'; item: (typeof items)[number] }
    | { kind: 'projects'; projects: ProjectSummary[] }

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    const buffer: ProjectSummary[] = []
    const flush = () => {
      while (buffer.length) out.push({ kind: 'projects', projects: buffer.splice(0, columns) })
    }
    for (const item of items) {
      if (item.type === 'project' && item.project) {
        buffer.push(item.project)
        if (buffer.length === columns) flush()
      } else {
        flush()
        out.push({ kind: 'header', item })
      }
    }
    flush()
    return out
  }, [items, columns])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: index => {
      const row = rows[index]
      if (row.kind === 'header') return row.item.type === 'group-header' ? 44 : 32
      return viewMode === 'grid' ? GRID_CARD_H : LIST_ROW_H
    },
    overscan: 8,
  })

  const projectIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    visibleProjects.forEach((p, i) => map.set(p.id, i))
    return map
  }, [visibleProjects])

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
          const row = rows[virtualRow.index]

          if (row.kind === 'header') {
            const item = row.item
            if (item.type === 'pinned') {
              return (
                <div
                  key="pinned-header"
                  style={{
                    position: 'absolute', top: 0, left: 0, width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="flex items-center gap-2 px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-light">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l2.1 4.3 4.9.7-3.5 3.4.8 4.8L8 12l-4.3 2.2.8-4.8L1 6l4.9-.7L8 1z"/></svg>
                    Pinned
                  </div>
                </div>
              )
            }
            if (item.type === 'group-header' && item.group) {
              const g = item.group
              const isExpanded = expandedGroups[g.clientName] !== false
              return (
                <div
                  key={`group-${g.clientName}`}
                  style={{
                    position: 'absolute', top: 0, left: 0, width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <button
                    onClick={() => onToggleGroup(g.clientName)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-bg-darkest px-3 py-2 text-left hover:border-border-light"
                  >
                    <div className="flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span className="text-sm font-semibold text-fg">{g.clientName}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-fg-dim">{g.projects.length}</span>
                    </div>
                    {g.avgHealth != null && (
                      <span className={`text-xs font-medium ${g.avgHealth >= 80 ? 'text-green-300' : g.avgHealth >= 60 ? 'text-yellow-300' : 'text-red-300'}`}>
                        Avg health {g.avgHealth}
                      </span>
                    )}
                  </button>
                </div>
              )
            }
            return null
          }

          return (
            <div
              key={`row-${virtualRow.index}`}
              style={{
                position: 'absolute', top: 0, left: 0, width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                className={viewMode === 'list' ? 'flex flex-col gap-2 px-0.5' : 'grid gap-3 px-0.5'}
                style={viewMode === 'list' ? undefined : { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
              >
                {row.projects.map(project => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    viewMode={viewMode}
                    selectMode={selectMode}
                    isSelected={selectedIds.has(project.id)}
                    isPinned={pinned.includes(project.id)}
                    isKbActive={(projectIndexMap.get(project.id) ?? -1) === kbIndex && kbIndex >= 0}
                    onToggleSelect={onToggleSelect}
                    onTogglePin={onTogglePin}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Single project card (grid) or row (list) */
function ProjectCard({
  project,
  viewMode,
  selectMode,
  isSelected,
  isPinned,
  isKbActive,
  onToggleSelect,
  onTogglePin,
  onOpen,
}: {
  project: ProjectSummary
  viewMode: ViewMode
  selectMode: boolean
  isSelected: boolean
  isPinned: boolean
  isKbActive: boolean
  onToggleSelect: (id: string) => void
  onTogglePin: (id: string) => void
  onOpen: (domain: string) => void
}) {
  if (viewMode === 'list') {
    return (
      <div
        className={`flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
          isKbActive ? 'border-accent bg-accent/10' : 'border-border bg-bg-darkest hover:border-border-light'
        } ${isSelected ? 'ring-1 ring-accent' : ''}`}
      >
        {selectMode && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(project.id)}
            className="h-4 w-4 rounded border-border bg-bg-darkest accent-accent"
            onClick={e => e.stopPropagation()}
          />
        )}
        <button
          onClick={() => (selectMode ? onToggleSelect(project.id) : onOpen(project.domain))}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-fg">{project.name}</p>
            <p className="truncate text-xs text-fg-dim">{project.domain}</p>
          </div>
          <div className="hidden md:block w-20 text-right">
            <span className="text-xs text-fg-dim">Health</span>
            <b className="text-base md:text-lg text-fg">{project.healthScore ?? '—'}</b>
          </div>
          <div className="hidden md:block w-16 text-right">
            <span className="text-xs text-fg-dim">Alerts</span>
            <p className="text-sm font-medium text-fg">{project.alertCount}</p>
          </div>
          <div className="hidden md:block w-16 text-right">
            <span className="text-xs text-fg-dim">Tasks</span>
            <p className="text-sm font-medium text-fg">{project.taskCount}</p>
          </div>
          <ProjectStatusBadge status={project.status} />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onTogglePin(project.id) }}
          className={`p-1 ${isPinned ? 'text-yellow-400' : 'text-fg-dim hover:text-fg'}`}
          title={isPinned ? 'Unpin' : 'Pin'}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
            <path d="M8 1l2.1 4.3 4.9.7-3.5 3.4.8 4.8L8 12l-4.3 2.2.8-4.8L1 6l4.9-.7L8 1z"/>
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div
      className={`relative rounded-2xl border p-3 md:p-4 text-left transition-colors ${
        isKbActive ? 'border-accent bg-accent/10' : 'border-border bg-bg-darkest hover:border-accent/50 hover:bg-white/[0.04]'
      } ${isSelected ? 'ring-1 ring-accent' : ''}`}
    >
      {selectMode && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(project.id)}
          className="absolute left-3 top-3 z-10 h-4 w-4 rounded border-border bg-bg-darkest accent-accent"
          onClick={e => e.stopPropagation()}
        />
      )}
      <button
        onClick={e => { e.stopPropagation(); onTogglePin(project.id) }}
        className={`absolute right-3 top-3 z-10 p-1 ${isPinned ? 'text-yellow-400' : 'text-fg-dim hover:text-fg'}`}
        title={isPinned ? 'Unpin' : 'Pin'}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
          <path d="M8 1l2.1 4.3 4.9.7-3.5 3.4.8 4.8L8 12l-4.3 2.2.8-4.8L1 6l4.9-.7L8 1z"/>
        </svg>
      </button>
      <button onClick={() => (selectMode ? onToggleSelect(project.id) : onOpen(project.domain))} className="w-full text-left">
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
          <span className="rounded-lg md:rounded-xl border border-white/10 bg-white/[0.03] p-1.5 md:p-2"><span className="block text-[10px] text-fg-dim">Health</span><b className="text-base md:text-lg text-fg">{project.healthScore ?? '\u2014'}</b></span>
          <span className="rounded-lg md:rounded-xl border border-white/10 bg-white/[0.03] p-1.5 md:p-2"><span className="block text-[10px] text-fg-dim">Alerts</span><b className="text-base md:text-lg text-fg">{project.alertCount}</b></span>
          <span className="rounded-lg md:rounded-xl border border-white/10 bg-white/[0.03] p-1.5 md:p-2"><span className="block text-[10px] text-fg-dim">Tasks</span><b className="text-base md:text-lg text-fg">{project.taskCount}</b></span>
        </div>
        <div className="mt-3 md:mt-4 flex items-center justify-between gap-2">
          <DataStateBadge state={project.dataState} fetchedAt={project.lastFetchedAt} />
          <span className="text-xs font-medium text-accent-light">{selectMode ? 'Click to select' : 'Open workspace \u2192'}</span>
        </div>
      </button>
    </div>
  )
}
