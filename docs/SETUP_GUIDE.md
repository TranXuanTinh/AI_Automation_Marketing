# Setup & Operations Guide
> **Behold AI-First Content System: Step-by-Step Installation and Execution**

This guide provides complete instructions on configuring environment variables (including **ChatGPT / OpenAI API Key** and **Google Gemini**), running research cycles, managing the clinical review gate, and deploying the web application.

---

## 1. Environment & Prerequisites

### System Requirements
- **Node.js**: `v18.0.0` or higher
- **NPM**: `v9.0.0` or higher
- **Disk Space**: ~100MB (SQLite database creates locally in `./data/behold.db`)
- **AI API Key**: OpenAI ChatGPT API key *(Recommended)* or Google Gemini API key
- **CRW Web Scraper** *(optional)*: For real-time web scraping (self-hosted or cloud)

---

## 2. Obtaining Your AI API Key

The Behold system supports **3 flexible AI providers** through an intelligent auto-detecting client adapter. You only need **one** API key:

### Option A: ChatGPT / OpenAI API Key (Recommended)
1. Visit the [OpenAI API Platform](https://platform.openai.com/).
2. Sign in or create an OpenAI account.
3. Navigate to **[API Keys](https://platform.openai.com/api-keys)**.
4. Click **"+ Create new secret key"**.
5. Give your key a descriptive name (e.g., `Behold-Content-System`).
6. Click **"Create secret key"** and copy the key (format: `sk-proj-...` or `sk-...`).
7. Ensure your OpenAI account has an active credit balance in **[Billing Settings](https://platform.openai.com/settings/billing)** (even a $5 credit provides thousands of research queries with `gpt-4o-mini`).

> 💡 **Recommended Model:** The system defaults to **`gpt-4o-mini`**, which provides exceptional speed, minimal cost, and outstanding trauma-informed reasoning. If you prefer deeper synthesis, set `OPENAI_MODEL=gpt-4o` in `.env`.

### Option B: Google Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Sign in with your Google account.
3. Click **"Get API Key"** $\rightarrow$ **"Create API Key"**.
4. Copy the API key (format: `AIzaSy...`).

### Option C: Custom OpenAI-Compatible LLM (NVIDIA NIM, DeepSeek, Local Ollama)
- If you use NVIDIA NIM, set `XFTOKEN_API_KEY=nvapi-...` and `XFTOKEN_BASE_URL=https://integrate.api.nvidia.com/v1`.
- If you use a self-hosted Ollama or vLLM instance, provide `OPENAI_BASE_URL=http://localhost:11434/v1`.

---

## 3. Installation & Configuration

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

Open `.env` and fill in your configuration:

```env
# ==============================================================================
# 🤖 AI LLM PROVIDER CONFIGURATION (Choose Option 1 or Option 2)
# ==============================================================================

# Option 1: ChatGPT / OpenAI (Recommended)
OPENAI_API_KEY=sk-proj-your_actual_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini

# Option 2: Google Gemini (Alternative)
# GEMINI_API_KEY=AIzaSy...your_gemini_api_key_here

# ==============================================================================
# 🎧 OPTIONAL: Enhanced Listeners
# ==============================================================================
# Optional YouTube Data API key for live search fallback
YOUTUBE_API_KEY=

# Reddit community scanner toggle (true = scan r/CPTSD, r/IFS; false = skip)
ENABLE_REDDIT=false

# ==============================================================================
# 🕷️ OPTIONAL: CRW Web Scraper (https://fastcrw.com)
# ==============================================================================
# Self-hosted: curl -fsSL https://fastcrw.com/install | sh (runs on :3000 or :3002)
CRW_BASE_URL=http://localhost:3000
CRW_API_KEY=

# ==============================================================================
# 🌐 Server Settings
# ==============================================================================
PORT=3000
NODE_ENV=development
```

### Step 4: Install CRW Web Scraper (Optional but Recommended)

CRW enables real web scraping instead of AI-simulated data:

```bash
# One-command install (macOS & Linux)
curl -fsSL https://fastcrw.com/install | sh

# Start CRW server on port 3002 (tránh trùng port 3000 với dashboard)
npm run crw
# Hoặc: crw serve --port 3002
```

> **Note:** Server web dashboard dùng port 3000, nên CRW được cấu hình chạy trên port 3002 (`CRW_BASE_URL=http://localhost:3002` trong `.env`).

For cloud API (no binary to install):
1. Register at [fastcrw.com/register](https://fastcrw.com/register) (1000 free credits)
2. Set `CRW_API_KEY=crw_live_your_key` and `CRW_BASE_URL=https://api.fastcrw.com` in `.env`

See the full [CRW Integration Guide](CRW_INTEGRATION.md) for detailed documentation.

---

## 4. Running the System

### Option A: Complete End-to-End Workflow via CLI

1. **Seed Verified Research Data (Offline Demo Mode):**
   ```bash
   npm run seed
   ```
   *Instantly loads the verified Beta 1 research findings into SQLite without API calls.*

2. **Run Audience Listening (Stage 1):**
   ```bash
   npm run listen
   ```
   *Scans Google PAA trees, Reddit (r/CPTSD, r/IFS), and therapist YouTube channels using your configured AI provider (ChatGPT / Gemini).*

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

## 5. Production Deployment & Scheduling

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

## 6. Troubleshooting & Common Issues

| Issue | Cause | Resolution |
|---|---|---|
| `No AI API Key found` | Missing or blank `.env` key | Ensure `.env` exists and contains either `OPENAI_API_KEY` or `GEMINI_API_KEY`. |
| `AI API request failed (401): Incorrect API key` | Invalid or revoked OpenAI key | Check that `OPENAI_API_KEY` in `.env` matches your key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys). |
| `AI API request failed (429): You exceeded your current quota` | OpenAI account has zero credit balance | Add credit ($5 minimum) at [platform.openai.com/settings/billing](https://platform.openai.com/settings/billing). |
| `Cannot find module '@google/genai'` | Dependencies not installed | Run `npm install` in the project root. |
| `better-sqlite3 compilation error` | Missing C++ build tools on host OS | Install standard build tools: `sudo apt-get install build-essential python3` (Linux) or Xcode CLI tools (macOS). |
| `Port 3000 already in use` | Another process is using port 3000 | Set `PORT=3001` in `.env` or terminate the conflicting process with `kill $(lsof -t -i:3000)`. |
| `CRW server is not reachable` | CRW binary not running | Chạy `npm run crw` hoặc `crw serve --port 3002`. |
| `CRW configured but not reachable` | CRW server offline or wrong URL | Verify with `curl http://localhost:3002/health`. Khởi động với `npm run crw`. |
| Listeners still use AI mode | CRW health check fails | Ensure CRW is running and `CRW_BASE_URL` points to the correct port (3002). |
