export function buildConnectionReasoningPrompt(
  sourceName: string,
  targetName: string,
  pathDescription: string,
  evidenceSnippets: string[]
): string {
  return `You are a Knowledge Reasoning Assistant.

Task:
Synthesize a grounded explanation connecting entity "${sourceName}" to "${targetName}" based ONLY on the evidence graph path and supporting text snippets.

Path Structure:
${pathDescription}

Evidence Snippets:
${evidenceSnippets.join('\n---\n')}

Instructions:
- Provide a clear, step-by-step grounded explanation.
- Do NOT invent or hallucinate relationships not present in the evidence.
- If no direct grounded path exists, state clearly: NO_GROUNDED_CONNECTION_FOUND.`;
}
