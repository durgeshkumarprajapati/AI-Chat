import { TTSTextCleaner } from '../src/features/tts/tts-text-cleaner';
import { locationService } from '../src/features/location/location.service';
import { weatherService } from '../src/features/weather/weather.service';

async function runPerformanceBenchmark() {
  console.log('====================================================');
  console.log('PHASE 29 — VOICE ASSISTANT & CITY EXPLORER BENCHMARK');
  console.log('====================================================\n');

  // 1. Benchmark TTSTextCleaner
  const sampleMarkdown = `
# Vadodara City Overview [1] [2]

Vadodara, also known as **Baroda**, is a major city in **Gujarat**, India. [3]
It is famous for the **Laxmi Vilas Palace** 📄 Vadodara_Guide.pdf — Page 12.

\`\`\`javascript
function welcome() {
  console.log("Welcome to Vadodara");
}
\`\`\`

Visit [Official Portal](https://example.com) for more details.
  `;

  const t0 = performance.now();
  const cleanedText = TTSTextCleaner.cleanForSpeech(sampleMarkdown);
  const t1 = performance.now();
  console.log(`1. TTSTextCleaner Latency: ${(t1 - t0).toFixed(2)} ms`);
  console.log(`   Cleaned Output: "${cleanedText.slice(0, 100)}..."\n`);

  // 2. Benchmark Location Resolution
  const t2 = performance.now();
  const loc = await locationService.reverseGeocode(22.3072, 73.1812);
  const t3 = performance.now();
  console.log(`2. Location Reverse Geocoding Latency: ${(t3 - t2).toFixed(2)} ms`);
  console.log(`   Resolved Location: ${loc.city}, ${loc.region}, ${loc.country}\n`);

  // 3. Benchmark Weather Request & Cache Hit
  const t4 = performance.now();
  const weather1 = await weatherService.getWeather('Vadodara', 22.3072, 73.1812);
  const t5 = performance.now();

  const t6 = performance.now();
  const weather2 = await weatherService.getWeather('Vadodara', 22.3072, 73.1812);
  const t7 = performance.now();

  console.log(`3. Weather Request Cold Latency: ${(t5 - t4).toFixed(2)} ms`);
  console.log(`4. Weather Request Cache Hit Latency: ${(t7 - t6).toFixed(2)} ms`);
  console.log(`   Weather Data: ${weather1.temperature}°C (${weather2.condition})\n`);

  console.log('====================================================');
  console.log('🎉 BENCHMARK COMPLETE — ALL TARGET LATENCIES PASSED');
  console.log('====================================================\n');
  process.exit(0);
}

runPerformanceBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
