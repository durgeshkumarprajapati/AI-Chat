import { TourDefinition } from '../tour-types';

export const projectWorkspacesTour: TourDefinition = {
  id: 'project-workspaces',
  version: 1,
  module: 'Project Workspaces',
  title: 'Project Workspaces Tour',
  badge: 'Phase 36',
  description: 'Organize documents, research sessions, study sessions, roadmaps, and workflows into isolated project workspaces.',
  routePattern: '^/projects',
  steps: [
    {
      id: 'proj-1',
      target: 'data-tour="projects-header"',
      title: 'Project Workspaces',
      description: 'Collaborate and organize knowledge assets into dedicated project environments.',
      icon: '📁'
    },
    {
      id: 'proj-2',
      target: 'data-tour="projects-new-btn"',
      title: 'Create Project',
      description: 'Create a new project workspace and invite team members with granular RBAC permissions.',
      icon: '➕'
    },
    {
      id: 'proj-3',
      target: 'data-tour="projects-assets"',
      title: 'Scoped Knowledge Assets',
      description: 'Documents, Knowledge Bases, and Research reports inside a project workspace inherit project scope automatically.',
      icon: '🔒'
    }
  ]
};
