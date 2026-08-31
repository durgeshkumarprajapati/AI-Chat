import { planGoal } from '@/features/ai-agent/planner.service';
import { entitlementService } from '@/features/billing/entitlement.service';
import { configService } from '@/features/config/config.service';
import { AuthorizationError } from '@/errors';

jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn(), getNumber: jest.fn() }
}));
jest.mock('@/features/billing/entitlement.service', () => ({
  entitlementService: { requireFeature: jest.fn() }
}));
jest.mock('@/features/llm/llm-gateway.service', () => ({
  llmGateway: { generateStructured: jest.fn() }
}));

describe('Phase 87 — AI Agent Platform Entitlement Checks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (configService.getBoolean as jest.Mock).mockResolvedValue(true);
    (configService.getNumber as jest.Mock).mockResolvedValue(10);
  });

  it('requires AI_AGENT feature code before allowing agent plan creation', async () => {
    (entitlementService.requireFeature as jest.Mock).mockRejectedValue(
      new AuthorizationError('This feature is available on a higher plan.')
    );

    await expect(planGoal('user-unpaid', 'Review meeting')).rejects.toThrow(AuthorizationError);
    expect(entitlementService.requireFeature).toHaveBeenCalledWith('user-unpaid', 'AI_AGENT');
  });

  it('refuses plan creation when AI_AGENT_ENABLED is false in configuration', async () => {
    (entitlementService.requireFeature as jest.Mock).mockResolvedValue(undefined);
    (configService.getBoolean as jest.Mock).mockResolvedValue(false);

    await expect(planGoal('user-1', 'Review meeting')).rejects.toThrow(/disabled by configuration/i);
  });
});
