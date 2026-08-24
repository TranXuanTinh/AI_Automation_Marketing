/**
 * Stage 2 — Step 04: Content Drafter
 *
 * Generates initial draft content: educational article outline/draft,
 * client FAQ, SEO metadata, and internal link suggestions.
 */

import { GoogleGenAI } from '@google/genai';
import { getSystemPrompt, TONE_GUIDELINES, MODALITIES } from '../config/behold-profile.js';
import { insertDraft, db } from '../database/db.js';

export async function draftContent(apiKey, scoredTopicId) {
  const ai = new GoogleGenAI({ apiKey });

  const topic = db.prepare(`
    SELECT st.*, tc.title, tc.underlying_problem, tc.intended_audience, tc.search_intent, tc.cluster
    FROM scored_topics st
    JOIN topic_candidates tc ON st.candidate_id = tc.id
    WHERE st.id = ?
  `).get(scoredTopicId);

  if (!topic) {
    throw new Error(`Scored topic ID ${scoredTopicId} not found`);
  }

  // Fetch linked evidence
  const sources = db.prepare(`
    SELECT s.* FROM sources s
    JOIN evidence_maps em ON s.id = em.source_id
    WHERE em.scored_topic_id = ?
  `).all(scoredTopicId);

  console.log(`  → Generating content draft for "${topic.title}" with ${sources.length} sources...`);

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Draft a high-quality educational article and client FAQ draft based on:

TOPIC: "${topic.title}"
UNDERLYING NEED: ${topic.underlying_problem}
INTENDED AUDIENCE: ${topic.intended_audience}
SEARCH INTENT: ${topic.search_intent}
MODALITIES TO INTEGRATE: ${MODALITIES.map(m => m.shortName).join(', ')}
AVAILABLE SOURCES:
${sources.map(s => `- [${s.category}] ${s.authors} (${s.year || 'n.d.'}): ${s.title}`).join('\n')}

REQUIREMENTS:
1. Article Body (1,200 - 1,500 words structured in markdown):
   - Compassionate, trauma-informed explanation
   - Normalizing survival adaptations without pathologizing
   - Integrating parts work (IFS) and somatic regulation
   - Clear subheadings (H2, H3)
2. FAQ section: 3-4 common questions with concise answers
3. Meta description (max 155 characters)
4. Key headings array
5. Internal linking recommendations (e.g. to /learn/resources/ or /counselling/)

Format as JSON:
{
  "title": "Final recommended title",
  "body": "Full markdown body of the educational article draft...",
  "faq": [ { "question": "...", "answer": "..." } ],
  "meta_description": "...",
  "headings": ["H2...", "H2...", "H3..."],
  "internal_links": ["/learn/five-minute-grounding/", "/services/ifs-therapy/"],
  "bibliography": ["Citation 1...", "Citation 2..."]
}`,
    config: {
      systemInstruction: getSystemPrompt('You are drafting a clinical psychoeducation article for Yiya\'s review.'),
      responseMimeType: 'application/json',
    },
  });

  let draftData;
  try {
    draftData = JSON.parse(response.text);
  } catch (err) {
    console.error('  ✗ Failed to parse content draft:', err.message);
    return null;
  }

  const draftRecord = {
    scored_topic_id: scoredTopicId,
    draft_type: 'article',
    title: draftData.title || topic.title,
    body: draftData.body,
    meta_description: draftData.meta_description,
    headings: JSON.stringify(draftData.headings || []),
    internal_links: JSON.stringify(draftData.internal_links || []),
    bibliography: JSON.stringify(draftData.bibliography || []),
    status: 'review', // Ready for human review (Yiya)
  };

  const result = insertDraft(draftRecord);
  console.log(`  ✓ Draft saved (ID: ${result.lastInsertRowid}) - Pending Human Approval.`);
  return { id: result.lastInsertRowid, ...draftRecord, faq: draftData.faq };
}

export default { draftContent };
