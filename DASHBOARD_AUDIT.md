# SEO Dashboard — Comprehensive Audit & Improvement Plan

**Date:** 2026-07-08  
**Live URL:** https://seo-dashboard.maximo-seo.ai  
**Repo:** maximoseo/seo-dashboard  

---

## ✅ What's Working Well

| Area | Status |
|------|--------|
| Project listing with screenshots, search, filters | ✅ Solid |
| Auth system (login, JWT, session) | ✅ Working |
| Supabase backend with proper schema | ✅ Working |
| Multi-source data normalization (Ahrefs, Semrush, DataForSEO, SE Ranking) | ✅ Working |
| Responsive sidebar + mobile bottom nav | ✅ Working |
| Project workspace with 12 module pages | ✅ Working |
| Dark theme with consistent design tokens | ✅ Clean |
| Mobile card views (Keywords, Alerts) | ✅ Good UX |

---

## 🔴 Critical Fixes (Do First)

### 1. iOS Input Zoom Bug
**Problem:** Users on iOS Safari get zoomed in when tapping input fields (search, filters).  
**Fix:** Add `maximum-scale=1.0` to viewport meta tag.  
**Status:** ✅ Fixed in this commit.

### 2. Mobile Scroll Position Loss
**Problem:** Opening/closing the mobile sidebar resets scroll to top.  
**Fix:** Save `window.scrollY` before lock, restore after unlock.  
**Status:** ✅ Fixed in this commit.

### 3. Alerts Page Uses Hardcoded Mock Data
**Problem:** `AlertsPage.tsx` has 8 hardcoded alerts that never change. The API endpoint `/api/alerts/aggregated` exists but the page doesn't use it.  
**Fix:** Replace `initialAlerts` with API fetch using `useQuery`, keep fallback only for empty state.  
**Effort:** Medium (2-3 hours)

### 4. Competitors Page Uses Hardcoded Mock Data
**Problem:** `CompetitorsPage.tsx` has hardcoded competitor entries.  
**Fix:** Wire to `/api/competitors` endpoint.  
**Effort:** Medium (2-3 hours)

### 5. Content Page Uses Hardcoded Mock Data
**Problem:** `ContentPage.tsx` has hardcoded content inventory.  
**Fix:** Wire to `/api/content` endpoint.  
**Effort:** Medium (2-3 hours)

---

## 🟡 Important Improvements (Do Next)

### 6. Project Creation UI
**Problem:** No way to add new projects from the dashboard. Users must insert directly into Supabase.  
**Fix:** Add a "New Project" button on ProjectsIndexPage with a modal form (name, domain, client, market). Write to `seo_projects` table via API.  
**Effort:** Medium (3-4 hours)

### 7. Real-Time Data Refresh
**Problem:** Data goes stale. No auto-refresh or background sync indicator.  
**Fix:**  
- Add a "Last synced X minutes ago" indicator in TopBar  
- Add auto-refresh every 15 min for active project  
- Add manual "Sync Now" button per module  
**Effort:** Medium (4-5 hours)

### 8. Dashboard Page Is Empty
**Problem:** `DashboardPage.tsx` exists but the default route redirects to `/projects`. The Dashboard nav item still exists in sidebar but goes nowhere useful.  
**Fix:** Either remove Dashboard from nav, or make it a proper overview page showing: total projects, aggregate health score, top alerts, recent activity feed.  
**Effort:** Medium (3-4 hours)

### 9. Error Handling Inconsistency
**Problem:** Some pages show nice error cards, others silently fail or show raw error text.  
**Fix:** Create a unified `<ErrorCard>` component and use it everywhere. Add retry buttons consistently.  
**Effort:** Small (1-2 hours)

### 10. Loading States Inconsistency
**Problem:** Some pages show skeleton loaders, others show "Loading module…" text, some show nothing.  
**Fix:** Standardize on `<LoadingSkeleton>` component with consistent line counts per page type.  
**Effort:** Small (1-2 hours)

