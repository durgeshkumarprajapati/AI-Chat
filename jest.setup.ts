import '@testing-library/jest-dom';

// 1. Ensure NODE_ENV is set to test
(process.env as Record<string, string>).NODE_ENV = 'test';

// 2. Safety check against production DB or Kimi API key usage in tests
const dbUrl = process.env.DATABASE_URL || '';
if (dbUrl.includes('prod') && !dbUrl.includes('test')) {
  throw new Error('[TEST SAFETY GUARD] Refusing to run tests against a production database URL!');
}

// 3. Polyfill TextEncoder & TextDecoder for JSDOM environment if needed
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// 4. Polyfill Request, Response, Headers, fetch for JSDOM if needed
const globalAny = global as Record<string, any>;
if (typeof global.Request === 'undefined' && globalAny.__nativeRequest) {
  global.Request = globalAny.__nativeRequest;
  global.Response = globalAny.__nativeResponse;
  global.Headers = globalAny.__nativeHeaders;
  global.fetch = globalAny.__nativeFetch;
}

// 5. Controlled mocks for next/navigation
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn()
    };
  },
  useSearchParams() {
    return new URLSearchParams();
  },
  usePathname() {
    return '/';
  },
  useParams() {
    return {};
  }
}));

// 6. Global cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});
