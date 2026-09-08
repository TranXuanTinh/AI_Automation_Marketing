/**
 * CLI Runner: CRW-Powered Web Crawling & Scraping
 *
 * Runs CRW-powered web scraping for enhanced audience research.
 * Uses CRW to scrape real web content instead of relying on AI simulation.
 *
 * Usage: npm run crawl
 *
 * Requires: CRW server running locally (or cloud API key)
 * Install: curl -fsSL https://fastcrw.com/install | sh
 */

import dotenv from 'dotenv';
dotenv.config();

import { createCRWClientFromEnv, isCRWConfigured } from '../crawlers/crw-client.js';
import { searchAcademicSources, scrapeCompetitorContent, crawlSite, discoverSiteUrls } from '../crawlers/web-researcher.js';
import { scanGooglePAA } from '../listeners/google-paa.js';
import { scanReddit } from '../listeners/reddit-scanner.js';
import { scanYouTube } from '../listeners/youtube-scanner.js';

async function main() {
  const geminiApiKey = process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY || process.env.GEMINI_API_KEY || process.env.XFTOKEN_API_KEY;
  if (!geminiApiKey) {
    console.error('❌ Error: OPENAI_API_KEY, GEMINI_API_KEY, or XFTOKEN_API_KEY environment variable is required.');
    process.exit(1);
  }

  console.log('====================================================');
  console.log('🕷️  BEHOLD AI CONTENT SYSTEM: CRW WEB CRAWLER');
  console.log('====================================================');

  // Check CRW availability
  if (!isCRWConfigured()) {
    console.error('\n❌ CRW is not configured.');
    console.error('   Set CRW_BASE_URL in your .env file (default: http://localhost:3000)');
    console.error('');
    console.error('   Install CRW (self-hosted, free):');
    console.error('   curl -fsSL https://fastcrw.com/install | sh');
    console.error('');
    console.error('   Or get a cloud API key (1000 free credits):');
    console.error('   https://fastcrw.com/register');
    process.exit(1);
  }

  const crw = createCRWClientFromEnv();
  const available = await crw.isAvailable();

  if (!available) {
    const config = crw.getConfig();
    console.error(`\n❌ CRW server is not reachable at ${config.baseUrl}`);
    console.error('   Make sure CRW is running: npm run crw (or crw serve --port 3002)');
    console.error('   Or check your CRW_BASE_URL in .env');
    process.exit(1);
  }

  const config = crw.getConfig();
  console.log(`\n✅ CRW connected: ${config.baseUrl} (${config.isCloud ? 'Cloud' : 'Self-hosted'})`);

  // Parse command-line arguments
  const args = process.argv.slice(2);
  const command = args[0] || 'all';

  switch (command) {
    case 'all':
      await runAllListeners(geminiApiKey);
      break;

    case 'google':
      console.log('\n[CRW] Scanning Google PAA with real web scraping...');
      await scanGooglePAA(geminiApiKey);
      break;

    case 'reddit':
      console.log('\n[CRW] Scanning Reddit with content enrichment...');
      await scanReddit();
      break;

    case 'youtube':
      console.log('\n[CRW] Scanning YouTube with web search...');
      await scanYouTube(geminiApiKey, process.env.YOUTUBE_API_KEY);
      break;

    case 'search':
      if (!args[1]) {
        console.error('Usage: npm run crawl -- search "your query"');
        process.exit(1);
      }
      await runSearch(crw, args.slice(1).join(' '));
      break;

    case 'scrape':
      if (!args[1]) {
        console.error('Usage: npm run crawl -- scrape https://example.com');
        process.exit(1);
      }
      await runScrape(crw, args[1]);
      break;

    case 'crawl':
      if (!args[1]) {
        console.error('Usage: npm run crawl -- crawl https://example.com');
        process.exit(1);
      }
      await runCrawl(crw, args[1]);
      break;

    case 'academic':
      if (!args[1]) {
        console.error('Usage: npm run crawl -- academic "IFS therapy PTSD"');
        process.exit(1);
      }
      await runAcademicSearch(args.slice(1).join(' '));
      break;

    default:
      console.log(`
Usage: npm run crawl [command] [args]

Commands:
  all         Run all CRW-powered listeners (Google PAA + Reddit + YouTube)
  google      Scan Google PAA with CRW web search
  reddit      Scan Reddit with CRW content enrichment
  youtube     Scan YouTube with CRW web search
  search      Search the web: npm run crawl -- search "query"
  scrape      Scrape a URL:   npm run crawl -- scrape https://example.com
  crawl       Crawl a site:   npm run crawl -- crawl https://example.com
  academic    Search academic sources: npm run crawl -- academic "query"
`);
  }
}

async function runAllListeners(geminiApiKey) {
  console.log('\n[1/3] 🔍 Scanning Google PAA with CRW web search...');
  await scanGooglePAA(geminiApiKey);

  console.log('\n[2/3] 📱 Scanning Reddit with CRW enrichment...');
  await scanReddit();

  console.log('\n[3/3] 🎬 Scanning YouTube with CRW web search...');
  await scanYouTube(geminiApiKey, process.env.YOUTUBE_API_KEY);

  console.log('\n✅ CRW-powered listening complete! Demand signals captured in database.');
  console.log('Next step: run `npm run research` to process signals into ranked topics.');
}

async function runSearch(crw, query) {
  console.log(`\n🔍 Searching: "${query}"\n`);

  const result = await crw.search(query, { limit: 10, formats: ['markdown'] });

  if (result.success && result.data) {
    for (const item of result.data) {
      console.log(`  📄 ${item.title || 'Untitled'}`);
      console.log(`     ${item.url || ''}`);
      console.log(`     ${(item.description || '').substring(0, 150)}`);
      console.log('');
    }
    console.log(`  Total: ${result.data.length} results`);
  } else {
    console.log('  No results found.');
  }
}

async function runScrape(crw, url) {
  console.log(`\n🕷️  Scraping: ${url}\n`);

  const result = await crw.scrape(url, { formats: ['markdown'] });

  if (result.success && result.data) {
    const md = result.data.markdown || '';
    console.log(`  Title: ${result.data.metadata?.title || 'Unknown'}`);
    console.log(`  Status: ${result.data.metadata?.statusCode || 'Unknown'}`);
    console.log(`  Content length: ${md.length} chars`);
    console.log('');
    console.log(md.substring(0, 2000));
    if (md.length > 2000) console.log('\n  ... (truncated)');
  } else {
    console.log('  Scrape failed.');
  }
}

async function runCrawl(crw, url) {
  console.log(`\n🕷️  Crawling: ${url}\n`);

  const result = await crw.crawl(url, { maxPages: 20, maxDepth: 2 });

  if (result.success && result.data) {
    console.log(`  Pages crawled: ${result.data.length}`);
    for (const page of result.data) {
      const pageUrl = page.metadata?.sourceURL || 'Unknown';
      const title = page.metadata?.title || 'Untitled';
      console.log(`  📄 ${title} (${pageUrl})`);
    }
  } else {
    console.log('  Crawl failed or timed out.');
  }
}

async function runAcademicSearch(query) {
  console.log(`\n📚 Academic search: "${query}"\n`);

  const results = await searchAcademicSources(query, { limit: 10 });

  if (results.length > 0) {
    for (const r of results) {
      console.log(`  📄 ${r.title || 'Untitled'}`);
      console.log(`     ${r.url || ''}`);
      console.log(`     ${(r.description || '').substring(0, 200)}`);
      console.log('');
    }
    console.log(`  Total: ${results.length} academic sources found`);
  } else {
    console.log('  No academic sources found.');
  }
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
