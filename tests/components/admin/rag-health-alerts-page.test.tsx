import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams()
}));

import RagHealthAlertsPage from '@/app/admin/rag-health-alerts/page';

const OPEN_CRITICAL_ALERT = {
  id: 'alert-critical',
  category: 'GRAPH',
  metric: 'graphFailureRatePercent',
  severity: 'CRITICAL',
  status: 'OPEN',
  detectionReason: 'GraphRAG failure rate 60% exceeds 30%.',
  currentValue: 60,
  baselineValue: null,
  thresholdValue: 30,
  window: '24h',
  sampleSize: 120,
  detectionCount: 3,
  firstDetectedAt: '2026-01-01T00:00:00.000Z',
  lastDetectedAt: '2026-01-01T02:00:00.000Z',
  acknowledgedAt: null,
  acknowledgedBy: null,
  resolvedAt: null,
  lastNotifiedAt: '2026-01-01T00:05:00.000Z',
  lastNotifiedSeverity: 'CRITICAL',
  lastNotifiedDetectionCount: 1,
  notificationStatus: 'NOTIFIED',
  durationMs: null
};

const RESOLVED_WARNING_ALERT = {
  id: 'alert-resolved',
  category: 'CITATION',
  metric: 'uncitedAnswerRatePercent',
  severity: 'WARNING',
  status: 'RESOLVED',
  detectionReason: 'Uncited-answer rate 45% exceeds 40%.',
  currentValue: 45,
  baselineValue: null,
  thresholdValue: 40,
  window: '24h',
  sampleSize: 80,
  detectionCount: 2,
  firstDetectedAt: '2026-01-01T00:00:00.000Z',
  lastDetectedAt: '2026-01-01T01:00:00.000Z',
  acknowledgedAt: null,
  acknowledgedBy: null,
  resolvedAt: '2026-01-01T03:00:00.000Z',
  lastNotifiedAt: null,
  lastNotifiedSeverity: null,
  lastNotifiedDetectionCount: null,
  notificationStatus: 'NOT_NOTIFIED',
  durationMs: 10800000
};

function mockFetchSequence(alerts: unknown[]) {
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (url.includes('/api/admin/rag-health-alerts')) {
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, data: { alerts, count: alerts.length } })
      });
    }
    return Promise.resolve({ json: () => Promise.resolve({ success: false }) });
  }) as unknown as typeof fetch;
}

describe('RAG Incident Operations Dashboard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders active (OPEN) incidents with a distinguishable CRITICAL severity badge', async () => {
    mockFetchSequence([OPEN_CRITICAL_ALERT]);
    render(<RagHealthAlertsPage />);

    await waitFor(() => expect(screen.getByText('Incidents (1)')).toBeInTheDocument());

    const row = screen.getByText('graphFailureRatePercent').closest('tr');
    expect(row).not.toBeNull();
    const critical = within(row as HTMLElement).getByText('CRITICAL');
    expect(critical.className).toMatch(/destructive/);
    expect(within(row as HTMLElement).getByText('OPEN').className).toMatch(/destructive/);
  });

  it('renders RESOLVED incidents with a success-styled status badge and computed duration', async () => {
    mockFetchSequence([RESOLVED_WARNING_ALERT]);
    render(<RagHealthAlertsPage />);

    await waitFor(() => expect(screen.getByText('Incidents (1)')).toBeInTheDocument());

    const row = screen.getByText('uncitedAnswerRatePercent').closest('tr');
    expect(within(row as HTMLElement).getByText('RESOLVED').className).toMatch(/success/);
    expect(within(row as HTMLElement).getByText('WARNING').className).toMatch(/warning/);
    // 10800000ms = 3h 0m
    expect(within(row as HTMLElement).getByText('3h 0m')).toBeInTheDocument();
  });

  it('never shows an Acknowledge action for a RESOLVED incident', async () => {
    mockFetchSequence([RESOLVED_WARNING_ALERT]);
    render(<RagHealthAlertsPage />);

    await waitFor(() => expect(screen.getByText('Incidents (1)')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /acknowledge/i })).not.toBeInTheDocument();
  });

  it('shows an Acknowledge action for an OPEN incident', async () => {
    mockFetchSequence([OPEN_CRITICAL_ALERT]);
    render(<RagHealthAlertsPage />);

    await waitFor(() => expect(screen.getByText('Incidents (1)')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /acknowledge/i })).toBeInTheDocument();
  });

  it('renders the incident table inside a horizontally scrollable wrapper (no page-level overflow)', async () => {
    mockFetchSequence([OPEN_CRITICAL_ALERT]);
    const { container } = render(<RagHealthAlertsPage />);

    await waitFor(() => expect(screen.getByText('Incidents (1)')).toBeInTheDocument());
    const table = container.querySelector('table');
    expect(table?.closest('.overflow-x-auto')).not.toBeNull();
    expect(container.querySelector('.overflow-x-hidden')).not.toBeNull();
  });

  it('shows an Access Denied state when the API rejects the request', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: false, error: { message: 'Administrator privileges are required.' } })
    }) as unknown as typeof fetch;

    render(<RagHealthAlertsPage />);

    await waitFor(() => expect(screen.getByText('Access Denied')).toBeInTheDocument());
    expect(screen.getByText('Administrator privileges are required.')).toBeInTheDocument();
  });
});
