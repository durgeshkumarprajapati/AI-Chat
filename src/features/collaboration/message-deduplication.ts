export interface CollabMessageItem {
  id: string;
  channelId: string;
  senderId: string;
  content: string;
  replyToId?: string | null;
  isEdited?: boolean;
  isDeleted?: boolean;
  isAi?: boolean;
  aiModel?: string | null;
  sharedRoadmapId?: string | null;
  sharedRoadmapStepId?: string | null;
  sharedEntityId?: string | null;
  sharedDocumentId?: string | null;
  sharedStudyQuestionId?: string | null;
  clientMessageId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  sender: {
    id: string;
    name: string | null;
    email: string;
    role: string;
    avatarUrl?: string | null;
  };
  replyTo?: { id: string; content: string; sender: { name: string | null; email: string } } | null;
  status?: 'SENDING' | 'SENT' | 'FAILED';
}

/**
 * Reconciles and deduplicates incoming messages against existing message state.
 * Prevents race condition duplicates between REST API responses and SSE events.
 */
export function mergeMessages<T extends CollabMessageItem>(
  existingMessages: T[],
  incoming: T | T[]
): T[] {
  const incomingList = Array.isArray(incoming) ? incoming : [incoming];
  if (incomingList.length === 0) return existingMessages;

  const result = [...existingMessages];

  for (const item of incomingList) {
    const existingIndex = result.findIndex((m) => {
      if (m.id && item.id && m.id === item.id) return true;
      if (m.clientMessageId && item.clientMessageId && m.clientMessageId === item.clientMessageId) return true;
      return false;
    });

    if (existingIndex !== -1) {
      // Reconcile/update existing message
      result[existingIndex] = {
        ...result[existingIndex],
        ...item,
        status: item.status || 'SENT'
      };
    } else {
      // Append new message
      result.push({
        ...item,
        status: item.status || 'SENT'
      });
    }
  }

  // Ensure chronological ordering by createdAt
  return result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}
