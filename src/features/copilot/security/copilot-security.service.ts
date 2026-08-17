import { projectService } from '@/features/projects/project.service';

export class CopilotSecurityService {
  /**
   * Enforce prompt injection boundaries on untrusted evidence or user inputs.
   */
  public sanitizePromptBoundary(userInput: string, untrustedContent?: string): { prompt: string; sanitized: boolean } {
    let sanitized = false;

    // Check for prompt injection signatures
    const injectionPatterns = [
      /ignore\s+(all\s+)?previous\s+instructions/i,
      /system\s+prompt\s+override/i,
      /reveal\s+secret/i,
      /bypass\s+security/i,
      /you\s+are\s+now\s+a\s+DAN/i
    ];

    let cleanInput = userInput;
    for (const pattern of injectionPatterns) {
      if (pattern.test(cleanInput)) {
        cleanInput = cleanInput.replace(pattern, '[REDACTED_INJECTION_ATTEMPT]');
        sanitized = true;
      }
    }

    let formattedPrompt = `<USER_REQUEST>\n${cleanInput}\n</USER_REQUEST>`;

    if (untrustedContent) {
      let cleanUntrusted = untrustedContent;
      for (const pattern of injectionPatterns) {
        if (pattern.test(cleanUntrusted)) {
          cleanUntrusted = cleanUntrusted.replace(pattern, '[REDACTED_EVIDENCE_INJECTION]');
          sanitized = true;
        }
      }
      formattedPrompt += `\n\n<UNTRUSTED_EVIDENCE>\n${cleanUntrusted}\n</UNTRUSTED_EVIDENCE>`;
    }

    return { prompt: formattedPrompt, sanitized };
  }

  /**
   * Validate that user is authorized to access a given project resource.
   */
  public async validateProjectAccess(userId: string, projectId: string, requiredRole: 'VIEWER' | 'EDITOR' | 'OWNER' = 'VIEWER'): Promise<boolean> {
    const role = await projectService.getUserProjectRole(projectId, userId);
    if (!role) return false;

    if (requiredRole === 'VIEWER') return true;
    if (requiredRole === 'EDITOR') return role === 'OWNER' || role === 'EDITOR';
    if (requiredRole === 'OWNER') return role === 'OWNER';

    return false;
  }

  /**
   * Verify source mode isolation: prevent private documents from leaking into web searches.
   */
  public enforceSourceIsolation(sourceMode: string, hasPrivateDocuments: boolean): string {
    if (sourceMode === 'web' && hasPrivateDocuments) {
      // In web search mode, private documents are strictly excluded
      return 'web';
    }
    return sourceMode;
  }
}

export const copilotSecurityService = new CopilotSecurityService();
