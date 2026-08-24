/**
 * Stage 2 — Step 02: Topic Scorer
 *
 * Applies the 25-point scoring matrix to each topic candidate.
 * Uses Gemini for assessment with structured output.
 */

import { GoogleGenAI } from '@google/genai';
import {
  getSystemPrompt,
  SCORING_MATRIX,
  MODALITIES,
  SPIRITUAL_INTEGRATION,
  TARGET_AUDIENCE,
} from '../config/behold-profile.js';
import { getCandidates, insertScoredTopic } from '../database/db.js';
import db from '../database/db.js';

/**
 * Scores all unscored topic candidates.
 */
export async function scoreTopics(apiKey, candidateIds = null) {
  const ai = new GoogleGenAI({ apiKey });

  // Get candidates that haven't been scored yet
  let candidates;
  if (candidateIds) {
    candidates = candidateIds.map(id =>
      db.prepare('SELECT * FROM topic_candidates WHERE id = ?').get(id)
    ).filter(Boolean);
  } else {
    candidates = db.prepare(`
      SELECT tc.* FROM topic_candidates tc
      LEFT JOIN scored_topics st ON tc.id = st.candidate_id
      WHERE st.id IS NULL
      ORDER BY tc.created_at DESC
    `).all();
  }

  if (candidates.length === 0) {
    console.log('  ℹ No unscored candidates found.');
    return [];
  }

  console.log(`  → Scoring ${candidates.length} topic candidates...`);

  const metricsDescription = SCORING_MATRIX.metrics
    .map(m => `- ${m.id} (${m.name}): ${m.question} [Score 5 = ${m.maxScore}]`)
    .join('\n');

  const modalitiesDescription = MODALITIES
    .map(m => `- ${m.shortName}: ${m.description}`)
    .join('\n');

  const results = [];

  for (const candidate of candidates) {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Score this content opportunity using the 25-point matrix below.

TOPIC CANDIDATE:
- Title: "${candidate.title}"
- Underlying Problem: ${candidate.underlying_problem}
- Intended Audience: ${candidate.intended_audience}
- Search Intent: ${candidate.search_intent}
- Cluster: ${candidate.cluster}

SCORING CRITERIA (score each 1–5):
${metricsDescription}

BEHOLD'S MODALITIES (for M3 — Behold Fit):
${modalitiesDescription}
- Spiritual Integration: ${SPIRITUAL_INTEGRATION.description}

TARGET AUDIENCE: ${TARGET_AUDIENCE.primary}
Segments: ${TARGET_AUDIENCE.segments.join('; ')}

Provide your response as JSON with these fields:
{
  "m1_audience_relevance": <1-5>,
  "m2_visible_demand": <1-5>,
  "m3_behold_fit": <1-5>,
  "m4_client_usefulness": <1-5>,
  "m5_distinctive_angle": <1-5>,
  "behold_modality_connection": "<which modalities connect and how — be specific>",
  "repurposing_potential": "<what derivative content can be created>",
  "score_rationale": "<2-3 sentence justification for the scores>"
}

Be honest and critical. Not every topic deserves a 5. Use the full range.`,
      config: {
        systemInstruction: getSystemPrompt('You are scoring content opportunities for a clinical counselling practice.'),
        responseMimeType: 'application/json',
      },
    });

    let scores;
    try {
      scores = JSON.parse(response.text);
    } catch {
      console.warn(`  ⚠ Failed to parse scores for "${candidate.title}", skipping.`);
      continue;
    }

    const scored = {
      candidate_id: candidate.id,
      m1_audience_relevance: Math.min(5, Math.max(1, scores.m1_audience_relevance)),
      m2_visible_demand: Math.min(5, Math.max(1, scores.m2_visible_demand)),
      m3_behold_fit: Math.min(5, Math.max(1, scores.m3_behold_fit)),
      m4_client_usefulness: Math.min(5, Math.max(1, scores.m4_client_usefulness)),
      m5_distinctive_angle: Math.min(5, Math.max(1, scores.m5_distinctive_angle)),
      behold_modality_connection: scores.behold_modality_connection || '',
      repurposing_potential: scores.repurposing_potential || '',
      score_rationale: scores.score_rationale || '',
    };

    const total = scored.m1_audience_relevance + scored.m2_visible_demand +
      scored.m3_behold_fit + scored.m4_client_usefulness + scored.m5_distinctive_angle;

    const result = insertScoredTopic(scored);

    const threshold = Object.values(SCORING_MATRIX.thresholds)
      .find(t => total >= t.min && total <= t.max);

    console.log(`  ✓ "${candidate.title}" → ${total}/25 [${threshold?.label || 'Unknown'}]`);
    results.push({ id: result.lastInsertRowid, total, ...scored });
  }

  // Print ranking summary
  console.log('\n  ─── RANKING SUMMARY ───');
  const allScored = db.prepare(`
    SELECT st.*, tc.title
    FROM scored_topics st
    JOIN topic_candidates tc ON st.candidate_id = tc.id
    ORDER BY st.total_score DESC
    LIMIT 10
  `).all();

  for (let i = 0; i < allScored.length; i++) {
    console.log(`  #${i + 1}: ${allScored[i].title} → ${allScored[i].total_score}/25`);
  }

  return results;
}

/**
 * Returns the top N scored topics.
 */
export function getTopTopics(n = 10) {
  return db.prepare(`
    SELECT st.*, tc.title, tc.underlying_problem, tc.intended_audience,
           tc.search_intent, tc.cluster, tc.demand_signals_summary
    FROM scored_topics st
    JOIN topic_candidates tc ON st.candidate_id = tc.id
    ORDER BY st.total_score DESC
    LIMIT ?
  `).all(n);
}

export default { scoreTopics, getTopTopics };
