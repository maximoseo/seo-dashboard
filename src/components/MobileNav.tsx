export default function MobileNav({ activeNav, onNavChange }: { activeNav: string; onNavChange: (name: string) => void }) {
  const items = [
    { name: 'Dashboard', icon: DashboardMobileIcon },
    { name: 'Keywords', icon: KeywordsMobileIcon },
    { name: 'Backlinks', icon: BacklinksMobileIcon },
    { name: 'Pages', icon: PagesMobileIcon },
    { name: 'More', icon: MoreMobileIcon },
  ]

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-bg-sidebar border-t border-border z-40 flex items-center justify-around px-2 py-2 safe-area-pb">
      {items.map((item) => {
        const isActive = activeNav === item.name
        return (
          <button
            key={item.name}
            onClick={() => onNavChange(item.name)}
            className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
              isActive ? 'text-accent' : 'text-fg-dim'
            }`}
          >
            <item.icon active={isActive} />
            <span>{item.name}</span>
          </button>
        )
      })}
    </nav>
  )
}

function DashboardMobileIcon({ active }: { active: boolean }) {
  const color = active ? '#3B82F6' : '#6B7280'
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="2" width="6" height="6" rx="1.5" fill={color} />
      <rect x="12" y="2" width="6" height="6" rx="1.5" fill={color} />
      <rect x="2" y="12" width="6" height="6" rx="1.5" fill={color} />
      <rect x="12" y="12" width="6" height="6" rx="1.5" fill={color} />
    </svg>
  )
}

function KeywordsMobileIcon({ active }: { active: boolean }) {
  const color = active ? '#3B82F6' : '#6B7280'
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="9" cy="9" r="5.5" stroke={color} strokeWidth="1.5" />
      <path d="M13.5 13.5L17 17" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function BacklinksMobileIcon({ active }: { active: boolean }) {
  const color = active ? '#3B82F6' : '#6B7280'
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M8.5 11.5l3-3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11.5 8.5l1.5-1.5a2.5 2.5 0 00-3.5-3.5L8 5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8.5 11.5L7 13a2.5 2.5 0 003.5 3.5l1.5-1.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function PagesMobileIcon({ active }: { active: boolean }) {
  const color = active ? '#3B82F6' : '#6B7280'
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="4" y="3" width="12" height="14" rx="2" stroke={color} strokeWidth="1.5" />
      <path d="M7 7h6M7 10h6M7 13h3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function MoreMobileIcon({ active }: { active: boolean }) {
  const color = active ? '#3B82F6' : '#6B7280'
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="4" cy="10" r="1.5" fill={color} />
      <circle cx="10" cy="10" r="1.5" fill={color} />
      <circle cx="16" cy="10" r="1.5" fill={color} />
    </svg>
  )
}
