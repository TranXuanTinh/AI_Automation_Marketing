# Setup & Operations Guide
> **Behold AI-First Content System: Step-by-Step Installation and Execution**

This guide provides complete instructions on configuring environment variables, running research cycles, managing the clinical review gate, and deploying the web application.

---

## 1. Environment & Prerequisites

### System Requirements
- **Node.js**: `v18.0.0` or higher
- **NPM**: `v9.0.0` or higher
- **Disk Space**: ~100MB (SQLite database creates locally in `./data/behold.db`)
- **CRW Web Scraper** *(optional)*: For real-time web scraping (self-hosted or cloud)

### Obtaining Your Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Sign in with your Google account.
3. Click **"Get API Key"** $\rightarrow$ **"Create API Key"**.
4. Copy the API key and store it securely.

---

## 2. Installation & Configuration

### Step 1: Clone or Navigate to the Workspace
```bash
cd /media/tinhtran/01D85BC599D1D460/FreeLancer/AI_Automation_Marketing
```

### Step 2: Install Node Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Create your local `.env` file from the provided `.env.example`:
```bash
cp .env.example .env
```

Open `.env` and fill in your keys:
```env
# Required:
GEMINI_API_KEY=AIzaSy...your_gemini_api_key_here

# Optional (for enhanced live YouTube searches):
YOUTUBE_API_KEY=

# Optional: CRW Web Scraper (recommended for real web scraping)
# Self-hosted: curl -fsSL https://fastcrw.com/install | sh
CRW_BASE_URL=http://localhost:3000
CRW_API_KEY=

# Server Settings:
PORT=3000
NODE_ENV=development
```

### Step 4: Install CRW Web Scraper (Optional but Recommended)

CRW enables real web scraping instead of AI-simulated data:

```bash
# One-command install (macOS & Linux)
curl -fsSL https://fastcrw.com/install | sh

# Start CRW server (runs on http://localhost:3000 by default)
crw
```

> **Note:** If your Behold server also uses port 3000, either change the Behold `PORT` in `.env` to `3001`, or start CRW on a different port with `crw --port 3002` and set `CRW_BASE_URL=http://localhost:3002` in `.env`.

For cloud API (no binary to install):
1. Register at [fastcrw.com/register](https://fastcrw.com/register) (1000 free credits)
2. Set `CRW_API_KEY=crw_live_your_key` and `CRW_BASE_URL=https://api.fastcrw.com` in `.env`

See the full [CRW Integration Guide](CRW_INTEGRATION.md) for detailed documentation.

---

## 3. Running the System

### Option A: Complete End-to-End Workflow via CLI

1. **Seed Verified Research Data (Offline Demo Mode):**
   ```bash
   npm run seed
   ```
   *Instantly loads the verified Beta 1 research findings into SQLite.*

2. **Run Audience Listening (Stage 1):**
   ```bash
   npm run listen
   ```
   *Scans Google PAA trees, Reddit (r/CPTSD, r/IFS), and therapist YouTube channels.*

3. **Run Topic Research, Scoring & Drafting (Stage 2):**
   ```bash
   npm run research
   ```
   *Groups signals, scores top opportunities on the 25-pt matrix, maps PubMed citations, and generates clinical article drafts.*

4. **Launch the Review Dashboard (Stage 3):**
   ```bash
   npm start
   ```
   *Open **`http://localhost:3000`** in your browser to access the Clinical Approval Gate.*

---

### Option B: Using the Web Dashboard (Recommended for Yiya)

Start the server:
```bash
npm start
```
Navigate to **`http://localhost:3000`** to access all dashboard tabs:

1. **Pipeline Overview:** Live metrics on captured demand signals, topic candidates, and verified sources.
2. **Ranked Topics:** Full view of scored opportunities with 1–5 metric breakdowns.
3. **Human Approval Gate:** Read article drafts, inspect source references, and click **"Approve & Generate Briefs"** or **"Request Revision"**.
4. **Verified Source Library:** Search and inspect real DOIs, ISBNs, and clinical takeaways.
5. **Log Client FAQ:** Form for Yiya to log live client questions from therapy sessions.

---

## 4. Production Deployment & Scheduling

### Running with Process Manager (PM2)
To keep the server running continuously in production or on a VPS:
```bash
# Install PM2 globally
npm install -g pm2

# Start Behold server
pm2 start server.js --name "behold-system"

# Save configuration to reboot automatically
pm2 save
pm2 startup
```

### Automated Cron Scheduling
The system automatically includes a weekly cron job inside `server.js` that runs every Monday at 9:00 AM:
```javascript
cron.schedule('0 9 * * 1', () => {
  console.log('⏰ Running weekly performance review & learning audit...');
  generateLearningReport();
});
```

You can also set up Linux `crontab` to trigger automated audience scanning:
```bash
# Open crontab
crontab -e

# Run Stage 1 listener every Wednesday at midnight
0 0 * * 3 cd /path/to/project && npm run listen >> logs/listeners.log 2>&1
```

---

## 5. Troubleshooting & Common Issues

| Issue | Cause | Resolution |
|---|---|---|
| `GEMINI_API_KEY is required` | Missing or blank `.env` key | Ensure `.env` exists and contains a valid `GEMINI_API_KEY`. |
| `Cannot find module '@google/genai'` | Dependencies not installed | Run `npm install` to download all packages. |
| `better-sqlite3 compilation error` | Missing C++ build tools on host OS | Install standard build tools: `sudo apt-get install build-essential python3` (Linux). |
| `Port 3000 already in use` | Another process is using port 3000 | Set `PORT=3001` in `.env` or kill the running process. |
| `CRW server is not reachable` | CRW binary not running | Start with `crw` command, or check `CRW_BASE_URL` in `.env`. |
| `CRW not configured` | Missing CRW env vars | Add `CRW_BASE_URL=http://localhost:3000` to `.env`. |
| `CRW configured but not reachable` | CRW server offline or wrong URL | Verify with `curl http://localhost:3000/health`. Start CRW: `crw`. |
| Listeners still use Gemini mode | CRW health check fails | Ensure CRW is running and `CRW_BASE_URL` points to correct port. |