---

## 🟢 Nice-to-Have Enhancements

### 11. Pull-to-Refresh on Mobile
**Problem:** No pull-to-refresh gesture support.  
**Fix:** Add a simple pull-to-refresh component that triggers `refetch()` on the active query.  
**Effort:** Medium (3-4 hours)

### 12. Keyboard Shortcuts
**Problem:** No keyboard navigation for power users.  
**Fix:** Add shortcuts: `/` to focus search, `←`/`→` for pagination, `Esc` to close modals.  
**Effort:** Small (2 hours)

### 13. Data Export
**Problem:** No way to export keyword lists, backlink data, or alerts to CSV.  
**Fix:** Add "Export CSV" button per data table. Use `Blob` + `URL.createObjectURL` pattern.  
**Effort:** Small (2-3 hours per page)

### 14. Chart Tooltips on Mobile
**Problem:** Recharts tooltips are hard to tap on mobile.  
**Fix:** Increase tooltip touch area, add active dot indicator.  
**Effort:** Small (1-2 hours)

### 15. Project Deletion/Archiving
**Problem:** No way to remove projects from the dashboard.  
**Fix:** Add archive/delete action in ProjectSettingsPage with confirmation modal.  
**Effort:** Small (2 hours)

### 16. Client Management
**Problem:** `ClientsPage` just re-exports `ProjectsIndexPage`. No actual client CRUD.  
**Fix:** Build a proper clients page with: add client, assign domains, view per-client portfolio.  
**Effort:** Large (5-8 hours)

### 17. Notifications/Alerts System
**Problem:** No push notifications or email alerts for critical SEO issues.  
**Fix:** Add webhook-based alerts (Slack, email) triggered by critical alert severity.  
**Effort:** Large (5-8 hours)

### 18. Multi-User Support
**Problem:** Single-user auth only. No team collaboration.  
**Fix:** Add role-based access (admin, viewer), invite system, activity log.  
**Effort:** Large (8-12 hours)

---

## 🔧 Technical Debt

### 19. Remove Legacy Route Paths
**Problem:** App.tsx still has legacy `/keywords`, `/backlinks`, etc. routes alongside project-scoped routes.  
**Fix:** Remove legacy routes, update all sidebar navigation to use project-scoped paths only.  
**Effort:** Small (1-2 hours)

### 20. Type Safety for API Responses
**Problem:** Many API responses typed as `any`.  
**Fix:** Create proper TypeScript interfaces for all API responses.  
**Effort:** Medium (3-4 hours)

### 21. Component Extraction
**Problem:** Some pages (KeywordsPage, BacklinksPage) are 300+ lines with inline table rendering.  
**Fix:** Extract `<KeywordTable>`, `<BacklinkTable>`, `<FilterBar>` components.  
**Effort:** Medium (3-4 hours)

### 22. Testing
**Problem:** No tests. `vitest.config.ts` exists but no test files.  
**Fix:** Add unit tests for normalization functions, component smoke tests, API mock tests.  
**Effort:** Large (8-12 hours)

### 23. Performance: Code Splitting
**Problem:** All pages are lazy-loaded (good), but `CartesianChart` (Recharts) is 318KB.  
**Fix:** Consider lighter charting library (e.g., uPlot, lightweight-charts) for simple sparklines/bar charts.  
**Effort:** Medium (4-6 hours)

### 24. PWA Support
**Problem:** `manifest.json` exists but no service worker.  
**Fix:** Add service worker for offline support and "Add to Home Screen" on mobile.  
**Effort:** Medium (3-4 hours)

---

## 📱 Mobile-Specific Issues (Beyond Scrolling)

### 25. Bottom Nav Covers Content
**Problem:** The fixed bottom nav (`pb-24`) is a rough estimate. Some pages' pagination buttons may be hidden.  
**Fix:** Use `env(safe-area-inset-bottom)` consistently and test on real devices.  
**Status:** Partially addressed in this commit.

