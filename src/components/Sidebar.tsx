import { useSEO } from '@/contexts/SEOContext'

const navItems = [
  { name: 'Dashboard', icon: DashboardIcon },
  { name: 'Keywords', icon: KeywordsIcon },
  { name: 'Backlinks', icon: BacklinksIcon },
  { name: 'Pages', icon: PagesIcon },
  { name: 'Vitals', icon: VitalsIcon },
  { name: 'Alerts', icon: AlertsIcon, badge: 3 },
  { name: 'Competitors', icon: CompetitorsIcon },
  { name: 'Content', icon: ContentIcon },
  { name: 'Settings', icon: SettingsIcon },
]

interface SidebarProps {
  activeNav: string
  onNavChange: (name: string) => void
}

export default function Sidebar({ activeNav, onNavChange }: SidebarProps) {
  const { domain } = useSEO()

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-[220px] bg-bg-sidebar border-r border-border flex-col z-30">
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-2.5">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="2" y="16" width="5" height="10" rx="1.5" fill="#3B82F6" />
          <rect x="11" y="10" width="5" height="16" rx="1.5" fill="#3B82F6" />
          <rect x="20" y="4" width="5" height="22" rx="1.5" fill="#60A5FA" />
        </svg>
        <span className="text-lg font-bold tracking-tight">
          <span className="text-fg">SEO</span>
          <span className="text-accent">Pro</span>
        </span>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 px-3 mt-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activeNav === item.name
          return (
            <button
              key={item.name}
              onClick={() => onNavChange(item.name)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 relative ${
                isActive
                  ? 'bg-accent/15 text-accent-light'
                  : 'text-fg-muted hover:text-fg hover:bg-white/[0.04]'
              }`}
            >
              <item.icon active={isActive} />
              <span>{item.name}</span>
              {item.badge && (
                <span className="ml-auto bg-accent text-white text-[11px] font-semibold w-5 h-5 rounded-full flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Project Selector */}
      <div className="px-3 mb-3">
        <button className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border hover:border-border-light transition-colors text-sm">
          <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" stroke="#60A5FA" strokeWidth="1.5" />
              <circle cx="7" cy="7" r="2" fill="#60A5FA" />
            </svg>
          </div>
          <span className="text-fg-muted truncate flex-1 text-left">{domain}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-fg-dim shrink-0">
            <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Plan Info */}
      <div className="px-5 py-3 border-t border-border">
        <p className="text-xs font-medium text-fg">Pro Plan</p>
        <p className="text-[11px] text-fg-dim mt-0.5">8 APIs Connected</p>
      </div>

      {/* User Profile */}
      <div className="px-3 pb-4">
        <button className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors">
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-sm font-semibold">
            M
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-medium text-fg truncate">Maximo SEO</p>
            <p className="text-[11px] text-fg-dim truncate">maximo-seo.ai</p>
          </div>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-fg-dim shrink-0">
            <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </aside>
  )
}

function DashboardIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="1" y="1" width="6.5" height="6.5" rx="1.5" fill={active ? '#60A5FA' : 'currentColor'} opacity={active ? 1 : 0.5} />
      <rect x="10.5" y="1" width="6.5" height="6.5" rx="1.5" fill={active ? '#60A5FA' : 'currentColor'} opacity={active ? 1 : 0.5} />
      <rect x="1" y="10.5" width="6.5" height="6.5" rx="1.5" fill={active ? '#60A5FA' : 'currentColor'} opacity={active ? 1 : 0.5} />
      <rect x="10.5" y="10.5" width="6.5" height="6.5" rx="1.5" fill={active ? '#60A5FA' : 'currentColor'} opacity={active ? 1 : 0.5} />
    </svg>
  )
}

function KeywordsIcon({ active }: { active: boolean }) {
  const color = active ? '#60A5FA' : 'currentColor'
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke={color} strokeWidth="1.5" />
      <path d="M12.5 12.5L16 16" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function BacklinksIcon({ active }: { active: boolean }) {
  const color = active ? '#60A5FA' : 'currentColor'
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M7.5 10.5l3-3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10.5 7.5l1.5-1.5a2.5 2.5 0 00-3.5-3.5L7 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7.5 10.5L6 12a2.5 2.5 0 003.5 3.5l1.5-1.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function PagesIcon({ active }: { active: boolean }) {
  const color = active ? '#60A5FA' : 'currentColor'
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="3" y="2" width="12" height="14" rx="2" stroke={color} strokeWidth="1.5" />
      <path d="M6 6h6M6 9h6M6 12h3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function VitalsIcon({ active }: { active: boolean }) {
  const color = active ? '#60A5FA' : 'currentColor'
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M1 9h3l2-5 3 10 2-5h6" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function AlertsIcon({ active }: { active: boolean }) {
  const color = active ? '#60A5FA' : 'currentColor'
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2L2 14h14L9 2z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" fill="none" />
      <path d="M9 7v3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9" cy="12" r="0.5" fill={color} />
    </svg>
  )
}

function CompetitorsIcon({ active }: { active: boolean }) {
  const color = active ? '#60A5FA' : 'currentColor'
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="6" cy="9" r="4" stroke={color} strokeWidth="1.5" />
      <circle cx="12" cy="9" r="4" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}

function ContentIcon({ active }: { active: boolean }) {
  const color = active ? '#60A5FA' : 'currentColor'
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 4h12M3 8h8M3 12h10M3 16h6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function SettingsIcon({ active }: { active: boolean }) {
  const color = active ? '#60A5FA' : 'currentColor'
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="2.5" stroke={color} strokeWidth="1.5" />
      <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.22 3.22l1.41 1.41M13.37 13.37l1.41 1.41M3.22 14.78l1.41-1.41M13.37 4.63l1.41-1.41" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
