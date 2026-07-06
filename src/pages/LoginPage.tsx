import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export default function LoginPage() {
  const { isAuthenticated, login, error } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  if (isAuthenticated) {
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/'
    return <Navigate to={from === '/login' ? '/' : from} replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setLocalError(null)
    try {
      await login(username.trim(), password)
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/'
      navigate(from === '/login' ? '/' : from, { replace: true })
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-darkest text-fg flex items-center justify-center px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.13),_transparent_35%)]" />
      <div className="relative w-full max-w-md rounded-3xl border border-border-light bg-bg-card/90 p-6 shadow-2xl backdrop-blur-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent-light">
            <svg width="30" height="30" viewBox="0 0 28 28" fill="none">
              <rect x="2" y="16" width="5" height="10" rx="1.5" fill="currentColor" />
              <rect x="11" y="10" width="5" height="16" rx="1.5" fill="currentColor" />
              <rect x="20" y="4" width="5" height="22" rx="1.5" fill="currentColor" opacity="0.7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">SEO Pro Dashboard</h1>
          <p className="mt-2 text-sm text-fg-muted">Secure access for Maximo SEO dashboards</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="dashboard-email" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-fg-dim">Email</label>
            <input
              id="dashboard-email"
              type="email"
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full rounded-xl border border-border bg-bg-darkest px-4 py-3 text-sm text-fg outline-none transition-colors placeholder:text-fg-dim focus:border-accent"
              placeholder="service@maximo-seo.com"
              required
            />
          </div>
          <div>
            <label htmlFor="dashboard-password" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-fg-dim">Password</label>
            <input
              id="dashboard-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-xl border border-border bg-bg-darkest px-4 py-3 text-sm text-fg outline-none transition-colors placeholder:text-fg-dim focus:border-accent"
              placeholder="••••••••••••"
              required
            />
          </div>

          {(localError || error) && (
            <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {localError || error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent/85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-fg-dim">
          Credentials are validated server-side only. No password is stored in the browser or committed to the repository.
        </div>
      </div>
    </div>
  )
}
