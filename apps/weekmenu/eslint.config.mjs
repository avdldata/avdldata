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
];

export default config;
