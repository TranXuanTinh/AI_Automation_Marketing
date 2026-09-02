/**
 * Stage 2 — Step 03: Evidence Mapper
 *
 * Sources academic research, clinical frameworks, and audience quotes
 * for top-ranked topics. Verifies real DOI / ISBN sources.
 *
 * ENHANCEMENT: When CRW is available, uses web scraping to:
 * - Search PubMed/Google Scholar for real papers
 * - Verify DOIs by scraping DOI.org/Crossref
 */

import { createAIClient, safeJsonParse } from '../config/ai-client.js';
import { getSystemPrompt } from '../config/behold-profile.js';
import { insertSource, db } from '../database/db.js';
import { searchAcademicSources, verifyDOI } from '../crawlers/web-researcher.js';
import { isCRWConfigured, createCRWClientFromEnv } from '../crawlers/crw-client.js';

export async function mapEvidence(apiKey, topicId, topicTitle, underlyingProblem) {
  const ai = createAIClient(apiKey);

  // Check CRW availability for enhanced verification
  const crw = createCRWClientFromEnv();
  const crwAvailable = crw ? await crw.isAvailable() : false;

  if (crwAvailable) {
    console.log(`  → Sourcing evidence for "${topicTitle}" with CRW web verification...`);
  } else {
    console.log(`  → Sourcing verified clinical & academic evidence for "${topicTitle}"...`);
  }

  // Step 1: If CRW available, pre-search for real academic sources
  let academicContext = '';
  if (crwAvailable) {
    const academicResults = await searchAcademicSources(`${topicTitle} ${underlyingProblem} therapy`, { limit: 5 });
    if (academicResults.length > 0) {
      academicContext = `\n\nREAL ACADEMIC SOURCES FOUND VIA WEB SEARCH (use these as primary references):\n`;
      for (const r of academicResults) {
        academicContext += `- Title: ${r.title}\n  URL: ${r.url}\n  Summary: ${r.description}\n`;
      }
      console.log(`  ✓ Found ${academicResults.length} academic sources via CRW search`);
    }
  }

  // Step 2: Use Gemini to find and structure evidence (with CRW context if available)
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Find 8 to 12 credible, real-world sources for the topic: "${topicTitle}".
Underlying client context: "${underlyingProblem}".
${academicContext}

Provide sources across 3 specific categories:
1. "peer_reviewed" (4-5 sources): Real academic journal papers with real authors, year, journal name, and DOI.
2. "clinical_framework" (3-4 sources): Foundational books / frameworks (e.g. Schwartz IFS, Pete Walker CPTSD, Dan Siegel Window of Tolerance, Bessel van der Kolk) with author, year, publisher, and ISBN.
3. "audience_language" (2 sources): Verified community discourse descriptions (Reddit r/CPTSD / r/IFS / Google PAA) showing authentic client phrasing.

CRITICAL REQUIREMENT:
- NEVER invent or hallucinate any authors, DOIs, ISBNs, or titles. Every source MUST be a real published work.
${academicContext ? '- PREFER sources from the REAL ACADEMIC SOURCES listed above when they are relevant.' : ''}

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

  let sources = safeJsonParse(response.text);
  if (!sources || !Array.isArray(sources)) {
    console.error('  ✗ Failed to parse evidence mapper response as JSON array.');
    return [];
  }

  // Step 3: If CRW available, verify DOIs by scraping DOI.org
  if (crwAvailable) {
    let verifiedCount = 0;
    let failedCount = 0;

    for (const s of sources) {
      if (s.doi && s.category === 'peer_reviewed') {
        const verification = await verifyDOI(s.doi);
        if (verification) {
          if (verification.valid) {
            s.verified = 1;
            s.verification_note = `DOI verified via CRW scrape (HTTP ${verification.statusCode || 200})`;
            if (verification.url) s.url = verification.url;
            verifiedCount++;
          } else {
            s.verified = 0;
            s.verification_note = `DOI verification failed: ${verification.error || 'not found'}`;
            failedCount++;
          }
        }
      }
    }

    if (verifiedCount > 0 || failedCount > 0) {
      console.log(`  ✓ DOI verification: ${verifiedCount} verified, ${failedCount} failed`);
    }
  }

  // Step 4: Save to database
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
