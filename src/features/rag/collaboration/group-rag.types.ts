import { ProjectMemberRole, MessageRole } from '@prisma/client';

export interface CreateGroupConversationDTO {
  title: string;
  summary?: string;
  memberUserIds?: string[];
  documentSourceIds?: string[];
  knowledgeBaseSourceIds?: string[];
}

export interface UpdateGroupConversationDTO {
  title?: string;
  summary?: string;
}

export interface GroupMemberDTO {
  id: string;
  conversationId: string;
  userId: string;
  role: ProjectMemberRole;
  joinedAt: Date;
  user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl?: string | null;
  };
}

export interface GroupDocumentSourceDTO {
  id: string;
  conversationId: string;
  documentId: string;
  addedByUserId: string;
  createdAt: Date;
  document: {
    id: string;
    filename: string;
    fileSize: number;
    mimeType: string;
    createdAt: Date;
  };
  addedBy: {
    id: string;
    name: string | null;
    email: string;
  };
}

export interface GroupKBSourceDTO {
  id: string;
  conversationId: string;
  knowledgeBaseId: string;
  addedByUserId: string;
  createdAt: Date;
  knowledgeBase: {
    id: string;
    name: string;
    description: string | null;
    createdAt: Date;
  };
  addedBy: {
    id: string;
    name: string | null;
    email: string;
  };
}

export interface GroupConversationDetailsDTO {
  id: string;
  type: 'GROUP';
  title: string;
  summary: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  userRole: ProjectMemberRole;
  members: GroupMemberDTO[];
  documentSources: GroupDocumentSourceDTO[];
  knowledgeBaseSources: GroupKBSourceDTO[];
  messageCount: number;
}

export interface GroupMessageDTO {
  id: string;
  conversationId: string;
  authorId: string | null;
  role: MessageRole;
  content: string;
  citations: unknown;
  createdAt: Date;
  author?: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl?: string | null;
  } | null;
}
