import { callHistoryMapper } from '../src/features/collaboration/call-history/call-history.mapper';
import { mockTestSessionService } from '../src/features/mock-tests/mock-test-session.service';
import { CallStatus } from '@prisma/client';

async function runBenchmark() {
  console.log('=== Running Phase 50 Call History & Mock Test Library Benchmark ===');

  const mockSession = {
    id: 'call_bm_1',
    channelId: 'ch_bm_1',
    hostId: 'usr_bm_1',
    type: 'VIDEO',
    status: CallStatus.ENDED,
    startedAt: new Date('2026-08-20T10:00:00Z'),
    endedAt: new Date('2026-08-20T10:25:00Z'),
    durationSeconds: 1500,
    createdAt: new Date('2026-08-20T10:00:00Z'),
    channel: { name: 'Benchmark Group', type: 'GROUP' },
    host: { name: 'Benchmark Host', avatarUrl: null },
    participants: [
      { userId: 'usr_bm_1', status: CallStatus.ENDED, user: { name: 'Host', email: 'host@bm.com' } },
      { userId: 'usr_bm_2', status: CallStatus.ENDED, user: { name: 'Peer', email: 'peer@bm.com' } }
    ]
  };

  const runs = 1000;
  const startMapper = performance.now();
  for (let i = 0; i < runs; i++) {
    callHistoryMapper.mapToDTO(mockSession);
  }
  const mapperDuration = performance.now() - startMapper;
  console.log(`Call History DTO Mapper: ${runs} runs in ${mapperDuration.toFixed(2)}ms (${(mapperDuration / runs).toFixed(4)}ms / run)`);

  const mockQuestions: any = Array.from({ length: 20 }).map((_, idx) => ({
    id: `q_${idx}`,
    questionText: `Question ${idx}?`,
    type: 'MCQ_SINGLE',
    options: [
      { id: `o_${idx}_1`, optionText: 'Option 1', isCorrect: true },
      { id: `o_${idx}_2`, optionText: 'Option 2', isCorrect: false }
    ],
    correctOptionId: `o_${idx}_1`,
    explanation: 'Explanation for question'
  }));

  const startSanitize = performance.now();
  for (let i = 0; i < runs; i++) {
    mockTestSessionService.sanitizeQuestionsForClient(mockQuestions);
  }
  const sanitizeDuration = performance.now() - startSanitize;
  console.log(`Answer Security Question Sanitizer: ${runs} runs in ${sanitizeDuration.toFixed(2)}ms (${(sanitizeDuration / runs).toFixed(4)}ms / run)`);

  if (mapperDuration / runs < 0.1 && sanitizeDuration / runs < 0.1) {
    console.log('✅ BENCHMARK PASSED: Phase 50 Call History DTO mapping and Answer Security Sanitization are under target (<0.1ms).');
  } else {
    console.error('❌ BENCHMARK FAILED: Performance target exceeded.');
    process.exit(1);
  }
}

runBenchmark().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
