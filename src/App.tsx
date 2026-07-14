import { lazy, Suspense, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import MobileNav from '@/components/MobileNav'
import ErrorBoundary from '@/components/ErrorBoundary'
import LoginPage from '@/pages/LoginPage'
import { AhrefsProvider } from '@/contexts/AhrefsContext'
import { SEOProvider } from '@/contexts/SEOContext'
import { ProjectProvider, useProject } from '@/contexts/ProjectContext'
import { useAuth } from '@/contexts/AuthContext'
import { buildProjectPath, getModuleFromPathname, legacyRouteToProjectModule, type ProjectModule } from '@/lib/projectRoutes'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

const ClientsPage = lazy(() => import('@/pages/ClientsPage'))
const ProjectsIndexPage = lazy(() => import('@/pages/ProjectsIndexPage'))
const CommandCenterPage = lazy(() => import('@/pages/CommandCenterPage'))
const ProjectWorkspacePage = lazy(() => import('@/pages/project/ProjectWorkspacePage'))
const ProjectOverviewPage = lazy(() => import('@/pages/project/ProjectOverviewPage'))
const ProjectSettingsPage = lazy(() => import('@/pages/project/ProjectSettingsPage'))
const KeywordsPage = lazy(() => import('@/pages/KeywordsPage'))
const BacklinksPage = lazy(() => import('@/pages/BacklinksPage'))
const PagesPage = lazy(() => import('@/pages/PagesPage'))
const SiteAuditPage = lazy(() => import('@/pages/SiteAuditPage'))
const VitalsPage = lazy(() => import('@/pages/VitalsPage'))
const AlertsPage = lazy(() => import('@/pages/AlertsPage'))
const CompetitorsPage = lazy(() => import('@/pages/CompetitorsPage'))
const ContentPage = lazy(() => import('@/pages/ContentPage'))
const LocalSEOPage = lazy(() => import('@/pages/LocalSEOPage'))
const GeoAIPage = lazy(() => import('@/pages/GeoAIPage'))
const TasksPage = lazy(() => import('@/pages/TasksPage'))
const ReportsPage = lazy(() => import('@/pages/ReportsPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))

const navRouteMap: Record<string, string> = {
  Clients: '/projects',
  'Command Center': '/command-center',
  Keywords: '/keywords',
  Backlinks: '/backlinks',
  Pages: '/pages',
  'Site Audit': '/site-audit',
  Vitals: '/vitals',
  Alerts: '/alerts',
  Competitors: '/competitors',
  Content: '/content',
  'Local SEO': '/local-seo',
  'GEO / AI': '/geo-ai',
  Tasks: '/tasks',
  Reports: '/reports',
  Settings: '/settings',
}

const routeNavMap: Record<string, string> = Object.fromEntries(
  Object.entries(navRouteMap).map(([k, v]) => [v, k]),
)

const moduleNavMap: Record<ProjectModule, string> = {
  keywords: 'Keywords',
  backlinks: 'Backlinks',
  pages: 'Pages',
  'site-audit': 'Site Audit',
  vitals: 'Vitals',
  alerts: 'Alerts',
  competitors: 'Competitors',
  content: 'Content',
  'local-seo': 'Local SEO',
  'geo-ai': 'GEO / AI',
  tasks: 'Tasks',
  reports: 'Reports',
  settings: 'Settings',
}

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Projects / Sites', subtitle: 'Choose a site and open its full SEO workspace' },
  '/clients': { title: 'Clients / Domains', subtitle: 'Portfolio domain selector and monitoring status' },
  '/projects': { title: 'Projects / Sites', subtitle: 'Choose a site and open its full SEO workspace' },
  '/command-center': { title: 'Command Center', subtitle: 'Portfolio KPIs, stale spine and operator sync' },
  '/keywords': { title: 'Keywords', subtitle: 'Track organic keyword rankings and opportunities' },
  '/backlinks': { title: 'Backlinks', subtitle: 'Analyze authority, risk, anchors and lost links' },
  '/pages': { title: 'Pages', subtitle: 'Technical SEO crawl inventory and page priorities' },
  '/site-audit': { title: 'Site Audit', subtitle: 'Technical SEO checks, on-page issues and crawl findings' },
  '/vitals': { title: 'Vitals', subtitle: 'Core Web Vitals and Lighthouse performance metrics' },
  '/alerts': { title: 'Alerts', subtitle: 'SEO risks, anomalies and operator workflow' },
  '/competitors': { title: 'Competitors', subtitle: 'Competitor discovery, gaps and change feed' },
  '/content': { title: 'Content', subtitle: 'Content inventory, decay, briefs and gaps' },
  '/local-seo': { title: 'Local SEO', subtitle: 'GBP, local rank grids and citation checks' },
  '/geo-ai': { title: 'GEO / AI Search', subtitle: 'Generative search visibility and entity readiness' },
  '/tasks': { title: 'Tasks / Agents', subtitle: 'SEO operator queue and implementation handoff' },
  '/reports': { title: 'Reports', subtitle: 'Client-ready reporting and shareable deliverables' },
  '/settings': { title: 'Settings', subtitle: 'API connections, tools status and configuration' },
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-bg-darkest text-fg flex items-center justify-center">
      <div className="rounded-2xl border border-border bg-bg-card px-6 py-5 shadow-2xl">
        <div className="h-2 w-48 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-accent" />
        </div>
        <p className="mt-3 text-sm text-fg-muted">Checking dashboard session…</p>
      </div>
    </div>
  )
}

function getActiveNav(pathname: string): string {
  if (pathname === '/projects' || pathname === '/clients') return 'Clients'
  if (pathname === '/command-center') return 'Command Center'
  if (pathname.startsWith('/projects/')) {
    const module = getModuleFromPathname(pathname)
    return module ? moduleNavMap[module] : 'Dashboard'
  }
  return routeNavMap[pathname] || 'Dashboard'
}

function DashboardShellInner() {
  const navigate = useNavigate()
  const location = useLocation()
  const { activeDomain, activeProject } = useProject()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const activeNav = getActiveNav(location.pathname)
  useKeyboardShortcuts()

  const projectModule = getModuleFromPathname(location.pathname)
  const legacyModule = legacyRouteToProjectModule(location.pathname)
  const module = projectModule || legacyModule
  const pageInfo = location.pathname === '/projects'
    ? pageTitles['/projects']
    : location.pathname.startsWith('/projects/')
      ? module
        ? { ...pageTitles[`/${module}`], title: pageTitles[`/${module}`].title, subtitle: `${activeProject?.name || activeDomain} • ${activeDomain}` }
        : { title: activeProject?.name || 'Project Workspace', subtitle: `${activeDomain} workspace overview and next actions` }
      : pageTitles[location.pathname] || pageTitles['/']

  const handleNavChange = (name: string) => {
    const route = navRouteMap[name]
    if (!route) return

    if (name === 'Clients') {
      navigate('/projects')
      setSidebarOpen(false)
      return
    }

    if (name === 'Command Center') {
      navigate('/command-center')
      setSidebarOpen(false)
      return
    }

    if (activeDomain) {
      if (name === 'Dashboard') {
        navigate(buildProjectPath(activeDomain))
        setSidebarOpen(false)
        return
      }
      const moduleRoute = legacyRouteToProjectModule(route)
      if (moduleRoute) {
        navigate(buildProjectPath(activeDomain, moduleRoute))
        setSidebarOpen(false)
        return
      }
    }

    navigate(route)
    setSidebarOpen(false)
  }

  return (
    <div className="flex min-h-screen bg-bg-darkest">
      <Sidebar
        activeNav={activeNav}
        onNavChange={handleNavChange}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      <main className="flex-1 lg:ml-[232px] pb-24 lg:pb-0 overflow-x-hidden">
        <TopBar
          title={pageInfo.title}
          subtitle={pageInfo.subtitle}
          onMenuClick={() => setSidebarOpen(true)}
        />

        <div className="px-4 md:px-6 lg:px-8 py-5 lg:py-6">
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<div className="rounded-xl border border-border bg-bg-card p-6 text-sm text-fg-muted">Loading module…</div>}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                >
              <Routes>
                <Route path="/" element={<Navigate to="/projects" replace />} />
                <Route path="/clients" element={<ClientsPage />} />
                <Route path="/projects" element={<ProjectsIndexPage />} />
                <Route path="/command-center" element={<CommandCenterPage />} />
                <Route path="/projects/:domain" element={<ProjectWorkspacePage />}>
                  <Route index element={<ProjectOverviewPage />} />
                  <Route path="keywords" element={<KeywordsPage />} />
                  <Route path="backlinks" element={<BacklinksPage />} />
                  <Route path="pages" element={<PagesPage />} />
                  <Route path="site-audit" element={<SiteAuditPage />} />
                  <Route path="vitals" element={<VitalsPage />} />
                  <Route path="alerts" element={<AlertsPage />} />
                  <Route path="competitors" element={<CompetitorsPage />} />
                  <Route path="content" element={<ContentPage />} />
                  <Route path="local-seo" element={<LocalSEOPage />} />
                  <Route path="geo-ai" element={<GeoAIPage />} />
                  <Route path="tasks" element={<TasksPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="settings" element={<ProjectSettingsPage />} />
                </Route>
                <Route path="/keywords" element={<KeywordsPage />} />
                <Route path="/backlinks" element={<BacklinksPage />} />
                <Route path="/pages" element={<PagesPage />} />
                <Route path="/site-audit" element={<SiteAuditPage />} />
                <Route path="/vitals" element={<VitalsPage />} />
                <Route path="/alerts" element={<AlertsPage />} />
                <Route path="/competitors" element={<CompetitorsPage />} />
                <Route path="/content" element={<ContentPage />} />
                <Route path="/local-seo" element={<LocalSEOPage />} />
                <Route path="/geo-ai" element={<GeoAIPage />} />
                <Route path="/tasks" element={<TasksPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/projects" replace />} />
              </Routes>
                </motion.div>
              </AnimatePresence>
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      <MobileNav activeNav={activeNav} onNavChange={handleNavChange} />
    </div>
  )
}

function DashboardShell() {
  return (
    <ProjectProvider>
      <SEOProvider>
        <AhrefsProvider>
          <DashboardShellInner />
        </AhrefsProvider>
      </SEOProvider>
    </ProjectProvider>
  )
}

export default function App() {
  const location = useLocation()
  const { isAuthenticated, loading } = useAuth()

  if (loading) return <LoadingScreen />

  if (location.pathname === '/login') {
    return <LoginPage />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <DashboardShell />
}
