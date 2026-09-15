import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Which catalogue the app prices with, and the one behaviour that must never
 * exist: a quiet fall back to demo data when the real snapshot is missing.
 *
 * Every other failure in this project announces itself. This one would not: the
 * user would see a total that looks exactly like a real one and is invented.
 */
const original = process.env.DATA_MODE;
afterEach(() => {
  if (original === undefined) delete process.env.DATA_MODE;
  else process.env.DATA_MODE = original;
  vi.resetModules();
});

async function loadMode() {
  vi.resetModules();
  return (await import('@/config/data-mode')).dataMode();
}

describe('dataMode', () => {
  it('is REAL when nothing says otherwise', async () => {
    delete process.env.DATA_MODE;
    expect(await loadMode()).toBe('REAL');
  });

  it('honours an explicit DEMO', async () => {
    process.env.DATA_MODE = 'DEMO';
    expect(await loadMode()).toBe('DEMO');
    process.env.DATA_MODE = 'demo';
    expect(await loadMode()).toBe('DEMO');
  });

  it('refuses a value it does not understand instead of picking one', async () => {
    process.env.DATA_MODE = 'ECHT';
    await expect(loadMode()).rejects.toThrow(/REAL of DEMO/);
  });
});

describe('a missing snapshot', () => {
  it('raises an error rather than substituting demo prices', async () => {
    vi.resetModules();
    const mod = await import('@/providers/real-data-provider');
    mod.resetRealCatalogueCache();
    expect(() => mod.buildRealCatalogue('data/external/bestaat-niet.json')).toThrow(
      mod.RealDataUnavailableError,
    );
    // And the message says what to do, rather than only what went wrong.
    expect(() => mod.buildRealCatalogue('data/external/bestaat-niet.json')).toThrow(
      /verzonnen prijs/,
    );
  });

  it('reports availability without throwing', async () => {
    const mod = await import('@/providers/real-data-provider');
    expect(mod.realSnapshotAvailable('data/external/bestaat-niet.json')).toBe(false);
    expect(mod.realSnapshotCapturedAt('data/external/bestaat-niet.json')).toBeUndefined();
  });
});
