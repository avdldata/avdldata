import { describe, expect, it } from 'vitest';
import { isAllowed, parseRobots, robotsFromStatus } from '@/services/recipes/allerhande/robots';
import { allerhandeRecipeId, parseSitemap } from '@/services/recipes/allerhande/sitemap';
import { extractRecipeJsonLd } from '@/services/recipes/allerhande/jsonld';

describe('robots.txt volgens RFC 9309', () => {
  const text = `
    User-agent: *
    Disallow: /mijnlijst
    Disallow: /allerhande/recept/*/print$
    Allow: /allerhande/
    Crawl-delay: 2

    User-agent: weekmenu-prive-import
    Disallow: /allerhande/zoeken
    Crawl-delay: 8

    Sitemap: https://www.example.test/sitemap.xml
  `;

  it('gebruikt onze eigen groep als die er is, en anders die van *', () => {
    const ours = parseRobots(text, 'weekmenu-prive-import');
    expect(isAllowed(ours, '/allerhande/zoeken?q=pasta')).toBe(false);
    expect(isAllowed(ours, '/mijnlijst')).toBe(true); // niet in onze groep
    expect(ours.crawlDelaySeconds).toBe(8);

    const other = parseRobots(text, 'iets-anders');
    expect(isAllowed(other, '/mijnlijst')).toBe(false);
    expect(other.crawlDelaySeconds).toBe(2);
  });

  it('laat de langste regel winnen, met * en $', () => {
    const policy = parseRobots(text, 'iets-anders');
    expect(isAllowed(policy, '/allerhande/recept/R-R1/pasta')).toBe(true);
    expect(isAllowed(policy, '/allerhande/recept/R-R1/print')).toBe(false);
    expect(isAllowed(policy, '/allerhande/recept/R-R1/printbaar')).toBe(true);
  });

  it('bij gelijke lengte wint allow', () => {
    const policy = parseRobots('User-agent: *\nDisallow: /a\nAllow: /a', 'x');
    expect(isAllowed(policy, '/a')).toBe(true);
  });

  it('een lege Disallow verbiedt niets', () => {
    expect(isAllowed(parseRobots('User-agent: *\nDisallow:', 'x'), '/alles')).toBe(true);
  });

  it('4xx betekent geen regels, 5xx betekent alles verboden', () => {
    expect(isAllowed(robotsFromStatus(404), '/allerhande/')).toBe(true);
    expect(isAllowed(robotsFromStatus(503), '/allerhande/')).toBe(false);
  });

  it('onthoudt de sitemaps die de site noemt', () => {
    expect(parseRobots(text, 'x').sitemaps).toEqual(['https://www.example.test/sitemap.xml']);
  });
});

describe('sitemap', () => {
  it('leest een lijst pagina’s en een index van sitemaps', () => {
    const urlset = parseSitemap(
      `<?xml version="1.0"?><urlset><url><loc>https://www.ah.nl/allerhande/recept/R-R123/pasta</loc></url>
       <url><loc> https://www.ah.nl/allerhande/recept/R-R456/soep?x=1&amp;y=2 </loc></url></urlset>`,
    );
    expect(urlset.kind).toBe('urlset');
    expect(urlset.locations[1]).toBe('https://www.ah.nl/allerhande/recept/R-R456/soep?x=1&y=2');

    const index = parseSitemap(
      '<sitemapindex><sitemap><loc>https://www.ah.nl/s1.xml</loc></sitemap></sitemapindex>',
    );
    expect(index).toEqual({ kind: 'index', locations: ['https://www.ah.nl/s1.xml'] });
  });

  it('haalt het receptnummer uit de URL', () => {
    expect(allerhandeRecipeId('https://www.ah.nl/allerhande/recept/R-R1234567/iets')).toBe(
      'R-R1234567',
    );
    expect(allerhandeRecipeId('https://www.ah.nl/allerhande/thema/pasta')).toBeUndefined();
  });
});

describe('schema.org Recipe uit JSON-LD', () => {
  it('vindt het recept tussen andere blokken, ook in een @graph', () => {
    const html = `
      <script type="application/ld+json">{"@type":"Organization","name":"x"}</script>
      <script type='application/ld+json'>{"@graph":[{"@type":"WebSite"},{"@type":"Recipe","name":"Soep"}]}</script>`;
    expect(extractRecipeJsonLd(html)?.['name']).toBe('Soep');
  });

  it('slaat een kapot blok over zonder de rest op te geven', () => {
    const html = `
      <script type="application/ld+json">{ kapot </script>
      <script type="application/ld+json">[{"@type":["Recipe","Thing"],"name":"Stamppot"}]</script>`;
    expect(extractRecipeJsonLd(html)?.['name']).toBe('Stamppot');
  });

  it('geeft niets als er geen recept is — en raadt het niet uit de opmaak', () => {
    expect(extractRecipeJsonLd('<h1>Pasta</h1><ul><li>300 g pasta</li></ul>')).toBeUndefined();
  });
});
