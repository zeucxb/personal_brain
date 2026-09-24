export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
  source: string; // e.g. "wikipedia.org", "g1.globo.com"
};

/**
 * Decodes common HTML entities found in search result snippets.
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .trim();
}

/**
 * Cleans user query to generate optimal search terms.
 * Strips conversational prefixes like "pesquise na web sobre", "procure na internet por", etc.
 */
export function extractSearchKeywords(rawQuery: string): string {
  let cleaned = rawQuery.trim();

  const prefixes = [
    /^(por favor\s+)?(pesquise|busque|procure|pesquisar|buscar|procurar)(\s+na\s+web|\s+na\s+internet|\s+no\s+google|\s+online)?(\s+sobre|\s+por)?\s+/i,
    /^(o que é|quem é|qual é|como funciona|me fale sobre|resumo sobre|resuma)\s+/i,
  ];

  for (const prefix of prefixes) {
    if (prefix.test(cleaned)) {
      cleaned = cleaned.replace(prefix, '').trim();
      break;
    }
  }

  return cleaned.length > 2 ? cleaned : rawQuery;
}

/**
 * Detects if the user prompt explicitly requests a web / internet search.
 */
export function detectWebSearchIntent(text: string): boolean {
  const normalized = text.toLowerCase();
  const searchTriggers = [
    'pesquise na web',
    'pesquisar na web',
    'busque na web',
    'buscar na web',
    'procure na web',
    'procurar na web',
    'pesquise na internet',
    'pesquisar na internet',
    'busque na internet',
    'buscar na internet',
    'procure na internet',
    'procurar na internet',
    'procure no google',
    'buscar no google',
    'pesquisar no google',
    'pesquise online',
    'pesquisar online',
    'busca web',
    'web search',
  ];

  return searchTriggers.some((trigger) => normalized.includes(trigger));
}

/**
 * Searches DuckDuckGo (HTML endpoint, zero-config, no API key required).
 */
async function searchDuckDuckGo(query: string, limit = 5): Promise<WebSearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`DuckDuckGo returned status ${res.status}`);
      return [];
    }

    const html = await res.text();
    const blocks = html.split(/class=["']result results_links results_links_deep web-result/);
    const results: WebSearchResult[] = [];

    for (let i = 1; i < blocks.length; i++) {
      if (results.length >= limit) break;
      const block = blocks[i];

      const linkMatch = block.match(
        /<a[^>]*class=["']result__a["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i
      );
      const snippetMatch = block.match(
        /<a[^>]*class=["']result__snippet["'][^>]*>([\s\S]*?)<\/a>/i
      );

      if (linkMatch) {
        let rawHref = linkMatch[1];
        let realUrl = rawHref;

        const uddgMatch = rawHref.match(/[?&]uddg=([^&]+)/);
        if (uddgMatch) {
          try {
            realUrl = decodeURIComponent(uddgMatch[1]);
          } catch (e) {
            // Keep original if decode fails
          }
        }

        // Filter out non-http links or DDG internal links
        if (!realUrl.startsWith('http')) continue;

        const rawTitle = linkMatch[2].replace(/<[^>]+>/g, '').trim();
        const rawSnippet = snippetMatch
          ? snippetMatch[1].replace(/<[^>]+>/g, '').trim()
          : '';

        const title = decodeHtmlEntities(rawTitle);
        const snippet = decodeHtmlEntities(rawSnippet);

        let domain = 'web';
        try {
          domain = new URL(realUrl).hostname.replace(/^www\./, '');
        } catch (e) {
          // fallback
        }

        if (title && snippet) {
          results.push({
            title,
            url: realUrl,
            source: domain,
            snippet,
          });
        }
      }
    }

    return results;
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error('Error during DuckDuckGo search:', err?.message || err);
    return [];
  }
}

/**
 * Searches Tavily API if TAVILY_API_KEY environment variable is configured.
 */
async function searchTavily(query: string, limit = 5): Promise<WebSearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: limit,
      }),
    });
    clearTimeout(timeoutId);

    if (!res.ok) return [];
    const data = await res.json();

    return (data.results || []).map((item: any) => {
      let domain = 'web';
      try {
        domain = new URL(item.url).hostname.replace(/^www\./, '');
      } catch (e) {}

      return {
        title: item.title,
        url: item.url,
        source: domain,
        snippet: item.content || '',
      };
    });
  } catch (err) {
    clearTimeout(timeoutId);
    return [];
  }
}

/**
 * Unified Web Search Tool.
 * Prioritizes configured API keys (Tavily), falling back seamlessly to DuckDuckGo.
 */
export async function searchWeb(
  rawQuery: string,
  limit = 5
): Promise<WebSearchResult[]> {
  const query = extractSearchKeywords(rawQuery);

  // 1. Try Tavily if configured
  if (process.env.TAVILY_API_KEY) {
    const tavilyResults = await searchTavily(query, limit);
    if (tavilyResults.length > 0) {
      return tavilyResults;
    }
  }

  // 2. Default to DuckDuckGo (Free, zero-config)
  return await searchDuckDuckGo(query, limit);
}
