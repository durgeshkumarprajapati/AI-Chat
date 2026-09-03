import type { Config } from 'jest';

const commonConfig = {
  preset: 'ts-jest',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|sass|scss)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/tests/mocks/file.mock.js',
    // Phase 91.9 — the worker package compiles under NodeNext (worker/tsconfig.json), which
    // requires explicit ".js" extensions on relative imports even though the source files are
    // ".ts". Jest's resolver (unlike ts-node/tsc-alias at runtime) doesn't know to map that back
    // to the real ".ts" file, so any test importing worker/src/** directly failed to resolve
    // those relative imports. This strips a trailing ".js" from relative specifiers only —
    // existing "@/*"-aliased and bare-package imports are untouched.
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  setupFiles: ['<rootDir>/jest.presetup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2022',
          module: 'commonjs',
          moduleResolution: 'node',
          jsx: 'react-jsx',
          esModuleInterop: true,
          skipLibCheck: true,
          baseUrl: '.',
          paths: {
            '@/*': ['./src/*']
          }
        }
      }
    ]
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/generated/**',
    '!**/node_modules/**'
  ],
  coverageReporters: ['text', 'lcov', 'json-summary']
};

const config: Config = {
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/tests/unit/**/*.test.ts',
        '<rootDir>/tests/integration/**/*.test.ts',
        '<rootDir>/tests/api/**/*.test.ts',
        '<rootDir>/tests/security/**/*.test.ts',
        '<rootDir>/tests/phase4[0-9]*.test.ts',
        '<rootDir>/tests/phase5[0-9]*.test.ts',
        '<rootDir>/tests/phase[6-9][0-9]*.test.ts',
        '<rootDir>/tests/phase*.spec.ts'
      ],
      ...commonConfig
    },
    {
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/tests/components/**/*.test.tsx'],
      ...commonConfig
    }
  ]
};

export default config;
