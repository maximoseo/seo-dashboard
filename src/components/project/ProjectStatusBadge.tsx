import type { ProjectStatus } from '@/types/project'

const styles: Record<ProjectStatus, string> = {
  active: 'border-green-500/30 bg-green-500/15 text-green-300',
  ready: 'border-blue-500/30 bg-blue-500/15 text-blue-300',
  planned: 'border-purple-500/30 bg-purple-500/15 text-purple-300',
  paused: 'border-yellow-500/30 bg-yellow-500/15 text-yellow-300',
  archived: 'border-white/10 bg-white/[0.04] text-fg-dim',
}

export default function ProjectStatusBadge({ status, className = '' }: { status: ProjectStatus; className?: string }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[status]} ${className}`}>{status}</span>
}
