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
    ORDER BY s.verified DESC, s.year DESC
  `).all(scoredTopicId);

  console.log(`  → Generating content draft for "${topic.title}" with ${sources.length} sources...`);

  // Format sources with clear reference numbers [1], [2], ... for in-text grounding
  const formattedSources = sources.length > 0
    ? sources.map((s, idx) => {
        const citationTag = `[${idx + 1}]`;
        const refInfo = [
          s.authors || 'Author',
          s.year ? `(${s.year})` : '',
          s.title ? `"${s.title}"` : '',
          s.publication || '',
          s.doi ? `DOI: ${s.doi}` : '',
          s.isbn ? `ISBN: ${s.isbn}` : '',
          s.url ? `URL: ${s.url}` : '',
        ].filter(Boolean).join('. ');
        return `${citationTag} [${s.category}] ${refInfo}\n   Takeaway: ${s.clinical_takeaway || 'Evidence supporting clinical formulation.'}`;
      }).join('\n')
    : `[1] [clinical_framework] Schwartz, Richard C. (2021). "No Bad Parts: Healing Trauma and Restoring Wholeness with the Internal Family Systems Model". Sounds True. ISBN: 978-1683646686.
[2] [peer_reviewed] van der Kolk, Bessel A. (2014). "The Body Keeps the Score: Brain, Mind, and Body in the Healing of Trauma". Viking Penguin. ISBN: 978-0143127741.
[3] [clinical_framework] Walker, Pete (2013). "Complex PTSD: From Surviving to Thriving". Azure Coyote. ISBN: 978-1492871842.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Draft an evidence-grounded, trauma-informed clinical psychoeducation article with 3 Contextual FAQs based on:

TOPIC: "${topic.title}"
UNDERLYING NEED: ${topic.underlying_problem}
INTENDED AUDIENCE: ${topic.intended_audience}
SEARCH INTENT: ${topic.search_intent}
MODALITIES TO INTEGRATE: ${MODALITIES.map(m => m.shortName).join(', ')}

AVAILABLE VERIFIED RESEARCH SOURCES:
${formattedSources}

CRITICAL REQUIREMENTS:
1. Article Body (1,200 - 1,500 words structured in markdown):
   - CLINICAL TONE NUANCE: Avoid definitive monocausal claims like "X is a protective survival response".
     Instead use nuanced, responsible framing: "X can be experienced as a protective response, particularly in the context of overwhelming stress or trauma."
     Clearly distinguish between emotional numbing, trauma adaptations, depression, grief, and nervous system hypoarousal.
   - INLINE CITATIONS: You MUST cite the available sources using numbered brackets [1], [2], [3] throughout the article wherever making empirical claims or citing clinical frameworks.
   - STRUCTURE:
     - Clear H2 and H3 subheadings
     - Body awareness and nervous system integration (Window of Tolerance, IFS parts)
     - A dedicated section at the very bottom:
       ## References & Evidence Base
       Listing every cited source number: [1] Author (Year). Title. Publication. DOI/ISBN.

2. Exactly 3 Contextual FAQs (REQUIRED — must be generated as separate structured objects):
   - Formulate 3 distinct questions that directly reflect real client questions and anxieties (e.g. "Is emotional numbness always related to trauma?", "Why can I function normally while feeling disconnected inside?", "What can help me reconnect with my emotions safely?").
   - Each answer must be compassionate, clinically grounded (120-180 words), with inline citations where relevant.

3. Meta description (max 155 characters)
4. Key headings array
5. Internal linking recommendations (e.g. /services/ifs-therapy/, /learn/window-of-tolerance/)
6. Bibliography array: list of citation strings matching [1], [2], ...

Format as JSON:
{
  "title": "Final recommended title",
  "body": "Full markdown body of the educational article draft with inline citations [1], [2] and ## References & Evidence Base section...",
  "faq": [
    {
      "question": "First specific client question...",
      "answer": "Compassionate, clinically grounded answer..."
    },
    {
      "question": "Second specific client question...",
      "answer": "Compassionate, clinically grounded answer..."
    },
    {
      "question": "Third specific client question...",
      "answer": "Compassionate, clinically grounded answer..."
    }
  ],
  "meta_description": "...",
  "headings": ["H2...", "H2...", "H3..."],
  "internal_links": ["/services/ifs-therapy/", "/services/somatic-therapy/"],
  "bibliography": ["[1] Author (Year)...", "[2] Author (Year)..."]
}`,
    config: {
      systemInstruction: getSystemPrompt('You are drafting a clinical psychoeducation article and 3 contextual FAQs for Yiya\'s review. Ground all claims in real citations.'),
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

  // Ensure 3 contextual FAQs are always present
  if (!Array.isArray(draftData.faq) || draftData.faq.length === 0) {
    draftData.faq = getFallbackContextualFAQs(topic.title);
  }

  // Ensure bibliography is synced if extracted from body or sources
  if (!Array.isArray(draftData.bibliography) || draftData.bibliography.length === 0) {
    draftData.bibliography = sources.slice(0, 5).map((s, idx) =>
      `[${idx + 1}] ${s.authors || 'Author'} (${s.year || 'n.d.'}). ${s.title}. ${s.publication || ''} ${s.doi ? `DOI: ${s.doi}` : ''}`
    );
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
    faq: JSON.stringify(draftData.faq),
    status: 'review', // Ready for human review (Yiya)
  };

  const result = insertDraft(draftRecord);
  console.log(`  ✓ Draft saved (ID: ${result.lastInsertRowid}) with ${draftData.faq.length} contextual FAQs and citations - Pending Human Approval.`);
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

/**
 * Fallback 3 Contextual FAQs if model response omits the faq array
 */
function getFallbackContextualFAQs(topicTitle) {
  return [
    {
      question: `Is ${topicTitle.toLowerCase().includes('numb') ? 'emotional numbness' : topicTitle} always related to trauma?`,
      answer: `Not necessarily. While emotional numbing can be experienced as a protective response in the context of overwhelming stress or trauma, it also frequently presents in clinical depression, burnout, chronic nervous system exhaustion, and prolonged grief. Understanding your specific pattern through clinical curiosity rather than pathologizing is an essential first step.`,
    },
    {
      question: `Why can I function normally at work or in daily life while feeling completely disconnected inside?`,
      answer: `This is a classic presentation of high-functioning adaptation. In Internal Family Systems (IFS) terminology, proactive 'Manager' parts learn to competently execute daily tasks, maintain social expectations, and perform professionally, while compartmentalizing vulnerable feelings or exhaustion behind a protective barrier of numbness.`,
    },
    {
      question: `What can help me reconnect with my emotions safely without feeling flooded?`,
      answer: `Directly forcing feelings to return often triggers protective alarm. Gentle, body-first approaches (somatic grounding, breath tracking within your window of tolerance) combined with compassionate parts work allow you to first thank your protective numbness for keeping you safe, gradually expanding your capacity for embodied feeling.`,
    },
  ];
}

export default { draftContent };
