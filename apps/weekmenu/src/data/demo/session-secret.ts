import 'server-only';
import { randomBytes } from 'node:crypto';
import { read, write } from './file-store';

/**
 * The key that demo sessions are signed with.
 *
 * Generated once per store and kept beside the data it protects. A demo
 * installation has no configured secret and should not need one to be safe
 * against the obvious attack, which is editing a cookie by hand.
 */
export async function sessionSecret(): Promise<string> {
  const existing = await read((db) => db.sessionSecret);
  if (existing) return existing;
  return write((db) => {
    db.sessionSecret ??= randomBytes(32).toString('hex');
    return db.sessionSecret;
  });
}
