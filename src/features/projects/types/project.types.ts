export type ProjectStatus = 'ACTIVE' | 'ARCHIVED';
export type ProjectMemberRole = 'OWNER' | 'EDITOR' | 'VIEWER';

export interface ProjectMemberInfo {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectMemberRole;
  userEmail?: string;
  userName?: string;
  createdAt: Date;
}

export interface ProjectSummary {
  id: string;
  ownerId: string;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
  ownerName?: string;
  memberCount: number;
  documentCount: number;
  knowledgeBaseCount: number;
  roadmapCount: number;
  studySessionCount: number;
  researchSessionCount: number;
  workflowCount: number;
  conversationCount: number;
}

export interface ProjectDetail extends ProjectSummary {
  members: ProjectMemberInfo[];
  documents: { id: string; documentId: string; filename: string; mimeType: string; createdAt: Date }[];
  knowledgeBases: { id: string; knowledgeBaseId: string; name: string; createdAt: Date }[];
  roadmaps: { id: string; roadmapId: string; title: string; createdAt: Date }[];
  studySessions: { id: string; studySessionId: string; title: string; difficulty: string; createdAt: Date }[];
  researchSessions: { id: string; researchSessionId: string; title: string; status: string; createdAt: Date }[];
  workflows: { id: string; workflowId: string; name: string; status: string; createdAt: Date }[];
  conversations: { id: string; conversationId: string; title: string; createdAt: Date }[];
}

export interface CreateProjectPayload {
  name: string;
  description?: string;
  documentIds?: string[];
  knowledgeBaseIds?: string[];
  roadmapIds?: string[];
  studySessionIds?: string[];
  researchSessionIds?: string[];
  workflowIds?: string[];
}

export interface UpdateProjectPayload {
  name?: string;
  description?: string;
  status?: ProjectStatus;
}
