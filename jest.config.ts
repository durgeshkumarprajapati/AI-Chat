import type { Config } from 'jest';

const commonConfig = {
  preset: 'ts-jest',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|sass|scss)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/tests/mocks/file.mock.js'
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
        '<rootDir>/tests/phase40-*.test.ts',
        '<rootDir>/tests/phase41-*.test.ts',
        '<rootDir>/tests/phase42-*.test.ts',
        '<rootDir>/tests/phase43-*.test.ts',
        '<rootDir>/tests/phase44-*.test.ts',
        '<rootDir>/tests/phase45-*.test.ts',
        '<rootDir>/tests/phase46-*.test.ts',
        '<rootDir>/tests/phase47-*.test.ts',
        '<rootDir>/tests/phase47.1-*.test.ts',
        '<rootDir>/tests/phase48-*.test.ts',
        '<rootDir>/tests/phase49-*.test.ts'
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
