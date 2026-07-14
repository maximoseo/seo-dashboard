import { domainsEqual, canonicalizeDomain } from '@/lib/domain'

type Props = {
  activeDomain: string | null | undefined
  payloadDomain?: string | null
  dataState?: string | null
  fetchedAt?: string | null
  fromSnapshot?: boolean
  rowCount?: number
  foreignDropped?: number
  giantsDropped?: number
  selfDropped?: number
  extra?: string
}

export default function DomainIntegrityBar({
  activeDomain,
  payloadDomain,
  dataState,
  fetchedAt,
  fromSnapshot,
  rowCount,
  foreignDropped = 0,
  giantsDropped = 0,
  selfDropped = 0,
  extra,
}: Props) {
  const active = canonicalizeDomain(activeDomain)
  const payload = canonicalizeDomain(payloadDomain || activeDomain)
  const match = !payload || domainsEqual(active, payload)
  const drops = foreignDropped + giantsDropped + selfDropped

  return (
    <div
      className={`rounded-xl border px-3 py-2 text-[11px] md:text-xs flex flex-wrap items-center gap-x-3 gap-y-1 ${
        match
          ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100'
          : 'border-red-500/40 bg-red-500/10 text-red-100'
      }`}
    >
      <span className="font-semibold">{match ? 'Domain integrity OK' : 'Domain mismatch'}</span>
      <span>
        Active: <span className="font-medium text-fg">{active || '—'}</span>
      </span>
      <span>
        Payload: <span className="font-medium text-fg">{payload || '—'}</span>
      </span>
      {typeof rowCount === 'number' && <span>Rows: {rowCount}</span>}
      {drops > 0 && (
        <span className="text-amber-200">
          Filtered: {foreignDropped ? `${foreignDropped} foreign ` : ''}
          {giantsDropped ? `${giantsDropped} giants ` : ''}
          {selfDropped ? `${selfDropped} self` : ''}
        </span>
      )}
      {dataState && <span className="text-fg-dim">{dataState}{fromSnapshot ? ' · snapshot' : ''}</span>}
      {fetchedAt && <span className="text-fg-dim">{String(fetchedAt).slice(0, 19).replace('T', ' ')}</span>}
      {extra && <span className="text-fg-dim">{extra}</span>}
      {!match && (
        <span className="font-medium">Not rendering foreign rows — switch project or force refresh.</span>
      )}
    </div>
  )
}
