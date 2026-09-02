/**
 * Web Researcher — CRW-Powered Academic Source Search & DOI Verification
 *
 * Uses CRW web scraper to search for and verify academic sources:
 * - Search PubMed, Google Scholar, and Crossref for real papers
 * - Verify DOIs by scraping DOI.org/Crossref
 * - Scrape competitor content for gap analysis
 *
 * This module enhances the evidence-mapper.js with real web verification,
 * replacing pure LLM-generated citations with verifiable ones.
 */

import { createCRWClientFromEnv } from './crw-client.js';

/**
 * Searches for academic sources related to a topic using CRW web search.
 *
 * @param {string} query - Search query (e.g. "IFS therapy trauma PTSD peer-reviewed")
 * @param {Object} [options]
 * @param {number} [options.limit=10] - Number of results
 * @returns {Promise<Array>} - Array of { title, url, description, markdown }
 */
export async function searchAcademicSources(query, options = {}) {
  const crw = createCRWClientFromEnv();
  if (!crw || !(await crw.isAvailable()) || !(await crw.isSearchAvailable())) {
    return [];
  }

  const results = [];

  // Search across academic databases
  const searchQueries = [
    `site:pubmed.ncbi.nlm.nih.gov ${query}`,
    `site:scholar.google.com ${query}`,
    `${query} peer-reviewed journal DOI`,
  ];

  for (const searchQuery of searchQueries) {
    try {
      const searchResult = await crw.search(searchQuery, {
        limit: options.limit || 5,
        formats: ['markdown'],
      });

      if (searchResult.success && searchResult.data) {
        for (const item of searchResult.data) {
          results.push({
            title: item.title || '',
            url: item.url || '',
            description: item.description || '',
            markdown: item.markdown ? item.markdown.substring(0, 2000) : '',
          });
        }
      }
    } catch (err) {
      console.warn(`  ⚠ CRW academic search failed for "${searchQuery}": ${err.message}`);
    }
  }

  return results;
}

/**
 * Verifies a DOI by scraping its DOI.org/Crossref landing page.
 * Returns the resolved metadata if the DOI is valid.
 *
 * @param {string} doi - Digital Object Identifier (e.g. "10.1037/tra0000541")
 * @returns {Promise<Object|null>} - { valid, title, authors, journal, year, url } or null
 */
export async function verifyDOI(doi) {
  const crw = createCRWClientFromEnv();
  if (!crw || !(await crw.isAvailable())) {
    return null;
  }

  // Clean DOI format
  const cleanDOI = doi.replace(/^https?:\/\/doi\.org\//, '').trim();
  const doiUrl = `https://doi.org/${cleanDOI}`;

  try {
    const result = await crw.scrape(doiUrl, {
      formats: ['markdown'],
      onlyMainContent: true,
    });

    if (!result.success) {
      return { valid: false, doi: cleanDOI, url: doiUrl };
    }

    const metadata = result.data?.metadata || {};
    const markdown = result.data?.markdown || '';

    return {
      valid: true,
      doi: cleanDOI,
      url: metadata.sourceURL || doiUrl,
      title: metadata.title || extractTitleFromMarkdown(markdown),
      pageContent: markdown.substring(0, 1000),
      statusCode: metadata.statusCode,
    };
  } catch (err) {
    console.warn(`  ⚠ DOI verification failed for ${cleanDOI}: ${err.message}`);
    return { valid: false, doi: cleanDOI, url: doiUrl, error: err.message };
  }
}

/**
 * Scrapes competitor content from a list of URLs.
 * Useful for competitive analysis and content gap identification.
 *
 * @param {string[]} urls - Array of URLs to scrape
 * @returns {Promise<Array>} - Array of { url, title, markdown, metadata }
 */
export async function scrapeCompetitorContent(urls) {
  const crw = createCRWClientFromEnv();
  if (!crw || !(await crw.isAvailable())) {
    return [];
  }

  const results = [];

  for (const url of urls) {
    try {
      const result = await crw.scrape(url, {
        formats: ['markdown'],
        onlyMainContent: true,
      });

      if (result.success && result.data) {
        results.push({
          url,
          title: result.data.metadata?.title || '',
          markdown: result.data.markdown || '',
          description: result.data.metadata?.description || '',
        });
      }
    } catch (err) {
      console.warn(`  ⚠ Failed to scrape ${url}: ${err.message}`);
    }
  }

  return results;
}

/**
 * Crawls a website and returns all discovered pages.
 * Useful for analyzing a competitor's full content structure.
 *
 * @param {string} url - Starting URL
 * @param {Object} [options]
 * @param {number} [options.maxPages=20] - Maximum pages to crawl
 * @param {number} [options.maxDepth=2] - Maximum crawl depth
 * @returns {Promise<Object>} - { pages: [...], total }
 */
export async function crawlSite(url, options = {}) {
  const crw = createCRWClientFromEnv();
  if (!crw || !(await crw.isAvailable())) {
    return { pages: [], total: 0 };
  }

  try {
    const result = await crw.crawl(url, {
      maxPages: options.maxPages || 20,
      maxDepth: options.maxDepth || 2,
      formats: ['markdown'],
      onlyMainContent: true,
    });

    if (result.success && result.data) {
      return {
        pages: result.data.map(page => ({
          url: page.metadata?.sourceURL || '',
          title: page.metadata?.title || '',
          markdown: page.markdown || '',
        })),
        total: result.total || result.data.length,
      };
    }
  } catch (err) {
    console.warn(`  ⚠ CRW site crawl failed for ${url}: ${err.message}`);
  }

  return { pages: [], total: 0 };
}

/**
 * Discovers all URLs on a site without scraping their content.
 *
 * @param {string} url - Starting URL
 * @returns {Promise<string[]>} - Array of discovered URLs
 */
export async function discoverSiteUrls(url) {
  const crw = createCRWClientFromEnv();
  if (!crw || !(await crw.isAvailable())) {
    return [];
  }

  try {
    const result = await crw.map(url);
    return result.links || [];
  } catch (err) {
    console.warn(`  ⚠ CRW site map failed for ${url}: ${err.message}`);
    return [];
  }
}

/**
 * Helper: extracts a title from markdown content (first H1 or first line).
 */
function extractTitleFromMarkdown(markdown) {
  if (!markdown) return '';
  const h1Match = markdown.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();
  const firstLine = markdown.split('\n').find(l => l.trim());
  return firstLine ? firstLine.trim().substring(0, 200) : '';
}

export default {
  searchAcademicSources,
  verifyDOI,
  scrapeCompetitorContent,
  crawlSite,
  discoverSiteUrls,
};
