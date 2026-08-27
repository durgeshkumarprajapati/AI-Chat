import { architectureService } from '@/features/system-architecture/architecture.service';
import { SYSTEM_NODES_REGISTRY } from '@/features/system-architecture/architecture-registry';

describe('Phase 74 — Live System Architecture Explorer Registry', () => {
  it('returns valid system graph nodes and edges matching codebase components', () => {
    const graph = architectureService.getSystemArchitectureGraph();

    expect(graph.nodes.length).toBeGreaterThan(15);
    expect(graph.edges.length).toBeGreaterThan(10);
    expect(graph.generatedAt).toBeDefined();
  });

  it('includes key architecture domains without non-existent placeholders', () => {
    const nodeIds = SYSTEM_NODES_REGISTRY.map((n) => n.id);

    expect(nodeIds).toContain('nextjs-app');
    expect(nodeIds).toContain('auth-rbac');
    expect(nodeIds).toContain('documents-lifecycle');
    expect(nodeIds).toContain('project-workspace');
    expect(nodeIds).toContain('meeting-intelligence');
    expect(nodeIds).toContain('rag-engine');
    expect(nodeIds).toContain('llm-gateway');
    expect(nodeIds).toContain('vector-search');
    expect(nodeIds).toContain('postgresql');
    expect(nodeIds).toContain('redis');
    expect(nodeIds).toContain('rabbitmq-worker');
  });
});
