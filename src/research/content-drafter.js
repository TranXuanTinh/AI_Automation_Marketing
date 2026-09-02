/**
 * Stage 2 — Step 04: Content Drafter
 *
 * Generates initial draft content: educational article outline/draft,
 * client FAQ, SEO metadata, and internal link suggestions.
 */

import { createAIClient, safeJsonParse } from '../config/ai-client.js';
import { getSystemPrompt, TONE_GUIDELINES, MODALITIES } from '../config/behold-profile.js';
import { insertDraft, db } from '../database/db.js';

export async function draftContent(apiKey, scoredTopicId) {
  const ai = createAIClient(apiKey);

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

  let draftData = safeJsonParse(response.text);
  if (!draftData || !draftData.body) {
    draftData = extractDraftFieldsFallback(response.text, topic.title);
  }

  if (!draftData.body) {
    console.error('  ✗ Failed to parse or extract content draft.');
    return null;
  }

  const draftRecord = {
    scored_topic_id: scoredTopicId,
    draft_type: 'article',
    title: draftData.title || topic.title,
    body: draftData.body,
    meta_description: draftData.meta_description || '',
    headings: JSON.stringify(draftData.headings || []),
    internal_links: JSON.stringify(draftData.internal_links || []),
    bibliography: JSON.stringify(draftData.bibliography || []),
    status: 'review', // Ready for human review (Yiya)
  };

  const result = insertDraft(draftRecord);
  console.log(`  ✓ Draft saved (ID: ${result.lastInsertRowid}) - Pending Human Approval.`);
  return { id: result.lastInsertRowid, ...draftRecord, faq: draftData.faq };
}

function extractDraftFieldsFallback(rawText, defaultTitle = '') {
  const result = {
    title: defaultTitle,
    body: '',
    faq: [],
    meta_description: '',
    headings: [],
    internal_links: [],
    bibliography: [],
  };

  if (!rawText) return result;

  const titleMatch = rawText.match(/"title"\s*:\s*"([^"]+)"/);
  if (titleMatch) result.title = titleMatch[1];

  const metaMatch = rawText.match(/"meta_description"\s*:\s*"([^"]+)"/);
  if (metaMatch) result.meta_description = metaMatch[1];

  const bodyMatch = rawText.match(/"body"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"(?:faq|meta_description|headings|internal_links|bibliography)"|"\s*\}$)/);
  if (bodyMatch) {
    result.body = bodyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  } else {
    result.body = rawText.replace(/```(?:json|markdown)?/g, '').replace(/```/g, '').trim();
  }

  const headingsMatch = rawText.match(/"headings"\s*:\s*(\[[^\]]*\])/);
  if (headingsMatch) {
    try { result.headings = JSON.parse(headingsMatch[1]); } catch {}
  }

  const faqMatch = rawText.match(/"faq"\s*:\s*(\[[\s\S]*?\])(?:\s*,\s*"(?:meta_description|headings|internal_links|bibliography)"|\s*\}$)/);
  if (faqMatch) {
    try { result.faq = JSON.parse(faqMatch[1]); } catch {}
  }

  const linksMatch = rawText.match(/"internal_links"\s*:\s*(\[[^\]]*\])/);
  if (linksMatch) {
    try { result.internal_links = JSON.parse(linksMatch[1]); } catch {}
  }

  const bibMatch = rawText.match(/"bibliography"\s*:\s*(\[[^\]]*\])/);
  if (bibMatch) {
    try { result.bibliography = JSON.parse(bibMatch[1]); } catch {}
  }

  return result;
}

export default { draftContent };
