import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * The layer rule below is the structural guarantee behind this codebase:
 * `src/domain/**` is pure, deterministic TypeScript. It may not reach into
 * React, Next, the database, the UI, or the seed data. Everything the
 * optimizer needs is passed in as an argument.
 */
const domainLayerRule = {
  files: ['src/domain/**/*.ts'],
  ignores: ['src/domain/**/*.test.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [
              'react',
              'react-dom',
              'next',
              'next/*',
              'server-only',
              '@supabase/*',
              '@/app',
              '@/app/**',
              '@/features',
              '@/features/**',
              '@/data',
              '@/data/**',
              '@/services',
              '@/services/**',
              '@/providers',
              '@/providers/**',
              '@/components',
              '@/components/**',
              '**/src/data/**',
              '**/src/app/**',
              '**/src/features/**',
              '**/src/services/**',
            ],
            message:
              'src/domain must stay pure: no React, Next, database or UI imports. Pass data in as arguments.',
          },
        ],
      },
    ],
    'no-restricted-globals': [
      'error',
      { name: 'window', message: 'domain code must not touch the browser.' },
      { name: 'document', message: 'domain code must not touch the browser.' },
      { name: 'localStorage', message: 'domain code must not touch the browser.' },
    ],
    'no-restricted-properties': [
      'error',
      {
        object: 'Math',
        property: 'random',
        message: 'The optimizer must be deterministic — no randomness in domain code.',
      },
    ],
  },
};

/**
 * The exhaustive reference solver exists to measure the production optimizer,
 * not to run beside it. Its cost grows as C(n, 7), so a stray import from a
 * page would turn a snappy screen into a hang under exactly the conditions
 * nobody tests: a large catalogue. Tests, benchmarks and scripts may use it;
 * everything that ships to a user may not.
 */
const referenceSolverRule = {
  files: [
    'src/app/**/*.{ts,tsx}',
    'src/features/**/*.{ts,tsx}',
    'src/services/**/*.ts',
    'src/data/**/*.ts',
  ],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [
              '@/domain/optimization/reference-solver',
              '**/domain/optimization/reference-solver',
            ],
            message:
              'The exhaustive solver is for tests and benchmarks only — it is exponential by design. Use optimiseWeek.',
          },
        ],
      },
    ],
  },
};

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      // Downloaded third-party corpora and generated snapshots. They are data,
      // not source: linting them says nothing about this codebase and buries
      // real findings under one warning per recipe file.
      'data/**',
    ],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  domainLayerRule,
  referenceSolverRule,
  {
    // Seed and build scripts are command-line tools; printing is the point.
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
];

export default config;
