import { useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useProject } from '@/contexts/ProjectContext'
import { buildProjectPath } from '@/lib/projectRoutes'

export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  const location = useLocation()
  const { activeDomain } = useProject()

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger when typing in inputs
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return

    // / — focus search
    if (e.key === '/') {
      e.preventDefault()
      const searchInput = document.querySelector<HTMLInputElement>('input[placeholder*="Search"], input[placeholder*="search"]')
      searchInput?.focus()
      return
    }

    // Escape — close modals/overlays, blur inputs
    if (e.key === 'Escape') {
      const activeEl = document.activeElement as HTMLElement
      if (activeEl?.tagName === 'INPUT') {
        activeEl.blur()
        return
      }
      // Close any open dropdowns by clicking outside
      document.body.click()
      return
    }

    // Navigation shortcuts (only with active project)
    if (activeDomain && !e.metaKey && !e.ctrlKey) {
      const moduleMap: Record<string, string> = {
        'k': 'keywords',
        'b': 'backlinks',
        'p': 'pages',
        'v': 'vitals',
        'a': 'alerts',
        'c': 'competitors',
        't': 'tasks',
        'r': 'reports',
        's': 'settings',
      }

      const module = moduleMap[e.key.toLowerCase()]
      if (module) {
        e.preventDefault()
        navigate(buildProjectPath(activeDomain, module as any))
        return
      }

      // g then p — go to projects
      if (e.key === 'g') {
        const handler = (e2: KeyboardEvent) => {
          if (e2.key === 'p') {
            e2.preventDefault()
            navigate('/projects')
          }
          document.removeEventListener('keydown', handler)
        }
        document.addEventListener('keydown', handler)
        setTimeout(() => document.removeEventListener('keydown', handler), 1000)
        return
      }
    }
  }, [navigate, location, activeDomain])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
