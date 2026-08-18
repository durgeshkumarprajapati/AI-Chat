import { LLMRequest } from '@/features/llm/llm.types';

export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
}

export function createTestUser(override: Partial<TestUser> = {}): TestUser {
  const id = override.id || `user-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    email: override.email || `${id}@example.com`,
    name: override.name || 'Test User',
    role: override.role || 'USER'
  };
}

export function createTestAdmin(override: Partial<TestUser> = {}): TestUser {
  return createTestUser({ role: 'ADMIN', name: 'Test Admin User', ...override });
}

export interface TestDocument {
  id: string;
  userId: string;
  filename: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  fileSize: number;
}

export function createTestDocument(userId: string, override: Partial<TestDocument> = {}): TestDocument {
  const id = override.id || `doc-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    userId,
    filename: override.filename || 'sample_policy.pdf',
    status: override.status || 'COMPLETED',
    fileSize: override.fileSize || 1024 * 100
  };
}

export interface TestKnowledgeBase {
  id: string;
  userId: string;
  name: string;
  description: string;
}

export function createTestKnowledgeBase(userId: string, override: Partial<TestKnowledgeBase> = {}): TestKnowledgeBase {
  const id = override.id || `kb-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    userId,
    name: override.name || 'Security & Compliance KB',
    description: override.description || 'Enterprise security guidelines'
  };
}

export interface TestStudySession {
  id: string;
  userId: string;
  topic: string;
  mode: 'QUIZ' | 'TEACH' | 'SOCRATIC' | 'FLASHCARDS' | 'PRACTICE' | 'REVIEW';
}

export function createTestStudySession(userId: string, override: Partial<TestStudySession> = {}): TestStudySession {
  const id = override.id || `study-session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    userId,
    topic: override.topic || 'Zero-Trust Architecture',
    mode: override.mode || 'QUIZ'
  };
}

export interface TestRoadmap {
  id: string;
  userId: string;
  title: string;
  phasesCount: number;
}

export function createTestRoadmap(userId: string, override: Partial<TestRoadmap> = {}): TestRoadmap {
  const id = override.id || `roadmap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    userId,
    title: override.title || 'Mastering Cloud Security Engineering',
    phasesCount: override.phasesCount || 4
  };
}

export interface TestResearchSession {
  id: string;
  userId: string;
  topic: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
}

export function createTestResearchSession(userId: string, override: Partial<TestResearchSession> = {}): TestResearchSession {
  const id = override.id || `research-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    userId,
    topic: override.topic || 'Post-Quantum Cryptography Benchmarks',
    status: override.status || 'COMPLETED'
  };
}

export interface TestWorkflow {
  id: string;
  userId: string;
  name: string;
  nodesCount: number;
}

export function createTestWorkflow(userId: string, override: Partial<TestWorkflow> = {}): TestWorkflow {
  const id = override.id || `workflow-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    userId,
    name: override.name || 'Automated Document Summarizer & Export',
    nodesCount: override.nodesCount || 3
  };
}

export function createTestLLMRequest(override: Partial<LLMRequest> = {}): LLMRequest {
  return {
    prompt: override.prompt || 'Summarize the server security requirements.',
    feature: override.feature || 'RAG_CHAT',
    localOnly: override.localOnly ?? false,
    ...override
  };
}
