import type { KeywordRow } from '../providers/adapters.js'

export type AnomalySeverity = 'info' | 'warning' | 'critical'

export interface MetricPoint {
  date: string | null
  value: number
}

export interface MetricAnomaly {
  kind: 'metric'
  metric: string
  label: string
  current: number
  baseline: number
  deltaPct: number
  zScore: number | null
  direction: 'drop' | 'spike'
  severity: AnomalySeverity
  points: number
  evidence: { latest: MetricPoint; baselineMedian: number; mad: number }
}

export interface KeywordDropAnomaly {
  kind: 'keyword-drop'
  keyword: string
  fromPosition: number | null
  toPosition: number | null
  drop: number
  volume: number | null
  outOf: 'top3' | 'top10' | null
  severity: AnomalySeverity
  evidence: { baselineDate: string | null; latestDate: string | null; baselinePos: number | null }
}

export interface AnomalyReport {
  metricAnomalies: MetricAnomaly[]
  keywordDrops: KeywordDropAnomaly[]
  keywordsGained: KeywordDropAnomaly[]
  keywordsCompared: number
  snapshotsUsed: number
  note: string
}

function median(values: number[]): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Detect anomaly for a scalar metric series using MAD (median absolute deviation).
 * Robust for short series (4-30 points) and resistant to outliers in the baseline.
 * z = 0.6745 * (x - median) / MAD — approximates a standard normal score.
 */
export function detectMetricAnomaly(input: {
  metric: string
  label: string
  series: MetricPoint[]
  minPoints?: number
  /** Metrics where a downward move is bad (traffic, rankings count). */
  downIsBad?: boolean
}): MetricAnomaly | null {
  const { metric, label, series, minPoints = 4, downIsBad = true } = input
  const points = (series || []).filter((p) => typeof p?.value === 'number' && Number.isFinite(p.value))
  if (points.length < minPoints) return null

  const latest = points[points.length - 1]
  const baselinePts = points.slice(0, -1)
  const baseline = median(baselinePts.map((p) => p.value))
  const deviations = baselinePts.map((p) => Math.abs(p.value - baseline))
  const mad = median(deviations) || 0
  const zScore = mad > 0 ? (0.6745 * (latest.value - baseline)) / mad : null

  const deltaPct = baseline !== 0 ? ((latest.value - baseline) / Math.abs(baseline)) * 100 : latest.value !== 0 ? 100 : 0
  const direction: 'drop' | 'spike' = latest.value < baseline ? 'drop' : 'spike'

  let severity: AnomalySeverity = 'info'
  const zAbs = zScore != null ? Math.abs(zScore) : Math.abs(deltaPct) / 10
  const meaningful = Math.abs(deltaPct) >= 10 || (zScore != null && zAbs >= 2)
  if (!meaningful) return null
  if (zAbs >= 3 || Math.abs(deltaPct) >= 40) severity = 'critical'
  else if (zAbs >= 2 || Math.abs(deltaPct) >= 20) severity = 'warning'

  // Upward moves on "downIsBad" metrics are improvements → keep as info spike.
  if (direction === 'spike' && downIsBad) severity = 'info'

  return {
    kind: 'metric',
    metric,
    label,
    current: latest.value,
    baseline,
    deltaPct: Math.round(deltaPct * 10) / 10,
    zScore: zScore != null ? Math.round(zScore * 100) / 100 : null,
    direction,
    severity,
    points: points.length,
    evidence: { latest, baselineMedian: baseline, mad },
  }
}

type KeywordSeriesEntry = { date: string | null; position: number | null; volume: number | null }

/**
 * Compare latest keyword positions against trailing baseline snapshots.
 * Flags significant drops (and gains) weighted by volume.
 */
