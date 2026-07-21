import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { DataCard } from '@/components/DataCard'
import { authFetch } from '@/lib/authToken'

interface Schedule {
  id: string
  domainId: string
  template: string
  locale: 'he' | 'en'
  frequency: 'weekly' | 'monthly'
  recipients: string[]
  brandName?: string | null
  brandColor?: string | null
  clientName?: string | null
  market?: string | null
  enabled: boolean
  sendDay: number
  sendHour: number
  lastRunAt?: string | null
  nextRunAt?: string | null
  lastStatus?: string | null
  lastError?: string | null
}

interface Props {
  domain: string
  clientName?: string | null
  market?: string | null
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function fmtDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export default function ReportSchedules({ domain, clientName, market }: Props) {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('monthly')
  const [template, setTemplate] = useState('monthly')
  const [locale, setLocale] = useState<'he' | 'en'>('he')
  const [sendDay, setSendDay] = useState(1)
  const [sendHour, setSendHour] = useState(8)
  const [recipients, setRecipients] = useState('')
  const [brandName, setBrandName] = useState('')
  const [brandColor, setBrandColor] = useState('#0ea5e9')

  const recipientList = useMemo(
    () => recipients.split(/[,\n]/).map((r) => r.trim()).filter(Boolean),
    [recipients],
  )

  const load = async () => {
    if (!domain) return
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch(`/api/reports/schedules?domain=${encodeURIComponent(domain)}`)
      if (!res.ok) throw new Error(`Schedules API failed: ${res.status}`)
      const body = await res.json()
      setSchedules(Array.isArray(body.schedules) ? body.schedules : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load schedules')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setSchedules([])
    setNotice(null)
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain])

  const create = async () => {
    if (!recipientList.length) {
      setError('Add at least one recipient email.')
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const res = await authFetch('/api/reports/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain,
          template,
          locale,
          frequency,
          recipients: recipientList,
          brandName: brandName.trim() || null,
          brandColor: brandColor || null,
          clientName: clientName || null,
          market: market || null,
          sendDay,
          sendHour,
          enabled: true,
        }),
      })
      if (!res.ok) throw new Error(`Create failed (${res.status})`)
      setNotice('Schedule created ✓')
      setShowForm(false)
      setRecipients('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = async (s: Schedule) => {
    setError(null)
    try {
      const res = await authFetch(`/api/reports/schedules/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, enabled: !s.enabled }),
      })
      if (!res.ok) throw new Error(`Update failed (${res.status})`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    }
  }

  const remove = async (s: Schedule) => {
    if (!window.confirm(`Delete schedule for ${s.recipients.join(', ')}?`)) return
    setError(null)
    try {
      const res = await authFetch(`/api/reports/schedules/${s.id}?domain=${encodeURIComponent(domain)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Delete failed (${res.status})`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const sendNow = async (s: Schedule) => {
    setSendingId(s.id)
    setError(null)
    setNotice(null)
    try {
      const res = await authFetch(`/api/reports/schedules/${s.id}/send-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Send failed (${res.status})`)
      setNotice(`Sent ✓ to ${s.recipients.join(', ')}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setSendingId(null)
    }
  }

  return (
    <DataCard
      title="Scheduled reports (white-label)"
      dataState={loading ? ('loading' as any) : ('live' as any)}
      headerRight={
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent-light"
        >
          {showForm ? 'Close' : '+ New schedule'}
        </button>
      }
    >
      {error && <p className="mb-3 rounded-lg border border-red/30 bg-red/10 px-3 py-2 text-xs text-red">{error}</p>}
      {notice && <p className="mb-3 rounded-lg border border-green/30 bg-green/10 px-3 py-2 text-xs text-green">{notice}</p>}

      {showForm && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-4 rounded-xl border border-border bg-bg-darkest p-3.5 md:p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <label className="text-[11px] text-fg-muted">
              Frequency
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as any)} className="mt-1 w-full rounded-lg border border-border bg-bg-card px-2.5 py-2 text-sm text-fg">
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label className="text-[11px] text-fg-muted">
              Template
              <select value={template} onChange={(e) => setTemplate(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg-card px-2.5 py-2 text-sm text-fg">
                <option value="weekly">Weekly performance</option>
                <option value="monthly">Monthly SEO</option>
                <option value="executive">Executive brief</option>
                <option value="local-geo">Local + GEO</option>
              </select>
            </label>
            <label className="text-[11px] text-fg-muted">
              Locale
              <select value={locale} onChange={(e) => setLocale(e.target.value as any)} className="mt-1 w-full rounded-lg border border-border bg-bg-card px-2.5 py-2 text-sm text-fg">
                <option value="he">עברית</option>
                <option value="en">English</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-fg-muted">
                {frequency === 'weekly' ? 'Day' : 'Day of month'}
                {frequency === 'weekly' ? (
                  <select value={sendDay} onChange={(e) => setSendDay(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-border bg-bg-card px-2.5 py-2 text-sm text-fg">
                    {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                  </select>
                ) : (
                  <input type="number" min={1} max={28} value={sendDay} onChange={(e) => setSendDay(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-border bg-bg-card px-2.5 py-2 text-sm text-fg" />
                )}
              </label>
              <label className="text-[11px] text-fg-muted">
                Hour (UTC)
                <input type="number" min={0} max={23} value={sendHour} onChange={(e) => setSendHour(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-border bg-bg-card px-2.5 py-2 text-sm text-fg" />
              </label>
            </div>
          </div>
          <div className="mt-2.5 grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <label className="text-[11px] text-fg-muted md:col-span-2">
              Recipients (comma separated)
              <input type="text" value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="client@example.com, boss@example.com" className="mt-1 w-full rounded-lg border border-border bg-bg-card px-2.5 py-2 text-sm text-fg placeholder:text-fg-dim" />
            </label>
            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <label className="text-[11px] text-fg-muted">
                Brand name
                <input type="text" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Your agency" className="mt-1 w-full rounded-lg border border-border bg-bg-card px-2.5 py-2 text-sm text-fg placeholder:text-fg-dim" />
              </label>
              <label className="text-[11px] text-fg-muted">
                Color
                <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="mt-1 h-9 w-12 cursor-pointer rounded-lg border border-border bg-bg-card p-1" />
              </label>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[11px] text-fg-dim">
              White-label: the report header/footer and email sender name use your brand. Sent from reports@maximo-seo.com via Resend.
            </p>
            <button onClick={() => void create()} disabled={saving} className="shrink-0 rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-2 text-xs font-semibold text-accent-light disabled:opacity-50">
              {saving ? 'Saving…' : 'Create schedule'}
            </button>
          </div>
        </motion.div>
      )}

      {loading && <div className="animate-pulse space-y-2">{[1, 2].map((i) => <div key={i} className="h-14 rounded-xl bg-white/[0.06]" />)}</div>}

      {!loading && schedules.length === 0 && (
        <p className="py-6 text-center text-sm text-fg-dim">No scheduled reports for {domain} yet — create one to automate white-label delivery.</p>
      )}

      <div className="space-y-2">
        {schedules.map((s) => (
          <div key={s.id} className="flex flex-col gap-3 rounded-xl border border-border bg-bg-darkest px-3.5 py-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${s.enabled ? 'bg-green' : 'bg-fg-dim'}`} />
                <p className="text-sm font-medium text-fg">
                  {s.frequency === 'weekly' ? `Weekly · ${WEEKDAYS[s.sendDay]}` : `Monthly · day ${s.sendDay}`} · {String(s.sendHour).padStart(2, '0')}:00 UTC
                </p>
                <span className="rounded border border-border bg-bg-card px-1.5 py-0.5 text-[10px] text-fg-muted">{s.template}</span>
                <span className="rounded border border-border bg-bg-card px-1.5 py-0.5 text-[10px] text-fg-muted">{s.locale === 'he' ? 'עברית' : 'EN'}</span>
                {s.brandName && (
                  <span className="rounded border px-1.5 py-0.5 text-[10px] font-medium" style={{ borderColor: s.brandColor || '#0ea5e9', color: s.brandColor || '#0ea5e9' }}>
                    {s.brandName}
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-[11px] text-fg-muted">→ {s.recipients.join(', ')}</p>
              <p className="mt-0.5 text-[11px] text-fg-dim">
                Next: {fmtDate(s.nextRunAt)} · Last: {fmtDate(s.lastRunAt)}
                {s.lastStatus && (
                  <span className={s.lastStatus === 'sent' ? 'text-green' : 'text-red'}> · {s.lastStatus}{s.lastError ? ` (${s.lastError.slice(0, 60)})` : ''}</span>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button onClick={() => void toggleEnabled(s)} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${s.enabled ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-green/30 bg-green/10 text-green'}`}>
                {s.enabled ? 'Pause' : 'Resume'}
              </button>
              <button onClick={() => void sendNow(s)} disabled={sendingId === s.id} className="rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-[11px] font-medium text-accent-light disabled:opacity-50">
                {sendingId === s.id ? 'Sending…' : 'Send now'}
              </button>
              <button onClick={() => void remove(s)} className="rounded-lg border border-red/30 bg-red/10 px-2.5 py-1.5 text-[11px] font-medium text-red">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </DataCard>
  )
}
