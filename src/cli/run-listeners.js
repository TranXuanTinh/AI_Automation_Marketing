/**
 * CLI Runner: Stage 1 — Run All Listeners
 *
 * Runs all audience listening scanners (Google PAA, Reddit, YouTube).
 * Auto-detects CRW web scraper for enhanced real-time scraping.
 */

import dotenv from 'dotenv';
dotenv.config();

import { scanGooglePAA } from '../listeners/google-paa.js';
import { scanReddit } from '../listeners/reddit-scanner.js';
import { scanYouTube } from '../listeners/youtube-scanner.js';
import { isCRWConfigured, createCRWClientFromEnv } from '../crawlers/crw-client.js';

async function main() {
  const apiKey = process.env.XFTOKEN_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ Error: XFTOKEN_API_KEY or GEMINI_API_KEY environment variable is required.');
    process.exit(1);
  }

  console.log('====================================================');
  console.log('🎧 BEHOLD AI CONTENT SYSTEM: STAGE 1 (LISTEN)');
  console.log('====================================================');

  // Detect CRW availability
  if (isCRWConfigured()) {
    const crw = createCRWClientFromEnv();
    const available = crw ? await crw.isAvailable() : false;
    if (available) {
      const config = crw.getConfig();
      console.log(`\n🔗 CRW Web Scraper: CONNECTED (${config.baseUrl})`);
      console.log('   → Listeners will use real web scraping for enhanced results');
    } else {
      console.log('\n⚠️  CRW configured but not reachable — falling back to Gemini mode');
      console.log('   Start CRW: crw (or check CRW_BASE_URL in .env)');
    }
  } else {
    console.log('\nℹ️  CRW not configured — using Gemini-simulated scanning');
    console.log('   Install CRW for real web scraping: curl -fsSL https://fastcrw.com/install | sh');
  }

  console.log('\n[1/3] Scanning Google People Also Ask & Autocomplete...');
  await scanGooglePAA(apiKey);

  console.log('\n[2/3] Scanning Reddit Community Discussions...');
  await scanReddit();

  console.log('\n[3/3] Scanning YouTube Therapist Channels...');
  await scanYouTube(apiKey, process.env.YOUTUBE_API_KEY);

  console.log('\n✅ Stage 1 complete! Demand signals captured in database.');
  console.log('Next step: run `npm run research` to process signals into ranked topics.');
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