export function analyzeKeywordSeries(input: {
  snapshots: Array<{ date: string | null; rows: KeywordRow[] }>
  minVolume?: number
  limit?: number
}): { drops: KeywordDropAnomaly[]; gained: KeywordDropAnomaly[]; compared: number } {
  const { snapshots, minVolume = 0, limit = 25 } = input
  const sorted = [...(snapshots || [])]
    .filter((s) => Array.isArray(s?.rows) && s.rows.length)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))

  if (sorted.length < 2) return { drops: [], gained: [], compared: 0 }

  const latest = sorted[sorted.length - 1]
  const latestMap = new Map<string, KeywordRow>()
  for (const row of latest.rows) {
    const key = String(row.keyword || '').toLowerCase().trim()
    if (key) latestMap.set(key, row)
  }

  // Baseline: best (lowest) position across all previous snapshots per keyword.
  const baselineMap = new Map<string, { position: number | null; volume: number | null; date: string | null }>()
  for (const snap of sorted.slice(0, -1)) {
    for (const row of snap.rows) {
      const key = String(row.keyword || '').toLowerCase().trim()
      if (!key) continue
      const pos = row.position != null && Number(row.position) > 0 ? Number(row.position) : null
      const prev = baselineMap.get(key)
      const better =
        !prev ||
        (pos != null && (prev.position == null || pos < prev.position)) ||
        (prev.position == null && pos == null && (row.volume || 0) > (prev.volume || 0))
      if (better) baselineMap.set(key, { position: pos, volume: row.volume ?? prev?.volume ?? null, date: snap.date })
    }
  }

  const allKeys = new Set<string>([...latestMap.keys(), ...baselineMap.keys()])
  const drops: KeywordDropAnomaly[] = []
  const gained: KeywordDropAnomaly[] = []
  let compared = 0

  for (const key of allKeys) {
    const curRow = latestMap.get(key) || null
    const base = baselineMap.get(key) || null
    const volume = curRow?.volume ?? base?.volume ?? null
    if (volume != null && volume < minVolume) continue

    const curPos = curRow?.position != null && Number(curRow.position) > 0 ? Number(curRow.position) : null
    const basePos = base?.position ?? null
    if (basePos == null && curPos == null) continue
    compared += 1

    const delta = curPos != null && basePos != null ? curPos - basePos : curPos == null && basePos != null ? 50 - basePos : basePos != null && curPos != null ? curPos - basePos : 0
    const outOf: 'top3' | 'top10' | null =
      basePos != null && basePos <= 3 && (curPos == null || curPos > 3)
        ? 'top3'
        : basePos != null && basePos <= 10 && (curPos == null || curPos > 10)
          ? 'top10'
          : null

    const vol = Number(volume) || 0
    if (delta >= 5 || outOf) {
      let severity: AnomalySeverity = 'warning'
      if (outOf === 'top3' || delta >= 10 || (vol >= 1000 && delta >= 5)) severity = 'critical'
      drops.push({
        kind: 'keyword-drop',
        keyword: curRow?.keyword || key,
        fromPosition: basePos,
        toPosition: curPos,
        drop: Math.round(delta),
        volume,
        outOf,
        severity,
        evidence: { baselineDate: base?.date || null, latestDate: latest.date, baselinePos: basePos },
      })
    } else if (delta <= -5) {
      gained.push({
        kind: 'keyword-drop',
        keyword: curRow?.keyword || key,
        fromPosition: basePos,
        toPosition: curPos,
        drop: Math.round(delta),
        volume,
        outOf: null,
        severity: 'info',
        evidence: { baselineDate: base?.date || null, latestDate: latest.date, baselinePos: basePos },
      })
    }
  }

  drops.sort((a, b) => (b.drop - a.drop) || ((Number(b.volume) || 0) - (Number(a.volume) || 0)))
  gained.sort((a, b) => (a.drop - b.drop) || ((Number(b.volume) || 0) - (Number(a.volume) || 0)))
  return { drops: drops.slice(0, limit), gained: gained.slice(0, Math.min(10, limit)), compared }
}
