/**
 * robots.txt, read the way RFC 9309 says a crawler must read it.
 *
 * The importer asks this module one question before every request — may this
 * agent fetch this path? — and never decides that for itself. Three rules from
 * the RFC do the work:
 *
 *   - The group for our own product token wins; the `*` group applies only
 *     when no group names us. Groups naming the same agent are merged.
 *   - Among matching rules the longest pattern wins; on a tie, allow wins.
 *     Patterns support `*` (any characters) and a trailing `$` (end of path).
 *   - What happens when the file cannot be read depends on why: a 4xx means
 *     "no rules", a 5xx or a network failure means "assume everything is
 *     disallowed" — see `robotsFromStatus`.
 *
 * `Crawl-delay` is not in the RFC, but it is the site telling us how fast it
 * wants to be visited, so it is honoured when present.
 */

export interface RobotsRule {
  readonly allow: boolean;
  readonly pattern: string;
}

export interface RobotsPolicy {
  /** Rules that apply to our agent, already merged. */
  readonly rules: readonly RobotsRule[];
  /** Seconds between requests, when the site asks for one. */
  readonly crawlDelaySeconds?: number;
  /** Everything disallowed, because the file could not be read (5xx/network). */
  readonly disallowAll?: boolean;
  /** Sitemap URLs the file advertises. */
  readonly sitemaps: readonly string[];
}

interface Group {
  agents: string[];
  rules: RobotsRule[];
  crawlDelaySeconds?: number;
}

export function parseRobots(text: string, productToken: string): RobotsPolicy {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | undefined;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (line === '') continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }
    if (field === 'user-agent') {
      // Consecutive user-agent lines share one group.
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === 'allow' || field === 'disallow') {
      // An empty Disallow means "nothing is disallowed" and adds no rule.
      if (value === '') continue;
      current.rules.push({ allow: field === 'allow', pattern: value });
    } else if (field === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelaySeconds = seconds;
    }
  }

  const token = productToken.toLowerCase();
  const ours = groups.filter((g) => g.agents.includes(token));
  const chosen = ours.length > 0 ? ours : groups.filter((g) => g.agents.includes('*'));
  const delays = chosen.map((g) => g.crawlDelaySeconds).filter((d): d is number => d !== undefined);

  return {
    rules: chosen.flatMap((g) => g.rules),
    ...(delays.length > 0 ? { crawlDelaySeconds: Math.max(...delays) } : {}),
    sitemaps,
  };
}

/** The policy for a robots.txt that could not be read, per RFC 9309 §2.3.1. */
export function robotsFromStatus(status: number): RobotsPolicy {
  // 4xx: the file is unavailable and the crawler may access any resource.
  if (status >= 400 && status < 500) return { rules: [], sitemaps: [] };
  // 5xx (and anything else unexpected): the site may be unreachable, so
  // everything is treated as disallowed.
  return { rules: [], sitemaps: [], disallowAll: true };
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/** May the agent fetch this path (with query string)? */
export function isAllowed(policy: RobotsPolicy, pathWithQuery: string): boolean {
  if (policy.disallowAll) return false;
  let best: RobotsRule | undefined;
  for (const rule of policy.rules) {
    if (!patternToRegExp(rule.pattern).test(pathWithQuery)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}
