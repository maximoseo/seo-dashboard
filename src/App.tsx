import { useState } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import MobileNav from '@/components/MobileNav'
import DashboardPage from '@/pages/DashboardPage'
import KeywordsPage from '@/pages/KeywordsPage'
import BacklinksPage from '@/pages/BacklinksPage'
import PagesPage from '@/pages/PagesPage'
import VitalsPage from '@/pages/VitalsPage'
import AlertsPage from '@/pages/AlertsPage'
import CompetitorsPage from '@/pages/CompetitorsPage'
import ContentPage from '@/pages/ContentPage'
import SettingsPage from '@/pages/SettingsPage'

const navRouteMap: Record<string, string> = {
  Dashboard: '/',
  Keywords: '/keywords',
  Backlinks: '/backlinks',
  Pages: '/pages',
  Vitals: '/vitals',
  Alerts: '/alerts',
  Competitors: '/competitors',
  Content: '/content',
  Settings: '/settings',
}

const routeNavMap: Record<string, string> = Object.fromEntries(
  Object.entries(navRouteMap).map(([k, v]) => [v, k])
)

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: "Overview of your site's SEO performance" },
  '/keywords': { title: 'Keywords', subtitle: 'Track your organic keyword rankings' },
  '/backlinks': { title: 'Backlinks', subtitle: 'Analyze your backlink profile' },
  '/pages': { title: 'Pages', subtitle: 'All crawled pages and their performance' },
  '/vitals': { title: 'Vitals', subtitle: 'Core Web Vitals performance metrics' },
  '/alerts': { title: 'Alerts', subtitle: 'Notifications and alerts center' },
  '/competitors': { title: 'Competitors', subtitle: 'Side-by-side competitor analysis' },
  '/content': { title: 'Content', subtitle: 'Content optimization and gap analysis' },
  '/settings': { title: 'Settings', subtitle: 'API connections, tools status & configuration' },
}

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const activeNav = routeNavMap[location.pathname] || 'Dashboard'
  const pageInfo = pageTitles[location.pathname] || pageTitles['/']

  const handleNavChange = (name: string) => {
    const route = navRouteMap[name]
    if (route) {
      navigate(route)
      setSidebarOpen(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-bg-darkest">
      <Sidebar
        activeNav={activeNav}
        onNavChange={handleNavChange}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      <main className="flex-1 lg:ml-[232px] pb-24 lg:pb-0">
        <TopBar
          title={pageInfo.title}
          subtitle={pageInfo.subtitle}
          onMenuClick={() => setSidebarOpen(true)}
        />

        <div className="px-4 md:px-6 lg:px-8 py-5 lg:py-6">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/keywords" element={<KeywordsPage />} />
            <Route path="/backlinks" element={<BacklinksPage />} />
            <Route path="/pages" element={<PagesPage />} />
            <Route path="/vitals" element={<VitalsPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/competitors" element={<CompetitorsPage />} />
            <Route path="/content" element={<ContentPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </main>

      <MobileNav activeNav={activeNav} onNavChange={handleNavChange} />
    </div>
  )
}
