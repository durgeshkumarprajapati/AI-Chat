import { TourDefinition } from './tour-types';
import { knowledgeGraphTour, knowledgeGraphWorkflowTour } from './tours/knowledge-graph.tour';
import { dashboardTour } from './tours/dashboard.tour';
import { ragChatTour } from './tours/rag-chat.tour';
import { documentsTour } from './tours/documents.tour';
import { knowledgeBasesTour } from './tours/knowledge-bases.tour';
import { studyTour } from './tours/study.tour';
import { agenticResearchTour } from './tours/agentic-research.tour';
import { workflowsTour } from './tours/workflows.tour';
import { roadmapTour } from './tours/roadmap.tour';
import { copilotTour } from './tours/copilot.tour';
import { projectWorkspacesTour } from './tours/project-workspaces.tour';
import { cityExplorerTour } from './tours/city-explorer.tour';
import { copilotMemoryTour } from './tours/copilot-memory.tour';

export class TourRegistry {
  private tours: Map<string, TourDefinition> = new Map();

  constructor() {
    this.registerAllDefaultTours();
  }

  private registerAllDefaultTours(): void {
    const all = [
      knowledgeGraphTour,
      knowledgeGraphWorkflowTour,
      dashboardTour,
      ragChatTour,
      documentsTour,
      knowledgeBasesTour,
      studyTour,
      agenticResearchTour,
      workflowsTour,
      roadmapTour,
      copilotTour,
      projectWorkspacesTour,
      cityExplorerTour,
      copilotMemoryTour
    ];

    for (const t of all) {
      this.tours.set(t.id, t);
    }
  }

  public register(tour: TourDefinition): void {
    this.tours.set(tour.id, tour);
  }

  public getTourById(id: string): TourDefinition | undefined {
    return this.tours.get(id);
  }

  public getAllTours(): TourDefinition[] {
    return Array.from(this.tours.values());
  }

  /**
   * Resolves the applicable TourDefinition for a given URL pathname.
   */
  public getTourForRoute(pathname: string): TourDefinition {
    const cleanPath = (pathname || '/').trim();

    for (const tour of this.tours.values()) {
      if (tour.routePattern) {
        const regex = new RegExp(tour.routePattern);
        if (regex.test(cleanPath)) {
          return tour;
        }
      }
    }

    // Default fallback to dashboard tour
    return dashboardTour;
  }
}

export const tourRegistry = new TourRegistry();
