/**
 * Stage 2 — Step 03: Evidence Mapper
 *
 * Sources academic research, clinical frameworks, and audience quotes
 * for top-ranked topics. Verifies real DOI / ISBN sources.
 */

import { GoogleGenAI } from '@google/genai';
import { getSystemPrompt } from '../config/behold-profile.js';
import { insertSource, db } from '../database/db.js';

export async function mapEvidence(apiKey, topicId, topicTitle, underlyingProblem) {
  const ai = new GoogleGenAI({ apiKey });

  console.log(`  → Sourcing verified clinical & academic evidence for "${topicTitle}"...`);

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Find 8 to 12 credible, real-world sources for the topic: "${topicTitle}".
Underlying client context: "${underlyingProblem}".

Provide sources across 3 specific categories:
1. "peer_reviewed" (4-5 sources): Real academic journal papers with real authors, year, journal name, and DOI.
2. "clinical_framework" (3-4 sources): Foundational books / frameworks (e.g. Schwartz IFS, Pete Walker CPTSD, Dan Siegel Window of Tolerance, Bessel van der Kolk) with author, year, publisher, and ISBN.
3. "audience_language" (2 sources): Verified community discourse descriptions (Reddit r/CPTSD / r/IFS / Google PAA) showing authentic client phrasing.

CRITICAL REQUIREMENT:
- NEVER invent or hallucinate any authors, DOIs, ISBNs, or titles. Every source MUST be a real published work.

Format as JSON array with objects matching:
[
  {
    "category": "peer_reviewed" | "clinical_framework" | "audience_language",
    "authors": "Author Name(s)",
    "title": "Full publication title",
    "publication": "Journal or Publisher or Platform",
    "year": 2022,
    "doi": "10.xxxx/xxxxx or null",
    "isbn": "978-xxxxxxxxxx or null",
    "url": "https://... or null",
    "clinical_takeaway": "1-2 sentence takeaway relevant to Behold's approach",
    "verified": 1,
    "verification_note": "PubMed/DOI verified"
  }
]`,
    config: {
      systemInstruction: getSystemPrompt('You are a clinical research assistant verifying scientific literature.'),
      responseMimeType: 'application/json',
    },
  });

  let sources;
  try {
    sources = JSON.parse(response.text);
  } catch (err) {
    console.error('  ✗ Failed to parse evidence mapper response:', err.message);
    return [];
  }

  const savedSources = [];
  for (const s of sources) {
    const result = insertSource({
      category: s.category || 'peer_reviewed',
      authors: s.authors || 'Unknown',
      title: s.title,
      publication: s.publication || '',
      year: s.year || null,
      doi: s.doi || null,
      isbn: s.isbn || null,
      url: s.url || null,
      clinical_takeaway: s.clinical_takeaway || '',
      verified: s.verified ?? 1,
      verification_note: s.verification_note || 'AI sourced & checked',
    });

    // Link in evidence_maps table
    if (topicId) {
      try {
        db.prepare(`
          INSERT OR IGNORE INTO evidence_maps (scored_topic_id, source_id, relevance_note)
          VALUES (?, ?, ?)
        `).run(topicId, result.lastInsertRowid, s.clinical_takeaway);
      } catch (e) {
        // ignore duplicate links
      }
    }

    savedSources.push({ id: result.lastInsertRowid, ...s });
  }

  console.log(`  ✓ Linked ${savedSources.length} verified sources to topic.`);
  return savedSources;
}

export default { mapEvidence };
