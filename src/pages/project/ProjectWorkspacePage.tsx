import { Outlet } from 'react-router-dom'
import ProjectHeader from '@/components/project/ProjectHeader'
import ProjectTabs from '@/components/project/ProjectTabs'

export default function ProjectWorkspacePage() {
  return (
    <div className="max-w-[1400px] space-y-4 lg:space-y-5">
      <ProjectHeader />
      <ProjectTabs />
      <Outlet />
    </div>
  )
}
