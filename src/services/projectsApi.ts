import { authFetch } from '@/lib/authToken'
import type { ProjectListResponse, ProjectResponse, ProjectSummaryResponse } from '@/types/project'

const API_BASE = import.meta.env.VITE_API_URL || ''

function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await authFetch(apiUrl(path))
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Projects API ${res.status}: ${text.slice(0, 160)}`)
  }
  return res.json()
}

export async function fetchProjects(): Promise<ProjectListResponse> {
  return fetchJson<ProjectListResponse>('/api/projects')
}

export async function fetchProject(domain: string): Promise<ProjectResponse> {
  return fetchJson<ProjectResponse>(`/api/projects/${encodeURIComponent(domain)}`)
}

export async function fetchProjectSummary(domain: string): Promise<ProjectSummaryResponse> {
  return fetchJson<ProjectSummaryResponse>(`/api/projects/${encodeURIComponent(domain)}/summary`)
}

export async function fetchProjectModules(domain: string) {
  return fetchJson(`/api/projects/${encodeURIComponent(domain)}/modules`)
}
