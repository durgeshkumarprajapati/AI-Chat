export interface Citation {
  documentId: string;
  chunkId: string;
  filename: string;
  pageNumber: number;
  similarity: number;
}

export interface ChatMessageItem {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  citations: Citation[];
  createdAt: string;
}

export interface ConversationDetail {
  id: string;
  title: string;
  summary?: string | null;
  knowledgeBaseId?: string | null;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessageItem[];
}

export interface ChatResponse {
  conversationId: string;
  messageId: string;
  answer: string;
  citations: Citation[];
  retrievedChunks: number;
  topSimilarity: number;
  retrievalQuery?: string;
  contextMessagesCount?: number;
}

export type StreamEvent =
  | {
      type: 'start';
      conversationId: string;
      citations: Citation[];
      retrievedChunks: number;
      topSimilarity: number;
      retrievalQuery?: string;
      contextMessagesCount?: number;
    }
  | { type: 'delta'; text: string }
  | {
      type: 'done';
      conversationId: string;
      messageId: string;
      answer: string;
      citations: Citation[];
    }
  | { type: 'error'; message: string };
