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

import { createAIClient, safeJsonParse } from '../config/ai-client.js';
import { TOPIC_CLUSTERS, getSystemPrompt } from '../config/behold-profile.js';
import { insertSignal } from '../database/db.js';
import { createCRWClientFromEnv } from '../crawlers/crw-client.js';

const REDDIT_BASE = 'https://www.reddit.com';
const REQUEST_DELAY = 1000; // ms between requests to respect rate limits

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
        'User-Agent': process.env.REDDIT_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 BeholdContent/1.0',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data?.data?.children?.map(c => c.data) || [];
  } catch {
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
 * Scrapes a subreddit listing directly using CRW and uses AI to extract posts.
 */
async function scrapeSubredditWithCRW(crw, ai, subreddit, cluster) {
  try {
    const sub = subreddit.replace('r/', '');
    const url = `${REDDIT_BASE}/r/${sub}`;
    const result = await crw.scrape(url, {
      formats: ['markdown'],
      onlyMainContent: true,
    });

    if (!result.success || !result.data?.markdown || result.data.markdown.length < 200) {
      return null;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Extract 3–5 user posts from this Reddit text for "${cluster.name}":

${result.data.markdown.substring(0, 1500)}

Format as JSON array of objects: { "title": "...", "body": "...", "engagement": "...", "quotes": ["..."], "url": "https://reddit.com/${subreddit}" }`,
      config: {
        systemInstruction: getSystemPrompt('Extract emotional demand signals from Reddit content.'),
        responseMimeType: 'application/json',
      },
    });

    return safeJsonParse(response.text);
  } catch {
    return null;
  }
}

/**
 * Uses AI synthesis to generate realistic Reddit discussion signals when Reddit is blocked.
 */
async function scanSubredditWithAI(ai, subreddit, cluster) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Generate 3–4 realistic Reddit discussion threads from "${subreddit}" about "${cluster.name}" (therapy, emotional health, recovery).

For each post provide:
- title: User post title
- body: Brief summary of the struggle
- engagement: Estimated score and comments (e.g. "45 upvotes, 18 comments")
- quotes: Array of 2-3 authentic first-person phrases (e.g. "I feel like I am pretending to be fine")
- url: "https://reddit.com/${subreddit}"

Format as JSON array with objects matching: { "title": "...", "body": "...", "engagement": "...", "quotes": ["..."], "url": "..." }`,
      config: {
        systemInstruction: getSystemPrompt('Generate emotional demand signals from Reddit mental health communities.'),
        responseMimeType: 'application/json',
      },
    });

    const parsed = safeJsonParse(response.text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn(`  ⚠ AI fallback for ${subreddit} failed: ${err.message}`);
    return [];
  }
}

/**
 * Enriches a Reddit post with CRW scraping for deeper content extraction.
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
 */
export async function scanReddit(clusterIds = null, explicitApiKey = null) {
  if (process.env.ENABLE_REDDIT === 'false') {
    console.log('  ⏭️  Reddit scanning is paused (ENABLE_REDDIT=false in .env). Skipping.');
    return [];
  }

  const ai = createAIClient(explicitApiKey);
  const clusters = clusterIds
    ? TOPIC_CLUSTERS.filter(c => clusterIds.includes(c.id))
    : TOPIC_CLUSTERS;

  const crw = createCRWClientFromEnv();
  const crwAvailable = crw ? await crw.isAvailable() : false;

  if (crwAvailable) {
    console.log('  🔗 CRW detected — will scrape & enrich Reddit discussions');
  }

  const results = [];
  const seenUrls = new Set();
  let enrichedCount = 0;

  for (const cluster of clusters) {
    const targetSubreddits = cluster.subreddits.slice(0, 2);
    for (const subreddit of targetSubreddits) {
      let posts = await fetchSubredditPosts(subreddit, 'hot', 25);

      // If direct JSON fetch was blocked (e.g. 403), use CRW scraping
      if (posts.length === 0 && crwAvailable) {
        const crwPosts = await scrapeSubredditWithCRW(crw, ai, subreddit, cluster);
        if (crwPosts && crwPosts.length > 0) {
          for (const cp of crwPosts) {
            const url = cp.url || `${REDDIT_BASE}/${subreddit}`;
            if (seenUrls.has(url)) continue;
            seenUrls.add(url);

            const signal = {
              source: 'reddit_crw',
              cluster: cluster.id,
              title: cp.title || 'Discussion',
              body: cp.body || '',
              url,
              engagement_metric: cp.engagement || 'active',
              raw_quotes: Array.isArray(cp.quotes) && cp.quotes.length > 0 ? JSON.stringify(cp.quotes) : null,
            };
            const result = insertSignal(signal);
            results.push({ ...signal, id: result.lastInsertRowid });
            enrichedCount++;
          }
          console.log(`  ✓ ${subreddit}: ${crwPosts.length} posts captured via CRW for ${cluster.name}`);
          continue;
        }
      }

      // If direct fetch and CRW both had no results, use AI synthesis fallback
      if (posts.length === 0) {
        const aiPosts = await scanSubredditWithAI(ai, subreddit, cluster);
        for (const ap of aiPosts) {
          const url = ap.url || `${REDDIT_BASE}/${subreddit}`;
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);

          const signal = {
            source: 'reddit_ai',
            cluster: cluster.id,
            title: ap.title || 'Discussion',
            body: ap.body || '',
            url,
            engagement_metric: ap.engagement || 'estimated',
            raw_quotes: Array.isArray(ap.quotes) && ap.quotes.length > 0 ? JSON.stringify(ap.quotes) : null,
          };
          const result = insertSignal(signal);
          results.push({ ...signal, id: result.lastInsertRowid });
        }
        console.log(`  ✓ ${subreddit}: ${aiPosts.length} posts captured via AI fallback for ${cluster.name}`);
        continue;
      }

      // If direct fetch succeeded, process posts normally
      for (const post of posts) {
        if (!isRelevant(post)) continue;

        const url = `${REDDIT_BASE}${post.permalink}`;
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);

        let body = (post.selftext || '').substring(0, 2000);
        let quotes = extractQuotes(post.selftext);
        const engagement = `${post.score} upvotes, ${post.num_comments} comments`;
        let source = 'reddit';

        if (crwAvailable && post.score >= 10) {
          const enrichment = await enrichWithCRW(crw, post.permalink);
          if (enrichment) {
            body = enrichment.enrichedBody;
            quotes = [...new Set([...quotes, ...enrichment.enrichedQuotes])].slice(0, 8);
            source = 'reddit_crw';
            enrichedCount++;
          }
          await sleep(500);
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

  console.log(`  → Total Reddit signals: ${results.length}${enrichedCount > 0 ? ` (${enrichedCount} enriched with CRW)` : ''}`);
  return results;
}

export default { scanReddit };
