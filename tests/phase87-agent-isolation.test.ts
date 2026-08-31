import { listRegisteredTools } from '@/features/ai-agent/tool-registry';

describe('Phase 87 — Agent Network & SSRF Isolation Policy', () => {
  it('does not expose arbitrary HTTP fetch, URL request, or dynamic endpoint tools', () => {
    const tools = listRegisteredTools();
    const toolIds = tools.map((t) => t.id);

    expect(toolIds).not.toContain('fetch_url');
    expect(toolIds).not.toContain('http_request');
    expect(toolIds).not.toContain('execute_command');
    expect(toolIds).not.toContain('run_bash');
    expect(toolIds).not.toContain('eval_script');
  });

  it('prohibits permanent deletion or destructive administrative capabilities in registered tools', () => {
    const tools = listRegisteredTools();
    const toolIds = tools.map((t) => t.id);

    expect(toolIds).not.toContain('delete_document');
    expect(toolIds).not.toContain('delete_user');
    expect(toolIds).not.toContain('delete_project');
    expect(toolIds).not.toContain('cancel_subscription');
  });
});
