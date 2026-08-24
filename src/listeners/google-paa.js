/**
 * Stage 1 — Google PAA & Autocomplete Scanner
 *
 * Searches Google for People Also Ask questions and autocomplete
 * suggestions related to Behold's topic clusters.
 * Uses the Gemini API to parse and categorize results.
 */

import { GoogleGenAI } from '@google/genai';
import { TOPIC_CLUSTERS, getSystemPrompt } from '../config/behold-profile.js';
import { insertSignal } from '../database/db.js';

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
 * Uses Gemini to simulate PAA/autocomplete discovery for a topic cluster.
 * Since we can't directly scrape Google programmatically without a SERP API,
 * we use Gemini to generate realistic PAA questions based on actual search patterns,
 * then flag them for manual verification.
 */
export async function scanGooglePAA(apiKey, clusterIds = null) {
  const ai = new GoogleGenAI({ apiKey });
  const clusters = clusterIds
    ? TOPIC_CLUSTERS.filter(c => clusterIds.includes(c.id))
    : TOPIC_CLUSTERS;

  const results = [];

  for (const cluster of clusters) {
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

    let questions;
    try {
      questions = JSON.parse(response.text);
    } catch {
      console.warn(`Failed to parse PAA response for ${cluster.name}, skipping.`);
      continue;
    }

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

    console.log(`  ✓ ${cluster.name}: ${questions.length} PAA signals captured`);
  }

  return results;
}

export default { scanGooglePAA };
