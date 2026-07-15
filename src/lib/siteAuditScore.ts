/**
 * Null-safe Site Audit health score.
 * Returns null when there is insufficient crawl / score data so the UI
 * can show "—" instead of inventing a perfect 100.
 */
export type SiteAuditScoreInput = {
  pagesCrawled?: number | null
  errors?: number | null
  warnings?: number | null
  notices?: number | null
  onpageScore?: number | null
  lighthouseSeo?: number | null
}

export function computeSiteAuditHealthScore(input: SiteAuditScoreInput): number | null {
  const pages = Number(input.pagesCrawled ?? 0) || 0
  const onpage = input.onpageScore == null ? null : Number(input.onpageScore)
  const lighthouse = input.lighthouseSeo == null ? null : Number(input.lighthouseSeo)

  const hasSignal =
    pages > 0 ||
    (onpage != null && !Number.isNaN(onpage)) ||
    (lighthouse != null && !Number.isNaN(lighthouse))

  if (!hasSignal) return null

  const errors = Math.max(0, Number(input.errors ?? 0) || 0)
  const warnings = Math.max(0, Number(input.warnings ?? 0) || 0)
  const notices = Math.max(0, Number(input.notices ?? 0) || 0)

  let score = 100
  score -= 8 * Math.min(errors, 10)
  score -= 3 * Math.min(warnings, 15)
  score -= 1 * Math.min(notices, 20)
  if (onpage != null && !Number.isNaN(onpage)) score += 0.15 * onpage
  if (lighthouse != null && !Number.isNaN(lighthouse)) score += 0.1 * lighthouse

  return Math.max(0, Math.min(100, Math.round(score)))
}

export function healthScoreTone(score: number | null): string {
  if (score == null) return 'text-fg-dim'
  if (score >= 80) return 'text-green'
  if (score >= 60) return 'text-amber-300'
  return 'text-red-300'
}
