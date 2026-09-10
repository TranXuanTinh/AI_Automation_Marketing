/**
 * Stage 2 — Step 01: Topic Collector
 *
 * Aggregates raw demand signals from all listeners,
 * groups them by theme using Gemini, and produces
 * a deduplicated list of topic candidates.
 */

import { createAIClient, safeJsonParse } from '../config/ai-client.js';
import { getSystemPrompt, TOPIC_CLUSTERS, TARGET_AUDIENCE } from '../config/behold-profile.js';
import { getGlossaryPrompt } from '../config/glossary.js';
import { getUnprocessedSignals, markSignalsProcessed, insertCandidate } from '../database/db.js';

/**
 * Groups raw demand signals into topic candidates using Gemini or Custom AI.
 */
export async function collectTopics(apiKey) {
  const ai = createAIClient(apiKey);
  const signals = getUnprocessedSignals();

  if (signals.length === 0) {
    console.log('  ℹ No unprocessed demand signals found.');
    return [];
  }

  console.log(`  → Processing ${signals.length} demand signals across clusters...`);

  // Group signals by cluster
  const signalsByCluster = new Map();
  for (const s of signals) {
    const cluster = s.cluster || 'general';
    if (!signalsByCluster.has(cluster)) {
      signalsByCluster.set(cluster, []);
    }
    signalsByCluster.get(cluster).push(s);
  }

  const results = [];
  const systemPrompt = getSystemPrompt('You are grouping demand signals into content opportunities for Behold Counselling.');
  const glossaryPrompt = getGlossaryPrompt();

  for (const [clusterId, clusterSignals] of signalsByCluster.entries()) {
    const clusterInfo = TOPIC_CLUSTERS.find(c => c.id === clusterId);
    const clusterName = clusterInfo ? clusterInfo.name : clusterId;

    // Deduplicate and pick top 20 representative signals
    const seenTitles = new Set();
    const representativeSignals = [];

    const sortedSignals = [...clusterSignals].sort((a, b) => (b.engagement_metric || 0) - (a.engagement_metric || 0));
    for (const s of sortedSignals) {
      const cleanTitle = (s.title || '').trim().toLowerCase();
      if (!cleanTitle || seenTitles.has(cleanTitle)) continue;
      seenTitles.add(cleanTitle);
      representativeSignals.push({
        id: s.id,
        source: s.source,
        title: s.title.trim(),
      });
      if (representativeSignals.length >= 20) break;
    }

    if (representativeSignals.length === 0) continue;

    const signalsList = representativeSignals.map(s => `[ID: ${s.id}] (${s.source}) ${s.title}`).join('\n');

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `TOPIC CLUSTER: "${clusterName}" (${clusterId})
TARGET AUDIENCE: ${TARGET_AUDIENCE.primary}

DEMAND SIGNALS OBSERVED (sample of ${clusterSignals.length} signals):
${signalsList}

GLOSSARY (use consistently):
${glossaryPrompt}

TASK: Synthesize these demand signals into 1–2 distinct, highly engaging topic candidates for educational psychoeducation articles (1,200–1,600 words).
Focus on the authentic emotional struggles expressed in the queries, not generic advice.

Provide output as a JSON array of objects:
[
  {
    "title": "A compelling working title using the audience's own language",
    "underlying_problem": "1–2 sentences explaining the emotional/practical struggle behind the search",
    "intended_audience": "Specific description of who this helps",
    "search_intent": "What the person hopes to find (e.g. validation, somatic tools, parts understanding)",
    "demand_signals_summary": [signalId1, signalId2],
    "cluster": "${clusterId}"
  }
]`,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
        },
      });

      let candidates = safeJsonParse(response.text);
      if (!candidates) {
        console.warn(`  ⚠ Could not parse JSON for cluster ${clusterName}, skipping cluster.`);
        continue;
      }
      if (!Array.isArray(candidates)) {
        candidates = [candidates];
      }

      for (const c of candidates) {
        if (!c.title) continue;
        const signalIds = Array.isArray(c.demand_signals_summary) ? c.demand_signals_summary : [];

        const result = insertCandidate({
          title: c.title,
          underlying_problem: c.underlying_problem || '',
          intended_audience: c.intended_audience || TARGET_AUDIENCE.primary,
          search_intent: c.search_intent || 'Validation and practical psychoeducation',
          demand_signals_summary: JSON.stringify(signalIds),
          cluster: clusterId,
        });

        results.push({ id: result.lastInsertRowid, ...c, cluster: clusterId });
        console.log(`  ✓ [${clusterName}] Candidate: "${c.title}"`);
      }
    } catch (clusterErr) {
      console.warn(`  ⚠ Cluster ${clusterName} topic grouping failed: ${clusterErr.message}`);
    }
  }

  // Mark all processed signals
  markSignalsProcessed(signals.map(s => s.id));

  console.log(`  → ${results.length} topic candidates created from ${signals.length} signals.`);
  return results;
}

export default { collectTopics };
