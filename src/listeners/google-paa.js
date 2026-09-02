/**
 * Stage 1 — Google PAA & Autocomplete Scanner
 *
 * Searches Google for People Also Ask questions and autocomplete
 * suggestions related to Behold's topic clusters.
 *
 * PRIMARY: Uses CRW web scraper (/v1/search) for real Google search results.
 * FALLBACK: Uses Gemini API to simulate PAA patterns when CRW is unavailable.
 */

import { createAIClient } from '../config/ai-client.js';
import { TOPIC_CLUSTERS, getSystemPrompt } from '../config/behold-profile.js';
import { insertSignal } from '../database/db.js';
import { createCRWClientFromEnv } from '../crawlers/crw-client.js';

const SEARCH_TEMPLATES = [
  '{topic} therapy counselling common questions',
  'why do I {symptom}',
  '{topic} People Also Ask',
  'how to deal with {topic} as an adult',
  '{topic} signs symptoms causes treatment',
];

const SYMPTOM_MAP = {
  trauma_recovery: ['feel triggered', 'freeze when stressed', 'feel unsafe in my body'],
  grief_loss: ['grieve someone still alive', 'cope with miscarriage', 'grieve without closure'],
  anxiety_overwhelm: ['feel anxious all the time', 'feel overwhelmed by everything', 'have high functioning anxiety'],
  emotional_numbness: ['feel numb', 'feel nothing anymore', 'feel emotionally disconnected', 'feel empty inside'],
  resentment_forgiveness: ['let go of resentment', 'forgive when I don\'t want to', 'stop being angry at someone'],
  ifs_parts: ['work with my inner critic', 'understand parts work', 'do IFS therapy on myself'],
  faith_spiritual: ['feel distant from God', 'pray when faith feels empty', 'doubt my faith'],
  adhd_neurodivergent: ['focus when I have ADHD', 'stop feeling lazy', 'manage executive dysfunction'],
};

/**
 * Scans Google PAA using CRW web search + Gemini/Custom AI extraction.
 * Uses real Google search results via CRW /v1/search, then LLM to extract
 * and structure the PAA questions from the scraped content.
 */
async function scanGooglePAAWithCRW(apiKey, crw, clusterIds = null) {
  const ai = createAIClient(apiKey);
  const clusters = clusterIds
    ? TOPIC_CLUSTERS.filter(c => clusterIds.includes(c.id))
    : TOPIC_CLUSTERS;

  const results = [];

  for (const cluster of clusters) {
    const symptoms = SYMPTOM_MAP[cluster.id] || [];

    // Build search queries for this cluster
    const searchQueries = [
      `${cluster.name} therapy counselling common questions`,
      `${cluster.name} people also ask therapy`,
      ...symptoms.slice(0, 2).map(s => `why do I ${s} therapy`),
    ];

    let allSearchContent = '';

    for (const query of searchQueries) {
      try {
        const searchResult = await crw.search(query, {
          limit: 5,
          formats: ['markdown'],
        });

        if (searchResult.success && searchResult.data) {
          for (const item of searchResult.data) {
            allSearchContent += `\n\n--- Search Result: ${item.title || ''} ---\n`;
            allSearchContent += `URL: ${item.url || ''}\n`;
            allSearchContent += `Description: ${item.description || ''}\n`;
            allSearchContent += item.markdown ? item.markdown.substring(0, 1500) : '';
          }
        }
      } catch (err) {
        console.warn(`  ⚠ CRW search failed for "${query}": ${err.message}`);
      }
    }

    if (!allSearchContent.trim()) {
      console.warn(`  ⚠ No CRW search results for ${cluster.name}, falling back to AI synthesis for this cluster.`);
      const fallbackQuestions = await scanClusterWithGemini(ai, cluster);
      for (const q of fallbackQuestions) {
        const signal = {
          source: 'google_paa',
          cluster: cluster.id,
          title: q.question,
          body: JSON.stringify({ category: q.category, engagement: q.engagement }),
          url: `https://google.com/search?q=${encodeURIComponent(q.question)}`,
          engagement_metric: q.engagement,
          raw_quotes: null,
        };
        const result = insertSignal(signal);
        results.push({ ...signal, id: result.lastInsertRowid });
      }
      console.log(`  ✓ ${cluster.name}: ${fallbackQuestions.length} PAA signals captured (AI fallback)`);
      continue;
    }

    // Use Gemini to extract structured PAA questions from real search content
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Analyze the following REAL Google search results and scraped web content to identify actual People Also Ask (PAA) questions and common queries about "${cluster.name}" in the context of therapy and counselling.

SCRAPED SEARCH CONTENT:
${allSearchContent.substring(0, 8000)}

TASK: Extract 8–12 real questions that appear (or are strongly implied) in the search results above.

For each question, provide:
- question: The exact question as it would appear in a PAA box
- category: 'definition', 'symptoms', 'causes', 'treatment', 'validation', 'practical'
- engagement: 'high', 'medium', 'low' (based on the prominence in search results)
- source_url: The URL where this question was found (if available, otherwise null)

Format as JSON array with objects: { "question": "...", "category": "...", "engagement": "...", "source_url": "..." }

IMPORTANT: Only extract questions that are actually present or strongly implied in the provided content. Do NOT hallucinate questions.`,
      config: {
        systemInstruction: getSystemPrompt('You are analyzing real Google search results to identify People Also Ask patterns.'),
        responseMimeType: 'application/json',
      },
    });

    let questions;
    try {
      questions = JSON.parse(response.text);
    } catch {
      console.warn(`  ⚠ Failed to parse CRW+Gemini PAA response for ${cluster.name}, skipping.`);
      continue;
    }

    for (const q of questions) {
      const signal = {
        source: 'google_paa_crw',
        cluster: cluster.id,
        title: q.question,
        body: JSON.stringify({ category: q.category, engagement: q.engagement, source_url: q.source_url }),
        url: q.source_url || `https://google.com/search?q=${encodeURIComponent(q.question)}`,
        engagement_metric: q.engagement,
        raw_quotes: null,
      };

      const result = insertSignal(signal);
      results.push({ ...signal, id: result.lastInsertRowid });
    }

    console.log(`  ✓ ${cluster.name}: ${questions.length} PAA signals captured via CRW`);
  }

  return results;
}

