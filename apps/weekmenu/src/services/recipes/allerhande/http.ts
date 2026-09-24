import type { HttpGet } from './crawl';

/**
 * The crawl's HTTP, on Node's own fetch.
 *
 * Nothing clever on purpose: the headers the crawl passes are the headers that
 * are sent. No cookie jar, no browser impersonation, no proxy — if the site
 * does not answer a plainly identified client, the answer is a stop, not a
 * disguise.
 */
export const nodeFetchHttp: HttpGet = async (url, headers) => {
  const response = await fetch(url, { headers: { ...headers }, redirect: 'follow' });
  return {
    status: response.status,
    header: (name) => response.headers.get(name),
    text: () => response.text(),
    bytes: async () => new Uint8Array(await response.arrayBuffer()),
  };
};

/** Who we are, in the User-Agent and in robots.txt. */
export const ALLERHANDE_PRODUCT_TOKEN = 'weekmenu-prive-import';
export const ALLERHANDE_USER_AGENT = `${ALLERHANDE_PRODUCT_TOKEN}/1.0 (persoonlijke receptenimport; één verzoek per paar seconden)`;
