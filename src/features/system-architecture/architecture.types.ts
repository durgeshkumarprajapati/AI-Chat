export type ArchitectureCategory =
  | 'APPLICATION'
  | 'AI_ENGINE'
  | 'RETRIEVAL'
  | 'INTEGRATION'
  | 'INFRASTRUCTURE';

export interface ArchitectureNodeDTO {
  id: string;
  name: string;
  category: ArchitectureCategory;
  description: string;
  status: 'CONFIGURED' | 'AVAILABLE' | 'ENABLED' | 'DISABLED' | 'NOT_CONFIGURED';
  featureFlag?: string;
  dependencies?: string[];
  techStack?: string;
  position?: { x: number; y: number };
}

export interface ArchitectureEdgeDTO {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
}

export interface SystemArchitectureGraphDTO {
  nodes: ArchitectureNodeDTO[];
  edges: ArchitectureEdgeDTO[];
  generatedAt: string;
  systemStatus: Record<string, string>;
}
