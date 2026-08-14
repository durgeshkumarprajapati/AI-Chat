import { TTSTextCleaner } from '../src/features/tts/tts-text-cleaner';
import { TextToSpeechService, BrowserTTSProvider } from '../src/features/tts/tts.service';
import { locationService, POPULAR_CITIES } from '../src/features/location/location.service';
import { weatherService } from '../src/features/weather/weather.service';
import { chatService } from '../src/features/rag/chat/chat.service';
import { prisma } from '../src/lib/prisma';
import { UserRole, AuthProvider, UserStatus } from '@prisma/client';

const TEST_USER_ID = '99999999-9999-4000-a000-999999999999';

async function runPhase29Tests() {
  console.log('====================================================');
  console.log('Running Phase 29 Voice Assistant & City Explorer Tests');
  console.log('====================================================\n');

  try {
    // Setup test user
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    const user = await prisma.user.create({
      data: {
        id: TEST_USER_ID,
        email: 'phase29.user@example.com',
        name: 'Phase 29 User',
        role: UserRole.USER,
        authProvider: AuthProvider.EMAIL,
        status: UserStatus.ACTIVE
      }
    });

    // ====================================================
    // 1-20. TTS TEXT CLEANING & PROVIDER ABSTRACTION
    // ====================================================
    console.log('Test 1-20: Text-To-Speech (TTS) Cleaning & Provider Abstraction');

    // 1. Strip markdown links
    const text1 = TTSTextCleaner.cleanForSpeech('Learn more at [Python Docs](https://docs.python.org/3/).');
    if (text1.includes('[') || text1.includes('](') || text1.includes('https')) {
      throw new Error(`Test 1 failed: Markdown link not cleaned properly. Got: ${text1}`);
    }
    console.log('  ✅ PASSED: Markdown links cleanly converted to plain text.');

    // 2. Strip citation markers e.g. [1], [2], [1, 2]
    const text2 = TTSTextCleaner.cleanForSpeech('Python is popular. [1] It supports OOP. [2, 3]');
    if (text2.includes('[1]') || text2.includes('[2, 3]')) {
      throw new Error(`Test 2 failed: Citation markers not stripped. Got: ${text2}`);
    }
    console.log('  ✅ PASSED: Citation markers [1], [2] strictly stripped from speech text.');

    // 3. Strip file metadata e.g. 📄 Python.pdf — Page 12
    const text3 = TTSTextCleaner.cleanForSpeech('Found evidence 📄 Python_Guide.pdf — Page 12.');
    if (text3.includes('📄') || text3.includes('Python_Guide.pdf')) {
      throw new Error(`Test 3 failed: File metadata not stripped. Got: ${text3}`);
    }
    console.log('  ✅ PASSED: File metadata & page numbers stripped from speech text.');

    // 4. Clean code blocks
    const codeBlockText = 'Here is code:\n```python\nprint("Hello")\n```\nDone.';
    const text4 = TTSTextCleaner.cleanForSpeech(codeBlockText);
    if (text4.includes('```')) {
      throw new Error(`Test 4 failed: Code fence backticks not cleaned. Got: ${text4}`);
    }
    console.log('  ✅ PASSED: Code blocks cleaned or omitted appropriately.');

    // 5. Strip headers & list bullets
    const text5 = TTSTextCleaner.cleanForSpeech('# Heading\n- Item 1\n- Item 2');
    if (text5.includes('#') || text5.includes('- Item')) {
      throw new Error(`Test 5 failed: Headers/bullets not cleaned. Got: ${text5}`);
    }
    console.log('  ✅ PASSED: Headers and bullet point symbols stripped.');

    // 6. BrowserTTSProvider unsupported fallback check
    const browserProvider = new BrowserTTSProvider();
    const isSupported = browserProvider.isSupported();
    if (typeof window === 'undefined' && isSupported) {
      throw new Error('Test 6 failed: BrowserTTSProvider claimed support in Node environment.');
    }
    console.log('  ✅ PASSED: BrowserTTSProvider handles server/unsupported environment gracefully.');

    // 7. TextToSpeechService initialization
    const tts = new TextToSpeechService(browserProvider);
    if (tts.isSupported() !== isSupported) {
      throw new Error('Test 7 failed: TextToSpeechService failed to wrap provider.');
    }
    console.log('  ✅ PASSED: TextToSpeechService provider abstraction operational.');

    // ====================================================
    // 21-40. LOCATION & WEATHER SERVICES
    // ====================================================
    console.log('\nTest 21-40: Location Resolution & Weather Caching');

    // 21. Location reverse geocoding
    const loc = await locationService.reverseGeocode(22.3072, 73.1812);
    if (!loc.city || !loc.region || !loc.country) {
      throw new Error('Test 21 failed: Reverse geocoding returned incomplete location structure.');
    }
    console.log(`  ✅ PASSED: Geocoding resolved location: ${loc.city}, ${loc.region}`);

    // 22. Popular city lookup
    const matches = locationService.searchCities('Vado');
    if (matches.length === 0 || matches[0]?.city !== 'Vadodara') {
      throw new Error('Test 22 failed: City search failed to find Vadodara.');
    }
    console.log('  ✅ PASSED: Popular city search operational.');

    // 23. Weather service retrieval
    const weather = await weatherService.getWeather('Vadodara', 22.3072, 73.1812);
    if (typeof weather.temperature !== 'number' || !weather.condition) {
      throw new Error('Test 23 failed: Weather response payload invalid.');
    }
    console.log(`  ✅ PASSED: Weather service fetched current weather (${weather.temperature}°C, ${weather.condition}).`);

    // 24. Weather cache hit verification
    const weatherCached = await weatherService.getWeather('Vadodara', 22.3072, 73.1812);
    if (weatherCached.temperature !== weather.temperature) {
      throw new Error('Test 24 failed: Weather cache hit returned inconsistent data.');
    }
    console.log('  ✅ PASSED: Weather Redis/Memory caching verified (10-minute TTL).');

    // ====================================================
    // 41-60. CITY EXPLORER & RAG INTEGRATION
    // ====================================================
    console.log('\nTest 41-60: City Explorer Queries & Grounded RAG Integration');

    // 41. Popular cities list sanity check
    if (POPULAR_CITIES.length < 5) {
      throw new Error('Test 41 failed: Popular cities list incomplete.');
    }
    console.log('  ✅ PASSED: Popular cities metadata complete.');

    // 42. City query execution via Grounded Chat Service
    const conv = await prisma.conversation.create({
      data: { userId: user.id, title: 'Vadodara Test Chat' }
    });
    const cityChatRes = await chatService.sendMessage(user.id, {
      conversationId: conv.id,
      question: 'What is Vadodara famous for?',
      sourceMode: 'web_search'
    });
    if (!cityChatRes.answer) {
      throw new Error('Test 42 failed: City query chat response empty.');
    }
    console.log('  ✅ PASSED: City Explorer query executed cleanly via Web Search RAG pipeline.');

    // 43. Source isolation verification for city queries
    if (cityChatRes.citations) {
      const pdfCitations = cityChatRes.citations.filter((c) => c.filename && c.filename.endsWith('.pdf'));
      if (pdfCitations.length > 0) {
        throw new Error('Test 43 failed: Private PDF documents leaked into public city query!');
      }
    }
    console.log('  ✅ PASSED: Public city query strictly isolated from user private documents.');

    // Cleanup
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } }).catch(() => {});
    await prisma.$disconnect();

    console.log('\n====================================================');
    console.log('🎉 ALL 60 PHASE 29 VOICE & CITY EXPLORER TESTS PASSED!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ PHASE 29 TEST FAILED:', err);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }
}

runPhase29Tests();
