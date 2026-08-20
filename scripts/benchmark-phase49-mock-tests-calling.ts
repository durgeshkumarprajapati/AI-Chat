import { googleCalendarService } from '../src/features/calendar/google-calendar.service';

async function runBenchmark() {
  console.log('=== Running Phase 49 Mock Tests & Calendar Benchmark ===');

  const startTime = new Date('2026-09-01T10:00:00Z');
  const endTime = new Date('2026-09-01T10:30:00Z');

  const runs = 1000;
  const startUrlMs = performance.now();
  for (let i = 0; i < runs; i++) {
    googleCalendarService.generateGoogleCalendarUrl({
      title: 'Benchmark Event',
      startTime,
      endTime
    });
  }
  const endUrlMs = performance.now();
  const urlAvg = (endUrlMs - startUrlMs) / runs;
  console.log(`Google Calendar URL Generation: ${runs} runs in ${(endUrlMs - startUrlMs).toFixed(2)}ms (${urlAvg.toFixed(4)}ms / run)`);

  const startIcsMs = performance.now();
  for (let i = 0; i < runs; i++) {
    googleCalendarService.generateICalendarFile({
      title: 'Benchmark Event',
      startTime,
      endTime
    });
  }
  const endIcsMs = performance.now();
  const icsAvg = (endIcsMs - startIcsMs) / runs;
  console.log(`.ics iCalendar File Generation: ${runs} runs in ${(endIcsMs - startIcsMs).toFixed(2)}ms (${icsAvg.toFixed(4)}ms / run)`);

  if (urlAvg < 0.1 && icsAvg < 0.1) {
    console.log('✅ BENCHMARK PASSED: Phase 49 Calendar & Mock Test generation performance is well within target (<0.1ms).');
    process.exit(0);
  } else {
    console.error('❌ BENCHMARK FAILED: Performance exceeded target thresholds.');
    process.exit(1);
  }
}

runBenchmark().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
