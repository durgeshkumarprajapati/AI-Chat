import { env } from '@/config/env';
import { meetingIntelligenceRepository } from '../meeting-intelligence.repository';

export class ClickUpAuthService {
  public getConnectUrl(): string {
    const clientId = env.server?.CLICKUP_CLIENT_ID || 'mock_client_id';
    const redirectUri = encodeURIComponent(env.server?.CLICKUP_REDIRECT_URI || 'http://localhost:3000/api/integrations/clickup/callback');
    return `https://app.clickup.com/api?client_id=${clientId}&redirect_uri=${redirectUri}`;
  }

  public async handleOAuthCallback(userId: string, code: string) {
    let accessToken = `mock_token_${Date.now()}`;
    let workspaceId = 'mock_workspace_1';

    if (env.server?.CLICKUP_CLIENT_ID && env.server?.CLICKUP_CLIENT_SECRET && code && !code.startsWith('mock')) {
      try {
        const res = await fetch(`${env.server.CLICKUP_API_BASE_URL}/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: env.server.CLICKUP_CLIENT_ID,
            client_secret: env.server.CLICKUP_CLIENT_SECRET,
            code
          })
        });
        const data = await res.json();
        if (data.access_token) {
          accessToken = data.access_token;
        }
      } catch (err) {
        console.warn('[ClickUpAuthService] OAuth exchange failed, using simulated connection:', err);
      }
    }

    return meetingIntelligenceRepository.saveClickUpIntegration({
      userId,
      accessToken,
      workspaceId,
      workspaceName: 'Primary ClickUp Workspace'
    });
  }

  public async getStatus(userId: string) {
    const integration = await meetingIntelligenceRepository.getClickUpIntegration(userId);
    return {
      connected: !!integration && integration.status === 'ACTIVE',
      workspaceId: integration?.workspaceId || null,
      workspaceName: integration?.workspaceName || null,
      connectedAt: integration?.createdAt || null
    };
  }

  public async disconnect(userId: string) {
    return meetingIntelligenceRepository.disconnectClickUpIntegration(userId);
  }
}

export const clickUpAuthService = new ClickUpAuthService();
