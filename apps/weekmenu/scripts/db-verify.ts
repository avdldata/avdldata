/**
 * Load the migrations and the seed into a PostgreSQL database.
 *
 * A script rather than a shell one-liner so it works the same in PowerShell,
 * cmd and a POSIX shell — `$DATABASE_URL` is Unix-only syntax and silently
 * passes the literal text on Windows.
 *
 * Needs `psql` on the PATH.
 *
 * Run with: pnpm db:verify
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    [
      'DATABASE_URL is niet gezet.',
      '',
      '  PowerShell : $env:DATABASE_URL = "postgres://localhost/weekmenu"',
      '  cmd        : set DATABASE_URL=postgres://localhost/weekmenu',
      '  bash/zsh   : export DATABASE_URL=postgres://localhost/weekmenu',
    ].join('\n'),
  );
  process.exit(1);
}

const files = [
  join('supabase', 'migrations', '0001_reference_data.sql'),
  join('supabase', 'migrations', '0002_household_data.sql'),
  join('supabase', 'migrations', '0003_rls.sql'),
  join('supabase', 'seed.sql'),
];

const missing = files.filter((file) => !existsSync(file));
if (missing.length > 0) {
  console.error(`Ontbrekende bestanden: ${missing.join(', ')}`);
  if (missing.some((file) => file.endsWith('seed.sql'))) {
    console.error('Genereer de seed eerst met: pnpm seed:sql');
  }
  process.exit(1);
}

for (const file of files) {
  console.log(`→ ${file}`);
  const result = spawnSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-q', '-f', file], {
    stdio: 'inherit',
    // Windows resolves psql.exe through the shell.
    shell: process.platform === 'win32',
  });

  if (result.error) {
    console.error(`Kon psql niet starten: ${result.error.message}`);
    console.error('Staat psql op je PATH? Installeer de PostgreSQL client tools.');
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`psql stopte met code ${result.status} op ${file}`);
    process.exit(result.status ?? 1);
  }
}

console.log('\nMigraties en seed geladen.');
