/**
 * Stage 2 — Step 01: Topic Collector
 *
 * Aggregates raw demand signals from all listeners,
 * groups them by theme using Gemini, and produces
 * a deduplicated list of topic candidates.
 */

import { GoogleGenAI } from '@google/genai';
import { getSystemPrompt, TOPIC_CLUSTERS, TARGET_AUDIENCE } from '../config/behold-profile.js';
import { getGlossaryPrompt } from '../config/glossary.js';
import { getUnprocessedSignals, markSignalsProcessed, insertCandidate } from '../database/db.js';

/**
 * Groups raw demand signals into topic candidates using Gemini.
 */
export async function collectTopics(apiKey) {
  const ai = new GoogleGenAI({ apiKey });
  const signals = getUnprocessedSignals();

  if (signals.length === 0) {
    console.log('  ℹ No unprocessed demand signals found.');
    return [];
  }

  console.log(`  → Processing ${signals.length} demand signals...`);

  // Prepare signal summary for Gemini
  const signalSummary = signals.map(s => ({
    id: s.id,
    source: s.source,
    cluster: s.cluster,
    title: s.title,
    engagement: s.engagement_metric,
    quotes: s.raw_quotes ? JSON.parse(s.raw_quotes) : [],
  }));

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `You have ${signals.length} raw demand signals from Google PAA, Reddit, YouTube, and client FAQs related to mental health and counselling topics.

Here are the signals:
${JSON.stringify(signalSummary, null, 2)}

TASK: Group these signals into 8–15 distinct topic candidates. Each candidate should represent a single, focused content opportunity.

For each topic candidate, provide:
- title: A compelling working title for the article (not generic — use the audience's own language)
- underlying_problem: The emotional/practical problem behind the search (1–2 sentences)
- intended_audience: Who specifically this helps (be specific, not generic)
- search_intent: What the searcher hopes to find (informational, validation, practical help, etc.)
- demand_signals_summary: Which signal IDs support this topic (array of integers)
- cluster: The closest topic cluster from: ${TOPIC_CLUSTERS.map(c => c.id).join(', ')}

GLOSSARY (use these terms consistently):
${getGlossaryPrompt()}

TARGET AUDIENCE: ${TARGET_AUDIENCE.primary}

RULES:
- Deduplicate: merge signals that ask the same question differently
- Prioritize questions that reflect deep emotional struggles, not surface-level queries
- Working titles should sound like something a real person would search or click on
- Each topic should be specific enough for a 1,200–1,600 word article

Format as JSON array.`,
    config: {
      systemInstruction: getSystemPrompt('You are grouping demand signals into content opportunities.'),
      responseMimeType: 'application/json',
    },
  });

  let candidates;
  try {
    candidates = JSON.parse(response.text);
  } catch {
    console.error('  ✗ Failed to parse topic collector response.');
    return [];
  }

  const results = [];
  for (const c of candidates) {
    const signalIds = c.demand_signals_summary || [];

    const result = insertCandidate({
      title: c.title,
      underlying_problem: c.underlying_problem,
      intended_audience: c.intended_audience,
      search_intent: c.search_intent,
      demand_signals_summary: JSON.stringify(signalIds),
      cluster: c.cluster,
    });

    results.push({ id: result.lastInsertRowid, ...c });
    console.log(`  ✓ Candidate: "${c.title}" (cluster: ${c.cluster})`);
  }

  // Mark all processed signals
  markSignalsProcessed(signals.map(s => s.id));

  console.log(`  → ${results.length} topic candidates created from ${signals.length} signals.`);
  return results;
}

export default { collectTopics };
