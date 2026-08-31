/**
 * CRW (fastCRW) Client — Web Scraper & Crawler API Wrapper
 *
 * Wraps the CRW REST API for web scraping, crawling, searching, and mapping.
 * Supports both self-hosted (http://localhost:3000) and cloud (https://api.fastcrw.com).
 *
 * CRW Repo: https://github.com/us/crw
 * API Docs: https://docs.fastcrw.com
 *
 * Install self-hosted: curl -fsSL https://fastcrw.com/install | sh
 */

const DEFAULT_BASE_URL = 'http://localhost:3000';
const CLOUD_BASE_URL = 'https://api.fastcrw.com';

/**
 * Creates a CRW client instance.
 *
 * @param {Object} options
 * @param {string} [options.apiKey] - CRW API key (required for cloud, optional for self-hosted)
 * @param {string} [options.baseUrl] - CRW server base URL (default: http://localhost:3000)
 * @returns {Object} CRW client with scrape, search, crawl, map methods
 */
export function createCRWClient(options = {}) {
  const apiKey = options.apiKey || process.env.CRW_API_KEY || '';
  const baseUrl = (options.baseUrl || process.env.CRW_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');

  const headers = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  /**
   * Makes a POST request to a CRW endpoint.
   */
  async function post(endpoint, body) {
    const url = `${baseUrl}${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`CRW ${endpoint} failed (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Makes a GET request to a CRW endpoint.
   */
  async function get(endpoint) {
    const url = `${baseUrl}${endpoint}`;
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`CRW GET ${endpoint} failed (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  return {
    /**
     * Checks if CRW server is reachable.
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
      try {
        const response = await fetch(`${baseUrl}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000),
        });
        return response.ok;
      } catch {
        return false;
      }
    },

    /**
     * Scrape a single URL and return clean markdown or structured data.
     *
     * POST /v1/scrape
     *
     * @param {string} url - URL to scrape
     * @param {Object} [options]
     * @param {string[]} [options.formats=['markdown']] - Output formats: 'markdown', 'html', 'links', 'json', 'plainText'
     * @param {boolean} [options.onlyMainContent=true] - Strip navigation/footer/boilerplate
     * @param {boolean|null} [options.renderJs=null] - null=auto, true=force browser, false=HTTP-only
     * @param {number} [options.waitFor] - ms to wait after JS render
     * @param {string[]} [options.includeTags] - CSS selectors to include
     * @param {string[]} [options.excludeTags] - CSS selectors to exclude
     * @param {string} [options.cssSelector] - Narrow to one CSS selector
     * @param {Object} [options.jsonSchema] - JSON Schema for structured extraction (requires formats:['json'])
     * @returns {Promise<Object>} - { success, data: { markdown, html, links, metadata, ... } }
     */
    async scrape(url, options = {}) {
      const body = {
        url,
        formats: options.formats || ['markdown'],
        onlyMainContent: options.onlyMainContent ?? true,
      };

      if (options.renderJs !== undefined) body.renderJs = options.renderJs;
      if (options.waitFor) body.waitFor = options.waitFor;
      if (options.includeTags) body.includeTags = options.includeTags;
      if (options.excludeTags) body.excludeTags = options.excludeTags;
      if (options.cssSelector) body.cssSelector = options.cssSelector;
      if (options.jsonSchema) body.jsonSchema = options.jsonSchema;
      if (options.headers) body.headers = options.headers;

      return post('/v1/scrape', body);
    },

    /**
     * Search the web and return ranked results.
     *
     * POST /v1/search
     *
     * @param {string} query - Search query
     * @param {Object} [options]
     * @param {number} [options.limit=10] - Number of results
     * @param {string[]} [options.formats=['markdown']] - Output formats for each result
     * @param {string} [options.lang] - Language code (e.g. 'en')
     * @param {string} [options.country] - Country code (e.g. 'us')
     * @returns {Promise<Object>} - { success, data: [{ url, title, description, markdown, ... }] }
     */
    async search(query, options = {}) {
      const body = {
        query,
        limit: options.limit || 10,
        formats: options.formats || ['markdown'],
      };

      if (options.lang) body.lang = options.lang;
      if (options.country) body.country = options.country;

      return post('/v1/search', body);
    },

    /**
     * Start an async multi-page crawl.
     *
     * POST /v1/crawl → returns job ID
     * GET /v1/crawl/{id} → poll for results
     *
     * @param {string} url - Starting URL
     * @param {Object} [options]
     * @param {number} [options.maxDepth=2] - Max BFS depth
     * @param {number} [options.maxPages=50] - Max pages to crawl
     * @param {string[]} [options.formats=['markdown']] - Output formats per page
     * @param {boolean} [options.onlyMainContent=true] - Strip boilerplate
     * @returns {Promise<Object>} - { success, status, total, completed, data: [...] }
     */
    async crawl(url, options = {}) {
      const body = {
        url,
        maxDepth: options.maxDepth || 2,
        maxPages: options.maxPages || 50,
        formats: options.formats || ['markdown'],
        onlyMainContent: options.onlyMainContent ?? true,
      };

      // Start crawl job
      const startResult = await post('/v1/crawl', body);

      if (!startResult.success || !startResult.id) {
        return startResult;
      }

      // Poll until completed or failed
      const jobId = startResult.id;
      const maxPollTime = (options.pollTimeoutMs || 120000); // 2 min default
      const pollInterval = (options.pollIntervalMs || 3000); // 3 sec default
      const startTime = Date.now();

      while (Date.now() - startTime < maxPollTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        const result = await get(`/v1/crawl/${jobId}`);

        if (result.status === 'completed' || result.status === 'failed') {
          return result;
        }

        // Log progress
        if (result.total && result.completed !== undefined) {
          console.log(`  ⏳ CRW crawl: ${result.completed}/${result.total} pages...`);
        }
      }

      // Timeout — return whatever we have
      const finalResult = await get(`/v1/crawl/${jobId}`);
      finalResult.timedOut = true;
      return finalResult;
    },

    /**
     * Discover URLs on a site without scraping bodies.
     *
     * POST /v1/map
     *
     * @param {string} url - Starting URL
     * @returns {Promise<Object>} - { success, links: [...] }
     */
    async map(url) {
      return post('/v1/map', { url });
    },

    /**
     * Returns configuration info for logging/debugging.
     */
    getConfig() {
      return {
        baseUrl,
        hasApiKey: !!apiKey,
        isCloud: baseUrl.includes('fastcrw.com'),
      };
    },
  };
}

/**
 * Checks if CRW is configured in environment variables.
 * Returns true if CRW_API_KEY or CRW_BASE_URL is set.
 */
export function isCRWConfigured() {
  return !!(process.env.CRW_API_KEY || process.env.CRW_BASE_URL);
}

/**
 * Creates a CRW client from environment variables.
 * Returns null if CRW is not configured.
 */
export function createCRWClientFromEnv() {
  if (!isCRWConfigured()) {
    return null;
  }
  return createCRWClient({
    apiKey: process.env.CRW_API_KEY,
    baseUrl: process.env.CRW_BASE_URL,
  });
}

export default { createCRWClient, createCRWClientFromEnv, isCRWConfigured };
