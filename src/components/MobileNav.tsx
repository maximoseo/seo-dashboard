import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const mainItems = [
  { name: 'Clients', icon: CompetitorsMobileIcon },
  { name: 'Keywords', icon: KeywordsMobileIcon },
  { name: 'Backlinks', icon: BacklinksMobileIcon },
  { name: 'Vitals', icon: VitalsMobileIcon },
  { name: 'More', icon: MoreMobileIcon },
]

const moreItems = [
  { name: 'Command Center', icon: VitalsMobileIcon },
  { name: 'Pages', icon: PagesMobileIcon },
  { name: 'Site Audit', icon: PagesMobileIcon },
  { name: 'Content', icon: ContentMobileIcon },
  { name: 'Competitors', icon: CompetitorsMobileIcon },
  { name: 'Local SEO', icon: PagesMobileIcon },
  { name: 'GEO / AI', icon: ContentMobileIcon },
  { name: 'Tasks', icon: AlertsMobileIcon },
  { name: 'Reports', icon: PagesMobileIcon },
  { name: 'Settings', icon: SettingsMobileIcon },
]

export default function MobileNav({ activeNav, onNavChange }: { activeNav: string; onNavChange: (name: string) => void }) {
  const [showMore, setShowMore] = useState(false)

  const isMoreActive = moreItems.some(i => i.name === activeNav)

  const handleItemClick = (name: string) => {
    if (name === 'More') {
      setShowMore(!showMore)
    } else {
      onNavChange(name)
      setShowMore(false)
    }
  }

  return (
    <>
      {/* More items sheet */}
      <AnimatePresence>
        {showMore && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-40 backdrop-overlay"
              onClick={() => setShowMore(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="lg:hidden fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] left-3 right-3 z-50 bg-bg-sidebar border border-border-light rounded-2xl p-2 shadow-2xl"
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-[55vh] overflow-y-auto">
                {moreItems.map((item) => {
                  const isActive = activeNav === item.name
                  return (
                    <button
                      key={item.name}
                      onClick={() => handleItemClick(item.name)}
                      className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl text-[11px] font-medium transition-colors touch-target-reset ${
                        isActive ? 'text-accent bg-accent/10' : 'text-fg-dim hover:text-fg-muted'
                      }`}
                    >
                      <item.icon active={isActive} />
                      <span>{item.name}</span>
                    </button>
                  )
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom nav bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-bg-sidebar/95 backdrop-blur-xl border-t border-border z-40 safe-area-pb">
        <div className="flex items-center justify-around px-1 py-1.5">
          {mainItems.map((item) => {
            const isActive = item.name === 'More' ? (isMoreActive || showMore) : activeNav === item.name
            return (
              <button
                key={item.name}
                onClick={() => handleItemClick(item.name)}
                className={`relative flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl text-[10px] font-medium transition-all touch-target-reset ${
                  isActive ? 'text-accent' : 'text-fg-dim'
                }`}
              >
                {isActive && item.name !== 'More' && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute -top-1.5 w-5 h-0.5 bg-accent rounded-full"
                    transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                  />
                )}
                <item.icon active={isActive} />
                <span className="mt-0.5">{item.name}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}


function KeywordsMobileIcon({ active }: { active: boolean }) {
  const color = active ? '#3B82F6' : '#64748B'
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="10" cy="10" r="6" stroke={color} strokeWidth="1.8" />
      <path d="M14.5 14.5L19 19" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function BacklinksMobileIcon({ active }: { active: boolean }) {
  const color = active ? '#3B82F6' : '#64748B'
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M9.5 12.5l3-3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12.5 9.5l1.5-1.5a3 3 0 00-4.25-4.25L8.25 5.25" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9.5 12.5L8 14a3 3 0 004.25 4.25l1.5-1.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function VitalsMobileIcon({ active }: { active: boolean }) {
  const color = active ? '#3B82F6' : '#64748B'
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M1 11h4l2.5-6 3.5 12 2.5-6H20" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MoreMobileIcon({ active }: { active: boolean }) {
  const color = active ? '#3B82F6' : '#64748B'
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="5" cy="11" r="2" fill={color} />
      <circle cx="11" cy="11" r="2" fill={color} />
      <circle cx="17" cy="11" r="2" fill={color} />
    </svg>
  )
}

function PagesMobileIcon({ active }: { active: boolean }) {
  const color = active ? '#3B82F6' : '#64748B'
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <rect x="4" y="3" width="14" height="16" rx="2" stroke={color} strokeWidth="1.8" />
      <path d="M8 8h6M8 11h6M8 14h3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function AlertsMobileIcon({ active }: { active: boolean }) {
  const color = active ? '#3B82F6' : '#64748B'
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M11 3L3 17h16L11 3z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M11 9v3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="11" cy="14.5" r="0.8" fill={color} />
    </svg>
  )
}

function CompetitorsMobileIcon({ active }: { active: boolean }) {
  const color = active ? '#3B82F6' : '#64748B'
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="7.5" cy="11" r="5" stroke={color} strokeWidth="1.8" />
      <circle cx="14.5" cy="11" r="5" stroke={color} strokeWidth="1.8" />
    </svg>
  )
}

function ContentMobileIcon({ active }: { active: boolean }) {
  const color = active ? '#3B82F6' : '#64748B'
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M4 5h14M4 9h10M4 13h12M4 17h7" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function SettingsMobileIcon({ active }: { active: boolean }) {
  const color = active ? '#3B82F6' : '#64748B'
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="11" r="3" stroke={color} strokeWidth="1.8" />
      <path d="M11 2v2.5M11 17.5V20M2 11h2.5M17.5 11H20M4.93 4.93l1.77 1.77M15.3 15.3l1.77 1.77M4.93 17.07l1.77-1.77M15.3 6.7l1.77-1.77" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
