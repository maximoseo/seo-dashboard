/**
 * Soft bridges from SEO Dashboard → external ops systems.
 * Never throw into request lifecycle; always return result objects.
 */

export type BridgeResult = {
  ok: boolean
  target: 'todo' | 'asana' | 'agentic-os'
  id?: string
  error?: string
  skipped?: boolean
  detail?: string
}

function envfirst(...keys: string[]): string {
  for (const k of keys) {
    const v = process.env[k]
    if (v && String(v).trim()) return String(v).trim()
  }
  return ''
}

export async function pushCriticalAlertToTodo(input: {
  domain: string
  title: string
  detail: string
  severity: string
  alertDbId?: string
}): Promise<BridgeResult> {
  const apiKey = envfirst('TODO_API_KEY')
  const base = envfirst('TODO_API_BASE_URL', 'TODO_API_URL') || 'https://to-do-tasks.maximo-seo.ai'
  const projectId = envfirst('TODO_DEFAULT_PROJECT_ID', 'TODO_TELEGRAM_DEFAULT_PROJECT_ID')
  if (!apiKey) {
    return { ok: false, target: 'todo', skipped: true, error: 'TODO_API_KEY not configured' }
  }
  if (input.severity === 'info') {
    return { ok: true, target: 'todo', skipped: true, detail: 'info severity skipped' }
  }

  const priority = input.severity === 'critical' ? 'urgent' : input.severity === 'warning' ? 'high' : 'medium'
  const body = {
    title: `[SEO] ${input.domain}: ${input.title}`.slice(0, 300),
    description: `${input.detail}\n\nDomain: ${input.domain}\nAlert: ${input.alertDbId || 'n/a'}`.slice(0, 5000),
    status: 'todo',
    priority,
    project_id: projectId || undefined,
    source: `seo-dashboard:${input.domain}`,
  }

  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/tasks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
    const text = await res.text()
    let data: any = null
    try { data = text ? JSON.parse(text) : null } catch { data = { raw: text.slice(0, 200) } }
    if (!res.ok) {
      return { ok: false, target: 'todo', error: `todo ${res.status}`, detail: JSON.stringify(data).slice(0, 240) }
    }
    return { ok: true, target: 'todo', id: data?.task?.id || data?.id }
  } catch (err: any) {
    return { ok: false, target: 'todo', error: err?.message || 'todo request failed' }
  }
}

export async function pushCriticalAlertToAsana(input: {
  domain: string
  title: string
  detail: string
  severity: string
}): Promise<BridgeResult> {
  const token = envfirst('ASANA_ACCESS_TOKEN', 'ASANA_API_KEY', 'ASANA_KEY_LOCAL_REST_API_WEBS')
  const projectGid = envfirst('ASANA_SEO_PROJECT_GID', 'ASANA_DEFAULT_PROJECT_GID')
  const workspaceGid = envfirst('ASANA_WORKSPACE_GID', 'ASANA_WORKSPACE')
  if (!token) return { ok: false, target: 'asana', skipped: true, error: 'ASANA token not configured' }
  if (input.severity === 'info') return { ok: true, target: 'asana', skipped: true, detail: 'info severity skipped' }
  if (!projectGid && !workspaceGid) {
    return { ok: false, target: 'asana', skipped: true, error: 'ASANA_SEO_PROJECT_GID or ASANA_WORKSPACE_GID required' }
  }

  const payload: Record<string, unknown> = {
    data: {
      name: `[SEO] ${input.domain} — ${input.title}`.slice(0, 200),
      notes: `${input.detail}\n\nDomain: ${input.domain}\nSeverity: ${input.severity}`,
      ...(projectGid ? { projects: [projectGid] } : {}),
      ...(workspaceGid && !projectGid ? { workspace: workspaceGid } : {}),
    },
  }

  try {
    const res = await fetch('https://app.asana.com/api/1.0/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, target: 'asana', error: `asana ${res.status}`, detail: JSON.stringify(data).slice(0, 240) }
    }
    return { ok: true, target: 'asana', id: data?.data?.gid }
  } catch (err: any) {
    return { ok: false, target: 'asana', error: err?.message || 'asana request failed' }
  }
}

export async function loadAgenticOsBridge(adminUrl: string, serviceKey: string) {
  if (!adminUrl || !serviceKey) return { sites: [], seo_sites: [], error: 'missing admin client' }
  try {
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: 'application/json',
    }
    const [sitesRes, seoSitesRes] = await Promise.all([
      fetch(`${adminUrl}/rest/v1/sites?select=id,domain,name,status,latest_score,cms&limit=200`, { headers, signal: AbortSignal.timeout(15000) }),
      fetch(`${adminUrl}/rest/v1/seo_sites?select=id,name,url,status,health_score,links_count,actions_count,last_audit_at&limit=200`, { headers, signal: AbortSignal.timeout(15000) }),
    ])
    const sites = sitesRes.ok ? await sitesRes.json() : []
    const seo_sites = seoSitesRes.ok ? await seoSitesRes.json() : []
    return {
      sites: Array.isArray(sites) ? sites : [],
      seo_sites: Array.isArray(seo_sites) ? seo_sites : [],
      source: 'agentic-os-sunru',
      fetchedAt: new Date().toISOString(),
    }
  } catch (err: any) {
    return { sites: [], seo_sites: [], error: err?.message || 'bridge failed' }
  }
}
