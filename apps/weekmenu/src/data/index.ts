import 'server-only';
import { createDemoRepositories } from './demo/demo-repositories';
import { createSupabaseRepositories, isSupabaseConfigured } from './supabase/supabase-repositories';
import type { Repositories } from './repositories/types';

let cached: Repositories | undefined;

/**
 * Pick the data adapter.
 *
 * Demo mode is the default and needs nothing: the app runs entirely on the
 * seeded catalogue plus a local JSON file. Set `DATA_ADAPTER=supabase` with the
 * two Supabase environment variables to switch to Postgres with row level
 * security — the interfaces are identical, so no calling code changes.
 */
export function getRepositories(): Repositories {
  if (cached) return cached;
  const adapter = process.env.DATA_ADAPTER ?? 'demo';
  if (adapter === 'supabase') {
    if (!isSupabaseConfigured()) {
      throw new Error(
        'DATA_ADAPTER=supabase requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY',
      );
    }
    cached = createSupabaseRepositories();
  } else {
    cached = createDemoRepositories();
  }
  return cached;
}

export type { Repositories };
