import 'server-only';

/**
 * Which catalogue the running app prices a week with.
 *
 * There are exactly two, and the difference matters to the person reading the
 * total: `REAL` is the Albert Heijn, Jumbo and Lidl catalogue as it was
 * captured in a snapshot; `DEMO` is a synthetic catalogue that is shaped to be
 * plausible and is not anybody's actual price.
 *
 * ## No silent fallback, ever
 *
 * The tempting behaviour when the real snapshot is missing is to quietly use
 * the demo one so the app keeps working. That would present invented prices as
 * real, which is the one failure this project cannot accept: everything else
 * shows a symptom, and this shows a number that looks right.
 *
 * So a missing snapshot in `REAL` mode is an error the user sees, not a
 * degradation they do not.
 */
export type DataMode = 'REAL' | 'DEMO';

export const DEFAULT_DATA_MODE: DataMode = 'REAL';

/**
 * The mode this process runs in.
 *
 * `DATA_MODE=DEMO` opts out — for tests, for a demo without the snapshot on
 * disk, and for development on a machine that does not carry 45 MB of
 * catalogue. Anything else, including an unset variable, is `REAL`.
 */
export function dataMode(): DataMode {
  const raw = (process.env.DATA_MODE ?? '').trim().toUpperCase();
  if (raw === 'DEMO') return 'DEMO';
  if (raw === 'REAL' || raw === '') return DEFAULT_DATA_MODE;
  throw new Error(`DATA_MODE moet REAL of DEMO zijn, niet "${process.env.DATA_MODE}"`);
}
