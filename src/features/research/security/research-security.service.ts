import { webUrlValidator } from '@/features/rag/web/web-url.validator';
import { ResearchSourceMode } from '../research.types';
import { AuthorizationError } from '@/errors';
import { prisma } from '@/lib/prisma';
import net from 'net';

export class ResearchSecurityService {
  /**
   * Enforces prompt injection defense by wrapping retrieved evidence inside XML tags
   * and adding explicit system boundary instructions.
   */
  public sanitizeEvidenceForPrompt(rawText: string): string {
    if (!rawText) return '';
    // Strip malicious attempt to close the evidence tag
    const sanitized = rawText.replace(/<\/evidence>/gi, '[ESCAPED_TAG]');
    return `<evidence>\n${sanitized.slice(0, 4000)}\n</evidence>`;
  }

  /**
   * SSRF protection wrapper around webUrlValidator.
   */
  public validateUrlForSSRF(url: string): { isValid: boolean; reason?: string } {
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { isValid: false, reason: 'Forbidden protocol' };
      }
      const hostname = parsed.hostname.toLowerCase();
      if (['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254', 'metadata.google.internal'].includes(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
        return { isValid: false, reason: 'Forbidden SSRF target' };
      }
      if (net.isIP(hostname) && webUrlValidator.isPrivateOrReservedIp(hostname)) {
        return { isValid: false, reason: 'Forbidden private IP target' };
      }
      return { isValid: true };
    } catch (err: any) {
      return { isValid: false, reason: err.message || 'Invalid URL' };
    }
  }

  /**
   * Validates if source mode permits web search operations.
   */
  public isWebSearchPermitted(sourceMode: ResearchSourceMode): boolean {
    return (
      [
        ResearchSourceMode.WEB_ONLY,
        ResearchSourceMode.ALL_SOURCES,
        ResearchSourceMode.WEB_SEARCH,
        ResearchSourceMode.AUTO,
        ResearchSourceMode.RESEARCH_WEB,
        ResearchSourceMode.RESEARCH_ALL
      ] as ResearchSourceMode[]
    ).includes(sourceMode);
  }

  /**
   * Validates if source mode permits document retrieval operations.
   */
  public isDocumentRetrievalPermitted(sourceMode: ResearchSourceMode): boolean {
    return (
      [
        ResearchSourceMode.DOCUMENTS_ONLY,
        ResearchSourceMode.ALL_SOURCES,
        ResearchSourceMode.AUTO,
        ResearchSourceMode.RESEARCH_DOCUMENTS,
        ResearchSourceMode.RESEARCH_ALL
      ] as ResearchSourceMode[]
    ).includes(sourceMode);
  }

  /**
   * Verifies that the authenticated user owns or has authorization to access documentIds, knowledgeBaseId, or roadmapId.
   */
  public async verifyResourceAuthorization(
    userId: string,
    resources: { knowledgeBaseId?: string; roadmapId?: string; documentIds?: string[] }
  ): Promise<void> {
    if (resources.knowledgeBaseId) {
      const kb = await prisma.knowledgeBase.findFirst({
        where: { id: resources.knowledgeBaseId, userId }
      });
      if (!kb) {
        throw new AuthorizationError(`Unauthorized access to Knowledge Base: ${resources.knowledgeBaseId}`);
      }
    }

    if (resources.roadmapId) {
      const rm = await prisma.roadmap.findFirst({
        where: { id: resources.roadmapId, userId }
      });
      if (!rm) {
        throw new AuthorizationError(`Unauthorized access to Roadmap: ${resources.roadmapId}`);
      }
    }

    if (resources.documentIds && resources.documentIds.length > 0) {
      const authorizedCount = await prisma.document.count({
        where: {
          id: { in: resources.documentIds },
          userId
        }
      });
      if (authorizedCount !== resources.documentIds.length) {
        throw new AuthorizationError('Unauthorized access to one or more requested documents.');
      }
    }
  }
}

export const researchSecurityService = new ResearchSecurityService();