### 26. Table Horizontal Scroll Indicators
**Problem:** On mobile, tables scroll horizontally but there's no visual hint that more content exists.  
**Fix:** Add a fade/gradient overlay on the right edge of scrollable tables.  
**Effort:** Small (1-2 hours)

### 27. Touch Target Consistency
**Problem:** Some interactive elements are too small on mobile despite the `min-height: 44px` rule.  
**Fix:** Audit all buttons/links, ensure `.touch-target-reset` is only used where truly needed.  
**Effort:** Small (1-2 hours)

### 28. Mobile Filter UX
**Problem:** Filter dropdowns on Keywords/Backlinks pages are cramped on small screens.  
**Fix:** Use a bottom sheet pattern for filters on mobile instead of inline selects.  
**Effort:** Medium (2-3 hours)

---

## 🎨 Design & UX Polish

### 29. Empty States
**Problem:** Some empty states are generic ("No data found").  
**Fix:** Add contextual empty states with illustrations and action CTAs (e.g., "Connect your first data source").  
**Effort:** Medium (3-4 hours)

### 30. Dark Mode Toggle
**Problem:** Dark mode only. Some users prefer light.  
**Fix:** Add theme toggle in Settings, persist preference.  
**Effort:** Medium (4-6 hours)

### 31. Breadcrumb Navigation
**Problem:** Only ProjectHeader shows breadcrumbs. Other pages don't.  
**Fix:** Add consistent breadcrumb in TopBar for all pages.  
**Effort:** Small (1-2 hours)

### 32. Page Transitions
**Problem:** Route changes are instant with no transition.  
**Fix:** Add subtle fade/slide transitions between pages using Framer Motion.  
**Effort:** Small (1-2 hours)

---

## 📊 Priority Matrix

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | iOS zoom fix (#1) | S | High |
| P0 | Scroll position fix (#2) | S | High |
| P0 | Wire Alerts to API (#3) | M | High |
| P1 | Project creation UI (#6) | M | High |
| P1 | Real-time refresh (#7) | M | High |
| P1 | Fix empty Dashboard (#8) | M | Medium |
| P1 | Error handling standardization (#9) | S | Medium |
| P2 | CSV export (#13) | S | Medium |
| P2 | Remove legacy routes (#19) | S | Low |
| P2 | Pull-to-refresh (#11) | M | Medium |
| P3 | Client management (#16) | L | High |
| P3 | Notifications (#17) | L | High |
| P3 | Testing (#22) | L | High |
| P3 | PWA support (#24) | M | Medium |

**Legend:** S = Small (1-2h), M = Medium (3-6h), L = Large (8h+)

---

## 🚀 Recommended Sprint Order

### Sprint 1 (This Week) — Quick Wins
- [x] Fix mobile scrolling (#1, #2, #25)
- [ ] Wire Alerts page to API (#3)
- [ ] Standardize error handling (#9)
- [ ] Standardize loading states (#10)
- [ ] Remove legacy routes (#19)

### Sprint 2 (Next Week) — Core Features
- [ ] Project creation UI (#6)
- [ ] Fix Dashboard overview page (#8)
- [ ] Wire Competitors to API (#4)
- [ ] Wire Content to API (#5)
- [ ] CSV export for tables (#13)

### Sprint 3 (Week After) — Polish
- [ ] Real-time data refresh (#7)
- [ ] Pull-to-refresh (#11)
- [ ] Mobile filter UX (#28)
- [ ] Table scroll indicators (#26)
- [ ] Keyboard shortcuts (#12)

### Sprint 4+ — Major Features
- [ ] Client management (#16)
- [ ] Notifications system (#17)
- [ ] Testing (#22)
- [ ] PWA support (#24)
- [ ] Multi-user support (#18)
