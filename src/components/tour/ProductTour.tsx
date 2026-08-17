'use client';

import { useState, useEffect } from 'react';

export type TourStep = {
  title: string;
  badge: string;
  description: string;
  technicalDetails: string;
  icon: string;
};

const TOUR_STEPS: TourStep[] = [
  {
    title: '1. PDF Upload & Local Storage',
    badge: 'Phase 7',
    description: 'Upload a PDF up to 25 MB. The file is validated and stored securely before processing begins.',
    technicalDetails: 'LocalStorageProvider / S3StorageProvider • Document record created with status=UPLOADING',
    icon: '📁'
  },
  {
    title: '2. RabbitMQ Processing Queue',
    badge: 'Phase 7',
    description: 'The upload publishes a versioned job payload to RabbitMQ for asynchronous background processing.',
    technicalDetails: 'Queue: "document-processing" • Retries: 3 attempts with exponential backoff & ACK/NACK mechanics',
    icon: '⚡'
  },
  {
    title: '3. PDF Page-Aware Text Extraction',
    badge: 'Phase 8',
    description: 'The decoupled Node.js worker downloads the PDF and extracts raw text page-by-page preserving 1-indexed page numbers.',
    technicalDetails: 'pdfjs-dist engine • Document.pageCount updated in database',
    icon: '📄'
  },
  {
    title: '4. Token-Aware Document Chunking',
    badge: 'Phase 9',
    description: 'Extracted text is cleaned and split into overlapping chunks bounded strictly by token count limits.',
    technicalDetails: 'js-tiktoken cl100k_base tokenizer • Chunk Size: 800 tokens • Overlap: 120 tokens',
    icon: '🧩'
  },
  {
    title: '5. Local Ollama Vector Embeddings',
    badge: 'Phase 10',
    description: 'Chunks are batch-sent to local Ollama to generate high-dimensional numerical vector representations.',
    technicalDetails: 'Ollama POST /api/embed • Model: nomic-embed-text • Vector Dimensions: 768d',
    icon: '🧠'
  },
  {
    title: '6. PostgreSQL pgvector Persistence',
    badge: 'Phase 10',
    description: 'Vector embeddings are transactionally persisted into PostgreSQL using parameterized raw SQL and indexed for fast cosine search.',
    technicalDetails: 'Column: vector(768) • Index: HNSW cosine_ops (document_chunks_embedding_hnsw_idx)',
    icon: '🗄️'
  },
  {
    title: '7. Hybrid Retrieval (Vector + Keyword Search)',
    badge: 'Phase 14',
    description: 'Queries retrieve candidates using semantic vector similarity AND lexical PostgreSQL Full-Text Search for exact matches.',
    technicalDetails: 'pgvector <=> operator + to_tsvector/plainto_tsquery • Tenant Isolation: d.user_id = $2',
    icon: '🔀'
  },
  {
    title: '8. Local Reranking & Scoring',
    badge: 'Phase 14',
    description: 'Merged candidate sets are deduplicated and scored using a local deterministic reranker with phrase alignment and term coverage bonuses.',
    technicalDetails: 'Hybrid Weights: 0.70 Vector + 0.30 Keyword • LocalReranker exact phrase match scoring',
    icon: '📊'
  },
  {
    title: '9. Real-Time Streaming RAG Chat',
    badge: 'Phase 13',
    description: 'Ask questions with real-time progressive response streaming via Server-Sent Events (SSE), stop generation, and citation badges.',
    technicalDetails: 'POST /api/chat/stream • SSE event: delta • AbortController • Ollama llama3.2 / OpenAI gpt-4o-mini',
    icon: '💬'
  },
  {
    title: '10. RAG Retrieval Inspector & Observability',
    badge: 'Phase 14',
    description: 'Developers can inspect candidate breakdowns, vector vs keyword scores, hybrid weights, and latency metrics in real time.',
    technicalDetails: 'Route: /rag-debug • POST /api/rag/debug • Latency metrics & candidate step breakdown',
    icon: '🔍'
  },
  {
    title: '11. Pluggable Document Storage (Amazon S3)',
    badge: 'Phase 15',
    description: 'The platform supports pluggable document storage backends: default LocalStorageProvider or production Amazon S3 with zero pipeline code changes.',
    technicalDetails: 'AWS_STORAGE_PROVIDER=local | s3 • S3StorageProvider • Preserved logical keys: documents/{userId}/{documentId}/{filename}',
    icon: '☁️'
  },
  {
    title: '12. Document Management & Knowledge Base',
    badge: 'Phase 16',
    description: 'SaaS-style document catalog with debounced search, status filtering, sorting, Knowledge Base metrics, retry/reprocess actions, and secure deletion.',
    technicalDetails: 'GET /api/documents (paginated) • POST /retry • POST /reprocess • DELETE /api/documents/[id] • GET /download',
    icon: '📚'
  },
  {
    title: '13. Multi-Document Knowledge Bases / Collections',
    badge: 'Phase 17',
    description: 'Organize documents into reusable collections without duplicating underlying files, chunks, or vector embeddings. RAG search can be dynamically scoped to selected Knowledge Bases.',
    technicalDetails: 'KnowledgeBase & KnowledgeBaseDocument models • SQL EXISTS scoping in RetrievalService • Scoped SSE Chat & RAG Inspector',
    icon: '📚'
  },
  {
    title: '14. Conversation Memory & Context Management',
    badge: 'Phase 18',
    description: 'Multi-turn conversation memory with follow-up query contextualization, token-bounded context management, background summarization, automatic titling, and strict document-grounded zero-hallucination policy.',
    technicalDetails: 'ConversationContextService • Query Rewriting • Token Budget • Title & Summary Generation • Paginated Conversation CRUD',
    icon: '🧠'
  },
  {
    title: '15. RAG Evaluation, User Feedback & Quality Analytics',
    badge: 'Phase 19',
    description: 'Measure RAG answer quality with user 👍/👎 feedback, sentence-level groundedness scoring, citation coverage metrics, response/retrieval latency tracking, and a developer quality dashboard.',
    technicalDetails: 'UserFeedback & RagEvaluation models • LocalHeuristicEvaluator • Non-blocking async telemetry • /rag-evaluation analytics',
    icon: '📈'
  },
  {
    title: '16. RAG Performance & Latency Optimization',
    badge: 'Phase 20',
    description: 'Real-time grounded streaming with prompt budgets, controlled output, and diagnostics for retrieval, time-to-first-token, LLM inference, and async evaluation.',
    technicalDetails: 'Prompt context optimizer • TTFT telemetry • /rag-debug performance diagnostics',
    icon: '⚡'
  },
  {
    title: '17. Intelligent RAG Orchestration & Safe Caching',
    badge: 'Phase 21',
    description: 'Multi-level caching (Exact, Embedding, Semantic) with Redis/Memory fallback, evidence assessment, 1-step retrieval recovery, explicit general knowledge mode, and structured zero-result actions.',
    technicalDetails: 'AnswerOrchestratorService • EvidenceAssessmentService • RedisRAGCacheProvider • Tenant-isolated cache keys',
    icon: '🚀'
  },
  {
    title: 'Citation-Aware Answers & Evidence Explorer',
    badge: 'Phase 22 Evidence',
    description: 'Inspect exact document evidence snippets, page numbers, similarity scores, and evidence confidence levels for complete trust and transparency.',
    technicalDetails: 'CitationService • Deterministic Evidence Snippet Extraction • Server-side Citation Validation • Evidence Confidence & Coverage',
    icon: '🔍'
  },
  {
    title: 'Web Knowledge & External Sources',
    badge: 'Phase 23 Web RAG',
    description: 'Ingest public web documentation with SSRF protection into the same pgvector hybrid retrieval pipeline. Select Documents, Web, or Both in Chat UI.',
    technicalDetails: 'WebUrlValidator (SSRF) • WebFetcher • WebContentExtractor • WebSourceService • Multi-source RAG Orchestration',
    icon: '🌐'
  },
  {
    title: 'Web Discovery & Trusted Sources',
    badge: 'Phase 24 Discovery',
    description: 'Ask questions against public web sources (Wikipedia, Medium) or specify any domain URL. Discovered sources are cited and can be saved to your Knowledge Base.',
    technicalDetails: 'WebDiscoveryService • WikipediaProvider • MediumProvider • DomainDiscoveryProvider • RobotsPolicyService • UrlNormalizer',
    icon: '🌍'
  },
  {
    title: '21. Intelligent Web Search & Multi-Source Evidence Fusion',
    badge: 'Phase 25',
    description: 'Automatic live web search without requiring a target website URL. Classifies query intent, plans bounded search queries, ranks source authority, and fuses internal document evidence with live web evidence.',
    technicalDetails: 'WebSearchDecisionService • WebSearchPlanner • SearchEngineWebProvider • WebSourceQualityService • EvidenceFusionService',
    icon: '✨'
  },
  {
    title: '22. Multi-Modal Document Intelligence (Tables, OCR & Vision)',
    badge: 'Phase 26',
    description: 'Ask questions about charts, diagrams, tables, scanned PDF pages, and figures. Visual content is parsed into grounded, searchable evidence.',
    technicalDetails: 'MultimodalService • TableExtractorService • LocalOCRProvider • DefaultVisionProvider • VisualQueryClassifier',
    icon: '📊'
  },
  {
    title: '23. Voice Assistant & Location-Aware City Explorer',
    badge: 'Phase 29',
    description: 'Listen to assistant answers with customizable speed & language TTS. Explore your city with real-time weather and AI city queries.',
    technicalDetails: 'TextToSpeechService • TTSTextCleaner • LocationService • WeatherService • CityExplorerService',
    icon: '🔊'
  },
  {
    title: '24. AI Roadmap Builder & Personal Learning Workspace',
    badge: 'Phase 31',
    description: 'Build structured, personalized learning paths with guided questionnaires, task progress tracking, phase regeneration, and peer sharing.',
    technicalDetails: 'RoadmapGenerationService • RoadmapPlannerService • RoadmapValidatorService • RoadmapSharingService • WorkspaceContext',
    icon: '🚀'
  },
  {
    title: '25. Voice Input Assistant & Global Theme System',
    badge: 'Phase 32',
    description: 'Speak your questions with browser STT (English, Hindi, Gujarati) and switch application themes (Light, Dark, System) seamlessly.',
    technicalDetails: 'SpeechToTextService • BrowserSpeechProvider • ThemeContext • User-Scoped Theme Isolation • Flash Prevention Script',
    icon: '🎤'
  },
  {
    title: '26. AI Study & Tutor Workspace',
    badge: 'Phase 33',
    description: 'Interactive AI tutor mode with grounded Socratic questioning, quizzes, flashcards, practice code exercises, and adaptive mastery tracking.',
    technicalDetails: 'StudySessionService • StudyQuestionGeneratorService • StudyAnswerEvaluatorService • StudyAdaptiveEngineService • StudyHintService',
    icon: '🎓'
  },
  {
    title: '27. Bounded Agentic Research',
    badge: 'Phase 34',
    description: 'Autonomous multi-source evidence investigation, claim extraction, conflict detection, gap analysis, and report synthesis.',
    technicalDetails: 'ResearchAgentService • ResearchPlannerService • ResearchToolExecutor • ResearchClaimService • ResearchConflictService • ResearchReportService',
    icon: '🤖'
  },
  {
    title: '28. AI Workflow Builder & Automation Engine',
    badge: 'Phase 35',
    description: 'Visual drag-and-drop node graph canvas and AI-assisted workflow generator for orchestrating Document AI, RAG, Web Search, and Agentic Research pipelines.',
    technicalDetails: 'WorkflowEngineService • WorkflowNodeExecutor • GraphValidator • WorkflowValidatorService • AIWorkflowGeneratorService • WorkflowVariableService • WorkflowConditionEvaluator',
    icon: '🧩'
  },
  {
    title: '29. AI Knowledge & Research Copilot + Project Workspace',
    badge: 'Phase 36',
    description: 'Unified AI workspace orchestrating Documents, Knowledge Bases, Agentic Research, Roadmaps, Study Mode, Workflows, and User Memory into single project workspaces.',
    technicalDetails: 'CopilotExecutionEngine • CopilotRouterService • CopilotPlannerService • CopilotCapabilityRegistry • ProjectService • CopilotMemoryService',
    icon: '🧠'
  }
];