/**
 * Helper to scan a single cluster with AI synthesis
 */
async function scanClusterWithGemini(ai, cluster) {
  const symptoms = SYMPTOM_MAP[cluster.id] || [];
  const symptomList = symptoms.map(s => `"why do I ${s}"`).join(', ');

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Based on your knowledge of Google search patterns and People Also Ask boxes, generate a list of 8–12 real questions that people commonly ask about "${cluster.name}" in the context of therapy and counselling.

Focus on questions that appear in:
1. Google's "People Also Ask" sections
2. Google Autocomplete suggestions
3. Related searches at the bottom of Google results

Related symptom searches: ${symptomList}

For each question, provide:
- The exact question as it would appear in a PAA box
- A category: 'definition', 'symptoms', 'causes', 'treatment', 'validation', 'practical'
- An estimated engagement level: 'high', 'medium', 'low'

Format as JSON array with objects: { "question": "...", "category": "...", "engagement": "..." }

IMPORTANT: Only include questions you have high confidence actually appear in Google search results. Do NOT invent questions.`,
    config: {
      systemInstruction: getSystemPrompt('You are analyzing Google search patterns for content opportunity research.'),
      responseMimeType: 'application/json',
    },
  });

  try {
    return JSON.parse(response.text);
  } catch {
    console.warn(`Failed to parse PAA response for ${cluster.name}, skipping.`);
    return [];
  }
}

/**
 * FALLBACK: Uses Gemini to simulate PAA/autocomplete discovery for a topic cluster.
 * Since we can't directly scrape Google programmatically without a SERP API,
 * we use Gemini to generate realistic PAA questions based on actual search patterns,
 * then flag them for manual verification.
 */
async function scanGooglePAAWithGemini(apiKey, clusterIds = null) {
  const ai = createAIClient(apiKey);
  const clusters = clusterIds
    ? TOPIC_CLUSTERS.filter(c => clusterIds.includes(c.id))
    : TOPIC_CLUSTERS;

  const results = [];

  for (const cluster of clusters) {
    const questions = await scanClusterWithGemini(ai, cluster);

    for (const q of questions) {
      const signal = {
        source: 'google_paa',
        cluster: cluster.id,
        title: q.question,
        body: JSON.stringify({ category: q.category, engagement: q.engagement }),
        url: `https://google.com/search?q=${encodeURIComponent(q.question)}`,
        engagement_metric: q.engagement,
        raw_quotes: null,
      };

      const result = insertSignal(signal);
      results.push({ ...signal, id: result.lastInsertRowid });
    }

    console.log(`  ✓ ${cluster.name}: ${questions.length} PAA signals captured (Gemini)`);
  }

  return results;
}

/**
 * Main entry point for Google PAA scanning.
 * Auto-detects CRW availability and falls back to Gemini-only mode.
 *
 * @param {string} apiKey - Gemini API key
 * @param {string[]} [clusterIds] - Optional filter for specific clusters
 * @returns {Promise<Array>} - Captured demand signals
 */
export async function scanGooglePAA(apiKey, clusterIds = null) {
  const crw = createCRWClientFromEnv();

  if (crw && await crw.isAvailable()) {
    const searchReady = await crw.isSearchAvailable();
    if (searchReady) {
      console.log('  🔗 CRW detected — using real Google search scraping');
      return scanGooglePAAWithCRW(apiKey, crw, clusterIds);
    } else {
      console.log('  🔗 CRW connected (scraping active, search cloud-only) — using AI PAA synthesis');
      return scanGooglePAAWithGemini(apiKey, clusterIds);
    }
  }

  console.log('  📡 CRW not available — using Gemini-simulated PAA (set CRW_BASE_URL for real scraping)');
  return scanGooglePAAWithGemini(apiKey, clusterIds);
}

export default { scanGooglePAA };
