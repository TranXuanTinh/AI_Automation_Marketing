/**
 * Stage 1 — Reddit Scanner
 *
 * Scans configured subreddits for threads relevant to
 * Behold's topic clusters. Uses Reddit's public JSON API
 * (no OAuth required for reading public posts).
 *
 * ENRICHMENT: When CRW is available, scrapes full Reddit thread
 * content for richer quotes and deeper context extraction.
 */

import dotenv from 'dotenv';
dotenv.config();

import { TOPIC_CLUSTERS } from '../config/behold-profile.js';
import { insertSignal } from '../database/db.js';
import { createCRWClientFromEnv } from '../crawlers/crw-client.js';

const REDDIT_BASE = 'https://www.reddit.com';
const REQUEST_DELAY = 2000; // ms between requests to respect rate limits

const BEHOLD_KEYWORDS = [
  'emotional numbness', 'numb', 'can\'t feel', 'dissociation', 'freeze response',
  'high functioning', 'look fine', 'hollow inside', 'inner critic', 'parts work',
  'IFS', 'EMDR', 'somatic', 'nervous system', 'window of tolerance',
  'grief', 'miscarriage', 'ambiguous loss', 'resentment', 'forgiveness',
  'boundaries', 'people pleasing', 'fawn', 'ADHD', 'executive function',
  'spiritual', 'faith', 'God feels distant', 'prayer', 'doubt',
  'trauma', 'triggered', 'flashback', 'hypervigilance',
  'overwhelm', 'exhausted', 'burnt out', 'caregiver',
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetches top/hot posts from a subreddit using the public JSON API.
 */
async function fetchSubredditPosts(subreddit, sort = 'hot', limit = 25) {
  const sub = subreddit.replace('r/', '');
  const url = `${REDDIT_BASE}/r/${sub}/${sort}.json?limit=${limit}&raw_json=1`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': process.env.REDDIT_USER_AGENT || 'BeholdContentSystem/1.0',
      },
    });

    if (!response.ok) {
      console.warn(`  ⚠ Reddit ${subreddit} returned ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data?.data?.children?.map(c => c.data) || [];
  } catch (err) {
    console.warn(`  ⚠ Failed to fetch ${subreddit}: ${err.message}`);
    return [];
  }
}

/**
 * Checks if a post is relevant to Behold's topics based on keywords.
 */
function isRelevant(post) {
  const text = `${post.title} ${post.selftext || ''}`.toLowerCase();
  return BEHOLD_KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
}

/**
 * Extracts raw quotes (first-person statements) from post text.
 */
function extractQuotes(text) {
  if (!text) return [];
  const sentences = text.split(/[.!?]\s+/);
  return sentences
    .filter(s => /^I\s|^My\s|^I'm\s|^I've\s|^I can't\s|^I don't\s|^I feel\s/i.test(s.trim()))
    .map(s => s.trim())
    .slice(0, 5);
}

/**
 * Enriches a Reddit post with CRW scraping for deeper content extraction.
 * Scrapes the full thread page to get comments and richer context.
 *
 * @param {Object} crw - CRW client instance
 * @param {string} permalink - Reddit post permalink
 * @returns {Promise<Object|null>} - { enrichedBody, enrichedQuotes } or null on failure
 */
async function enrichWithCRW(crw, permalink) {
  try {
    const url = `${REDDIT_BASE}${permalink}`;
    const result = await crw.scrape(url, {
      formats: ['markdown'],
      onlyMainContent: true,
    });

    if (!result.success || !result.data?.markdown) {
      return null;
    }

    const fullContent = result.data.markdown;

    // Extract richer quotes from the full scraped content
    const enrichedQuotes = extractQuotes(fullContent);

    return {
      enrichedBody: fullContent.substring(0, 4000),
      enrichedQuotes,
    };
  } catch {
    return null;
  }
}

/**
 * Scans all configured subreddits for relevant posts.
 * When CRW is available, enriches the top relevant posts with
 * scraped content for deeper quote extraction.
 */
export async function scanReddit(clusterIds = null) {
  const clusters = clusterIds
    ? TOPIC_CLUSTERS.filter(c => clusterIds.includes(c.id))
    : TOPIC_CLUSTERS;

  // Check CRW availability
  const crw = createCRWClientFromEnv();
  const crwAvailable = crw ? await crw.isAvailable() : false;

  if (crwAvailable) {
    console.log('  🔗 CRW detected — will enrich top Reddit posts with full thread scraping');
  }

  const results = [];
  const seenUrls = new Set();
  let enrichedCount = 0;

  for (const cluster of clusters) {
    for (const subreddit of cluster.subreddits) {
      const posts = await fetchSubredditPosts(subreddit, 'hot', 25);

      for (const post of posts) {
        if (!isRelevant(post)) continue;

        const url = `${REDDIT_BASE}${post.permalink}`;
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);

        let body = (post.selftext || '').substring(0, 2000);
        let quotes = extractQuotes(post.selftext);
        const engagement = `${post.score} upvotes, ${post.num_comments} comments`;
        let source = 'reddit';

        // Enrich with CRW if available (for posts with high engagement)
        if (crwAvailable && post.score >= 10) {
          const enrichment = await enrichWithCRW(crw, post.permalink);
          if (enrichment) {
            body = enrichment.enrichedBody;
            quotes = [...new Set([...quotes, ...enrichment.enrichedQuotes])].slice(0, 8);
            source = 'reddit_crw';
            enrichedCount++;
          }
          await sleep(1000); // Respect CRW rate limiting
        }

        const signal = {
          source,
          cluster: cluster.id,
          title: post.title,
          body,
          url,
          engagement_metric: engagement,
          raw_quotes: quotes.length > 0 ? JSON.stringify(quotes) : null,
        };

        const result = insertSignal(signal);
        results.push({ ...signal, id: result.lastInsertRowid });
      }

      console.log(`  ✓ ${subreddit}: scanned for ${cluster.name}`);
      await sleep(REQUEST_DELAY);
    }
  }

  console.log(`  → Total Reddit signals: ${results.length}${crwAvailable ? ` (${enrichedCount} enriched with CRW)` : ''}`);
  return results;
}

export default { scanReddit };