export function ProductTour({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const step = TOUR_STEPS[currentStep] || TOUR_STEPS[0]!;
  const isFirst = currentStep === 0;
  const isLast = currentStep === TOUR_STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      localStorage.setItem('docai_tour_completed', 'true');
      onClose();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (!isFirst) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    localStorage.setItem('docai_tour_completed', 'true');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <span className="text-3xl">{step.icon}</span>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-xl font-bold text-white">{step.title}</h3>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-800">
                  {step.badge}
                </span>
              </div>
              <p className="text-xs text-slate-400">Step {currentStep + 1} of {TOUR_STEPS.length}</p>
            </div>
          </div>
          <button
            onClick={handleSkip}
            className="text-slate-400 hover:text-white text-sm font-medium transition-colors"
          >
            Skip
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 py-2">
          <p className="text-base text-slate-200 leading-relaxed">
            {step.description}
          </p>

          <div className="rounded-xl bg-slate-950 border border-slate-800/80 p-3.5 space-y-1">
            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Under The Hood</span>
            <p className="text-xs font-mono text-slate-300">{step.technicalDetails}</p>
          </div>
        </div>

        {/* Indicator dots */}
        <div className="flex items-center justify-center space-x-1.5 py-1">
          {TOUR_STEPS.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentStep(idx)}
              className={`h-2 rounded-full transition-all ${
                idx === currentStep ? 'w-6 bg-indigo-500' : 'w-2 bg-slate-700 hover:bg-slate-500'
              }`}
              aria-label={`Go to step ${idx + 1}`}
            />
          ))}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <button
            onClick={handleBack}
            disabled={isFirst}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              isFirst
                ? 'opacity-40 cursor-not-allowed text-slate-500'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            Back
          </button>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={handleSkip}
              className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
            >
              Skip Tour
            </button>
            <button
              onClick={handleNext}
              className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-600/20 transition-all"
            >
              {isLast ? 'Got it!' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
