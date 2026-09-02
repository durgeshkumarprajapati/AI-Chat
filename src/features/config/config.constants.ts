export const SECRET_KEY_PATTERNS = [
  /api_?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /credential/i,
  /jwt/i,
  /database_url/i,
  /private_key/i,
  /auth_secret/i,
  /bearer/i
];

export const REDIS_CONFIG_KEY_PREFIX = 'config:v1:';
export const REDIS_CONFIG_CATEGORY_PREFIX = 'config:v1:category:';
export const CONFIG_CACHE_DEFAULT_TTL = 3600; // 1 hour

export const DEFAULT_CONFIG_FALLBACKS: Record<string, { value: string; type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON' }> = {
  RAG_FAST_PATH_CONFIDENCE_THRESHOLD: { value: '0.90', type: 'NUMBER' },
  RAG_VECTOR_TIMEOUT_MS: { value: '15000', type: 'NUMBER' },
  RAG_KEYWORD_TIMEOUT_MS: { value: '15000', type: 'NUMBER' },
  RAG_GRAPH_TIMEOUT_MS: { value: '20000', type: 'NUMBER' },
  RAG_RERANK_TIMEOUT_MS: { value: '15000', type: 'NUMBER' },
  RAG_CACHE_TTL_SECONDS: { value: '3600', type: 'NUMBER' },
  DOCUMENT_INTELLIGENCE_ENABLED: { value: 'true', type: 'BOOLEAN' },
  DOCUMENT_MULTIMODAL_ENABLED: { value: 'true', type: 'BOOLEAN' },
  OCR_ENABLED: { value: 'true', type: 'BOOLEAN' },
  TABLE_EXTRACTION_ENABLED: { value: 'true', type: 'BOOLEAN' },
  IMAGE_ANALYSIS_ENABLED: { value: 'true', type: 'BOOLEAN' },
  CHART_ANALYSIS_ENABLED: { value: 'true', type: 'BOOLEAN' },
  MEETING_INTELLIGENCE_ENABLED: { value: 'true', type: 'BOOLEAN' },
  CLICKUP_ENABLED: { value: 'true', type: 'BOOLEAN' },
  SYSTEM_ARCHITECTURE_EXPLORER_ENABLED: { value: 'true', type: 'BOOLEAN' },
  WEBRTC_STUN_SERVERS: { value: 'stun:stun.l.google.com:19302', type: 'STRING' },
  WEBRTC_TURN_SERVERS: { value: '', type: 'STRING' },
  WEBRTC_TURN_USERNAME: { value: '', type: 'STRING' },
  WEBRTC_TURN_CREDENTIAL: { value: '', type: 'STRING' }
};
