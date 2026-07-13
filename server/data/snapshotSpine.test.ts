import { describe, expect, it } from 'vitest'
import { buildSnapshotOverlayMap, deriveHealthScore, extractProviderMetrics } from './snapshotSpine'
import { alertDedupeKey } from './persistOps'

describe('snapshot spine', () => {
  it('extracts overview metrics from nested AHREFS/SEMrush sources', () => {
    const metrics = extractProviderMetrics('overview', {
      sources: {
        ahrefs: {
          metrics: { metrics: { org_traffic: 1234, org_keywords: 88 } },
          domainRating: { domain_rating: 42 },
        },
      },
    })
    expect(metrics.organicTraffic).toBe(1234)
    expect(metrics.organicKeywords).toBe(88)
    expect(metrics.domainRating).toBe(42)
  })

  it('builds domain overlays + health from latest snapshots', () => {
    const overlays = buildSnapshotOverlayMap(
      [
        {
          domain_id: 'd1',
          provider: 'overview',
          snapshot_date: '2026-07-13',
          fetched_at: '2026-07-13T10:00:00Z',
          data: {
            sources: {
              ahrefs: {
                metrics: { metrics: { org_traffic: 500, org_keywords: 40 } },
                domainRating: { domain_rating: 30 },
              },
            },
          },
        },
        {
          domain_id: 'd1',
          provider: 'alerts',
          snapshot_date: '2026-07-13',
          fetched_at: '2026-07-13T10:05:00Z',
          data: {
            alerts: [
              { severity: 'warning', title: 'x' },
              { severity: 'critical', title: 'y' },
            ],
          },
        },
      ],
      new Map([['d1', 2]]),
      new Map([['d1', 3]]),
      new Map([['d1', { domain: 'example.com', status: 'active', priority: 'high' }]]),
    )

    const row = overlays.get('d1')
    expect(row?.alertCount).toBe(2)
    expect(row?.taskCount).toBe(3)
    expect(row?.lastFetchedAt).toBe('2026-07-13T10:05:00Z')
    expect(row?.healthScore).toEqual(expect.any(Number))
    expect(row?.connectedSources).toEqual(expect.arrayContaining(['Overview', 'Rules Engine']))
  })

  it('derives bounded health scores', () => {
    expect(deriveHealthScore({ hasSnapshot: false, status: 'active' })).toBeGreaterThan(0)
    expect(deriveHealthScore({
      hasSnapshot: true,
      organicTraffic: 0,
      organicKeywords: 0,
      criticalAlerts: 5,
      warningAlerts: 5,
    })).toBeGreaterThanOrEqual(5)
  })

  it('builds stable alert dedupe keys', () => {
    expect(alertDedupeKey({ domain: 'A.com', module: 'Traffic', title: 'Organic traffic dropped' }))
      .toBe('a-com-traffic-organic-traffic-dropped')
  })
})
