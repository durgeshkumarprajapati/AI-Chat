// Public surface of the Multimodal Document Intelligence module (Phase 69C). Callers should
// import only from here — never reach into ocr/table/vision internals directly.
export { multimodalExtractionOrchestratorService } from './multimodal-extraction-orchestrator.service';
export { multimodalExtractionRepository } from './multimodal-extraction.repository';
export { getMultimodalConfig } from './multimodal.config';
export { ocrProviderRegistry } from './ocr/ocr-provider.registry';
export { tableProviderRegistry } from './table/table-provider.registry';
export { visionProviderRegistry } from './vision/vision-provider.registry';
export type { MultimodalExtractionInput, MultimodalExtractionResult } from './multimodal-extraction-orchestrator.service';
export type { ExtractedTableDTO, VisionAnalysisResult, ChartAnalysisResult, ImageInput, OCRResult } from './multimodal.types';
