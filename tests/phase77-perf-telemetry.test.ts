jest.mock('@/features/config', () => ({
  configService: { getBoolean: jest.fn().mockResolvedValue(true), getNumber: jest.fn().mockResolvedValue(1000) }
}));

import { withApiTiming, perfTelemetryService } from '@/features/performance/perf-telemetry.service';

describe('Phase 77 — withApiTiming wrapper is purely observational', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passes through the wrapped handler\'s return value unchanged', async () => {
    const handler = jest.fn(async (a: number, b: number) => ({ sum: a + b }));
    const wrapped = withApiTiming('test.route', handler);

    const result = await wrapped(2, 3);

    expect(result).toEqual({ sum: 5 });
    expect(handler).toHaveBeenCalledWith(2, 3);
  });

  it('rethrows exactly what the handler threw, unmodified', async () => {
    const originalError = new Error('boom');
    const handler = jest.fn(async () => {
      throw originalError;
    });
    const wrapped = withApiTiming('test.route', handler);

    await expect(wrapped()).rejects.toBe(originalError);
  });

  it('never throws from telemetry logging itself, even if config lookups fail', async () => {
    const configModule = require('@/features/config');
    (configModule.configService.getBoolean as jest.Mock).mockRejectedValue(new Error('config unavailable'));

    await expect(perfTelemetryService.logEvent({ event: 'test' })).resolves.toBeUndefined();
    await expect(perfTelemetryService.warnIfSlow('op', 5000)).resolves.toBeUndefined();
  });
});
