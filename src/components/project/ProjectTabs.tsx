import { Link, useLocation } from 'react-router-dom'
import DataStateBadge from '@/components/DataStateBadge'
import { useProject } from '@/contexts/ProjectContext'

export default function ProjectTabs() {
  const { activeProject } = useProject()
  const location = useLocation()
  if (!activeProject) return null

  return (
    <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Project modules">
      {activeProject.modules.map(module => {
        const isActive = module.slug === 'overview'
          ? location.pathname === module.href
          : location.pathname === module.href || location.pathname.endsWith(`/${module.slug}`)
        return (
          <Link
            key={module.slug}
            to={module.href}
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${isActive ? 'border-accent bg-accent/10 text-accent-light' : 'border-border bg-bg-card text-fg-muted hover:border-border-light hover:text-fg'}`}
          >
            {module.label}
            <DataStateBadge state={module.state} className="hidden sm:inline-flex" />
          </Link>
        )
      })}
    </nav>
  )
}
