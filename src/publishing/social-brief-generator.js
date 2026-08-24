/**
 * Stage 3 — Social & Visual Production Brief Generator
 *
 * Generates structured creative briefs for visual freelancers and
 * repurposing across Yiya and Behold ecosystems (Pinterest, IG, YouTube, LinkedIn, Substack).
 */

import { GoogleGenAI } from '@google/genai';
import { getSystemPrompt } from '../config/behold-profile.js';
import { insertBrief, db } from '../database/db.js';

export async function generateSocialBriefs(apiKey, draftId) {
  const ai = new GoogleGenAI({ apiKey });

  const draft = db.prepare('SELECT * FROM content_drafts WHERE id = ?').get(draftId);
  if (!draft) throw new Error(`Draft ID ${draftId} not found`);

  console.log(`  → Creating repurposing briefs for approved draft: "${draft.title}"...`);

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Generate multi-channel visual and social production briefs for this approved article:

TITLE: "${draft.title}"
CONTENT SUMMARY: ${draft.body.substring(0, 1000)}...

Generate briefs across these 6 formats:
1. "infographic": 1 concept for visual freelancer (layout, key takeaways, diagrams)
2. "quote": 3-5 visual quote cards for Instagram / Pinterest
3. "pinterest": 2 Pinterest Pin packages (title overlay, description, CTA)
4. "linkedin": 1 LinkedIn post concept focusing on professional over-functioning & nervous system
5. "substack": 1 personal newsletter introductory note from Yiya
6. "youtube_short": 1 script (30-45 sec) for short-form video

Format as JSON array:
[
  {
    "brief_type": "infographic" | "quote" | "pinterest" | "linkedin" | "substack" | "youtube_short",
    "concept": "Concept overview",
    "copy": "Exact text or script",
    "specifications": "Dimensions, duration, or visual notes"
  }
]`,
    config: {
      systemInstruction: getSystemPrompt('You are a creative director generating multi-channel asset briefs.'),
      responseMimeType: 'application/json',
    },
  });

  let briefs;
  try {
    briefs = JSON.parse(response.text);
  } catch (err) {
    console.error('  ✗ Failed to parse briefs:', err.message);
    return [];
  }

  const savedBriefs = [];
  for (const b of briefs) {
    const res = insertBrief({
      draft_id: draftId,
      brief_type: b.brief_type,
      concept: b.concept,
      copy: b.copy,
      specifications: JSON.stringify(b.specifications || {}),
    });
    savedBriefs.push({ id: res.lastInsertRowid, ...b });
  }

  console.log(`  ✓ Generated ${savedBriefs.length} creative briefs.`);
  return savedBriefs;
}

export default { generateSocialBriefs };
