export class PromptBuilder {
  private systemInstruction = '';
  private contextBlocks: string[] = [];
  private userQuery = '';

  public setSystemInstruction(instruction: string): this {
    this.systemInstruction = instruction;
    return this;
  }

  public addContextBlock(title: string, content: string): this {
    this.contextBlocks.push(`=== ${title} ===\n${content}`);
    return this;
  }

  public setUserQuery(query: string): this {
    this.userQuery = query;
    return this;
  }

  public build(): { systemPrompt: string; userPrompt: string } {
    const combinedContext = this.contextBlocks.join('\n\n');
    const systemPrompt = `${this.systemInstruction}\n\n${combinedContext}`.trim();
    return {
      systemPrompt,
      userPrompt: this.userQuery
    };
  }
}
