import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Start every end-to-end run from an empty demo store. */
export default async function globalSetup(): Promise<void> {
  await rm(resolve(process.cwd(), '.data/e2e'), { recursive: true, force: true });
}
