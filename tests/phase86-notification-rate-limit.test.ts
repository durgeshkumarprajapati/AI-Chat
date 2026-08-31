// Phase 86 — notification-rate-limit.service.ts: hourly/daily/critical-daily caps enforced via
// Redis INCR, and the explicit fail-OPEN behavior when Redis is unavailable (never blocks
// delivery solely because Redis is down).
jest.mock('@/lib/redis', () => ({
  redis: { getClient: jest.fn() }
}));
jest.mock('@/features/config', () => ({
  configService: { getNumber: jest.fn() }
}));

import { redis } from '@/lib/redis';
import { configService } from '@/features/config';
import { NotificationRateLimitService } from '@/features/notifications/notification-rate-limit.service';

function makeFakeRedisClient(incrSequence: number[]) {
  let call = 0;
  return {
    incr: jest.fn().mockImplementation(async () => incrSequence[call++] ?? incrSequence[incrSequence.length - 1]),
    expire: jest.fn().mockResolvedValue(1)
  };
}

describe('Phase 86 — notification-rate-limit.service', () => {
  let service: NotificationRateLimitService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationRateLimitService();
  });

  it('checkHourlyLimit allows while under NOTIFICATION_MAX_PER_HOUR', async () => {
    (configService.getNumber as jest.Mock).mockResolvedValue(10);
    (redis.getClient as jest.Mock).mockResolvedValue(makeFakeRedisClient([5]));

    await expect(service.checkHourlyLimit('user-1')).resolves.toBe(true);
  });

  it('checkHourlyLimit denies once the rolling-hour count exceeds NOTIFICATION_MAX_PER_HOUR', async () => {
    (configService.getNumber as jest.Mock).mockResolvedValue(10);
    (redis.getClient as jest.Mock).mockResolvedValue(makeFakeRedisClient([11]));

    await expect(service.checkHourlyLimit('user-1')).resolves.toBe(false);
  });

  it('checkDailyLimit denies once the rolling-day count exceeds NOTIFICATION_MAX_PER_DAY', async () => {
    (configService.getNumber as jest.Mock).mockResolvedValue(30);
    (redis.getClient as jest.Mock).mockResolvedValue(makeFakeRedisClient([31]));

    await expect(service.checkDailyLimit('user-1')).resolves.toBe(false);
  });

  it('checkCriticalDailyLimit denies once the rolling-day critical count exceeds NOTIFICATION_MAX_CRITICAL_PER_DAY', async () => {
    (configService.getNumber as jest.Mock).mockResolvedValue(10);
    (redis.getClient as jest.Mock).mockResolvedValue(makeFakeRedisClient([11]));

    await expect(service.checkCriticalDailyLimit('user-1')).resolves.toBe(false);
  });

  it('sets a TTL only on the first increment (current === 1)', async () => {
    (configService.getNumber as jest.Mock).mockResolvedValue(10);
    const client = makeFakeRedisClient([1]);
    (redis.getClient as jest.Mock).mockResolvedValue(client);

    await service.checkHourlyLimit('user-1');

    expect(client.expire).toHaveBeenCalledWith(expect.stringContaining('ratelimit:notification:hourly:user-1'), 3600);
  });

  it('FAILS OPEN (returns true / allowed) when Redis throws, even though the caller is clearly over any reasonable limit', async () => {
    (configService.getNumber as jest.Mock).mockResolvedValue(1);
    (redis.getClient as jest.Mock).mockRejectedValue(new Error('Redis connection refused'));

    await expect(service.checkHourlyLimit('user-1')).resolves.toBe(true);
    await expect(service.checkDailyLimit('user-1')).resolves.toBe(true);
    await expect(service.checkCriticalDailyLimit('user-1')).resolves.toBe(true);
  });

  it('never throws even when Redis is completely unavailable for every check in sequence', async () => {
    (configService.getNumber as jest.Mock).mockResolvedValue(1);
    (redis.getClient as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      Promise.all([service.checkHourlyLimit('user-1'), service.checkDailyLimit('user-1'), service.checkCriticalDailyLimit('user-1')])
    ).resolves.toEqual([true, true, true]);
  });
});
