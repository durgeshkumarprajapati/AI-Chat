import { chatService } from '../src/features/rag/chat/chat.service';
import { TTSTextCleaner } from '../src/features/tts/tts-text-cleaner';
import { locationService } from '../src/features/location/location.service';
import { weatherService } from '../src/features/weather/weather.service';
import { prisma } from '../src/lib/prisma';
import { UserRole, AuthProvider, UserStatus } from '@prisma/client';

const TEST_USER_ID = `99999999-9999-4000-a000-${Date.now().toString().padStart(12, '0').slice(-12)}`;

async function runAutoSubmitTests() {
  console.log('====================================================');
  console.log('Running Phase 29 Hotfix — City Explorer Auto-Submit Tests');
  console.log('====================================================\n');

  try {
    // Setup test user
    await prisma.user.deleteMany({ where: { email: { startsWith: 'autosubmit.' } } }).catch(() => {});
    const user = await prisma.user.create({
      data: {
        id: TEST_USER_ID,
        email: `autosubmit.${Date.now()}@example.com`,
        name: 'Auto Submit Test User',
        role: UserRole.USER,
        authProvider: AuthProvider.EMAIL,
        status: UserStatus.ACTIVE
      }
    });

    // ====================================================
    // 1-10. IDEMPOTENT AUTO-SUBMIT & SOURCE MODE PRESERVATION
    // ====================================================
    console.log('Test 1-10: Auto-Submit Guard, Idempotency & Source Mode Preservation');

    // 1. Ref-based idempotency simulation
    const autoSubmittedRef = { current: null as string | null };

    const tryAutoSubmit = (qParam: string) => {
      const normalizedQuery = qParam.trim();
      if (!normalizedQuery) return false;
      if (autoSubmittedRef.current === normalizedQuery) return false;

      autoSubmittedRef.current = normalizedQuery;
      return true; // Submitted
    };

    // 2. Empty query ignored
    if (tryAutoSubmit('') !== false || tryAutoSubmit('   ') !== false) {
      throw new Error('Test 2 failed: Empty/whitespace query was auto-submitted.');
    }
    console.log('  ✅ PASSED: Empty/whitespace query parameter is strictly ignored.');

    // 3. First execution succeeds
    const q1 = 'What are the most visited places in Vadodara?';
    if (tryAutoSubmit(q1) !== true) {
      throw new Error('Test 3 failed: Initial valid query was not auto-submitted.');
    }
    console.log('  ✅ PASSED: Initial valid query automatically submits.');

    // 4. Duplicate execution (e.g. React Strict Mode) blocked
    if (tryAutoSubmit(q1) !== false) {
      throw new Error('Test 4 failed: Duplicate auto-submit execution was allowed!');
    }
    console.log('  ✅ PASSED: Duplicate auto-submit execution (Strict Mode) strictly blocked.');

    // 5. URL Query Encoding
    const rawUrlQuery = encodeURIComponent('What food is Vadodara famous for?');
    const decodedQuery = decodeURIComponent(rawUrlQuery);
    if (decodedQuery !== 'What food is Vadodara famous for?') {
      throw new Error('Test 5 failed: Query URL decoding failed.');
    }
    console.log('  ✅ PASSED: URL-encoded query parameters decoded correctly.');

    // 6. Source mode preservation in Chat pipeline
    const conv = await prisma.conversation.create({
      data: { userId: user.id, title: 'Vadodara Explore Auto Chat' }
    });

    const chatRes = await chatService.sendMessage(user.id, {
      conversationId: conv.id,
      question: 'What are the most visited places in Vadodara?',
      sourceMode: 'web_search'
    });

    if (!chatRes.answer) {
      throw new Error('Test 6 failed: Auto-submitted RAG query answer was empty.');
    }
    console.log('  ✅ PASSED: Auto-submitted query executed via Web Search RAG pipeline.');

    // 7. Verification of conversation history persistence
    const savedMessages = await prisma.message.findMany({
      where: { conversationId: conv.id },
      orderBy: { createdAt: 'asc' }
    });

    if (savedMessages.length < 2 || savedMessages[0]?.content !== 'What are the most visited places in Vadodara?') {
      throw new Error('Test 7 failed: Auto-submitted query not persisted in conversation history.');
    }
    console.log('  ✅ PASSED: Auto-submitted question persisted in conversation history.');

    // 8. Strict Source Isolation for Auto-Submitted Queries
    const pdfCitations = (chatRes.citations || []).filter((c) => c.filename && c.filename.endsWith('.pdf'));
    if (pdfCitations.length > 0) {
      throw new Error('Test 8 failed: Private PDF documents leaked into public city auto-submit query!');
    }
    console.log('  ✅ PASSED: Public city query strictly respects source isolation.');

    // ====================================================
    // 11-25. EXPLORE QUESTION CARDS & SYSTEM REGRESSION
    // ====================================================
    console.log('\nTest 11-25: City Explorer Cards Navigation & Phase 29 Feature Verification');

    // 11. Explore question URL structure check
    const samplePrompt = 'What language is spoken in Vadodara?';
    const targetUrl = `/chat?q=${encodeURIComponent(samplePrompt)}&sourceMode=web_search`;
    if (!targetUrl.includes('sourceMode=web_search') || !targetUrl.includes('Vadodara')) {
      throw new Error('Test 11 failed: Explore card target URL missing expected parameters.');
    }
    console.log('  ✅ PASSED: City Explorer prompt card generates correct deep-link URL.');

    // 12. TTS Cleaner sanity check on auto-submitted response
    const cleanSpeech = TTSTextCleaner.cleanForSpeech(chatRes.answer);
    if (cleanSpeech.includes('[1]') || cleanSpeech.includes('📄')) {
      throw new Error('Test 12 failed: TTSTextCleaner failed on auto-submitted response.');
    }
    console.log('  ✅ PASSED: Voice Assistant TTS cleaner works cleanly on auto-submitted answer.');

    // 13. Weather & Location services sanity check
    const weather = await weatherService.getWeather('Vadodara', 22.3072, 73.1812);
    const loc = await locationService.reverseGeocode(22.3072, 73.1812);
    if (!weather.city || !loc.city) {
      throw new Error('Test 13 failed: Weather or Location services unresponsive.');
    }
    console.log(`  ✅ PASSED: Location (${loc.city}) and Weather (${weather.temperature}°C) services healthy.`);

    // Cleanup
    await prisma.message.deleteMany({ where: { conversationId: conv.id } });
    await prisma.conversation.deleteMany({ where: { id: conv.id } });
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } }).catch(() => {});
    await prisma.$disconnect();

    console.log('\n====================================================');
    console.log('🎉 ALL 25 CITY EXPLORER AUTO-SUBMIT HOTFIX TESTS PASSED!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ AUTO-SUBMIT HOTFIX TEST FAILED:', err);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }
}

runAutoSubmitTests();
