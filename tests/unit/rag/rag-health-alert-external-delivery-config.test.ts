const mockGetBoolean = jest.fn();
const mockGetNumber = jest.fn();
jest.mock('@/features/config', () => ({
  configService: {
    getBoolean: (...args: unknown[]) => mockGetBoolean(...args),
    getNumber: (...args: unknown[]) => mockGetNumber(...args)
  }
}));

import { loadRagHealthAlertExternalDeliveryConfig } from '@/features/rag/evaluation/rag-health-alert-external-delivery-config';

describe('loadRagHealthAlertExternalDeliveryConfig', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads every key with conservative defaults when nothing is configured', async () => {
    mockGetBoolean.mockImplementation((_key: string, fallback: boolean) => Promise.resolve(fallback));
    mockGetNumber.mockImplementation((_key: string, fallback: number) => Promise.resolve(fallback));

    const config = await loadRagHealthAlertExternalDeliveryConfig();

    expect(config).toEqual({
      externalEnabled: false,
      externalCooldownMinutes: 120,
      externalNotifyOnResolution: true,
      escalationEnabled: false,
      escalationDelayMinutes: 30,
      escalationCooldownMinutes: 60
    });
  });

  it('reads each config key by its exact registered name', async () => {
    mockGetBoolean.mockResolvedValue(false);
    mockGetNumber.mockResolvedValue(0);

    await loadRagHealthAlertExternalDeliveryConfig();

    expect(mockGetBoolean).toHaveBeenCalledWith('RAG_HEALTH_EXTERNAL_NOTIFICATIONS_ENABLED', false);
    expect(mockGetBoolean).toHaveBeenCalledWith('RAG_HEALTH_EXTERNAL_NOTIFY_ON_RESOLUTION', true);
    expect(mockGetBoolean).toHaveBeenCalledWith('RAG_HEALTH_ALERT_ESCALATION_ENABLED', false);
    expect(mockGetNumber).toHaveBeenCalledWith('RAG_HEALTH_EXTERNAL_NOTIFICATION_COOLDOWN_MINUTES', 120);
    expect(mockGetNumber).toHaveBeenCalledWith('RAG_HEALTH_ALERT_ESCALATION_DELAY_MINUTES', 30);
    expect(mockGetNumber).toHaveBeenCalledWith('RAG_HEALTH_ALERT_ESCALATION_COOLDOWN_MINUTES', 60);
  });
});
