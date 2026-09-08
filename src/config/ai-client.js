/**
 * Unified AI Client Adapter
 *
 * Supports:
 * 1. Google Gemini Native API (@google/genai) — When GEMINI_API_KEY (AIzaSy...) is provided.
 * 2. Any Custom / OpenAI-Compatible LLM API — When XFTOKEN_API_KEY / XFTOKEN_BASE_URL (or OPENAI_BASE_URL / NVIDIA NIM nvapi-...) is provided.
 *
 * Provides a uniform interface:
 *   generateContent({ contents, config: { systemInstruction, responseMimeType } })
 * Returning { text }
 */

import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from '@google/genai';

/**
 * Normalizes environment variables to determine the active AI provider.
 */
export function getAIConfig(explicitApiKey = null) {
  const geminiKey = process.env.GEMINI_API_KEY?.trim() || '';
  const openaiKey = process.env.OPENAI_API_KEY?.trim() || process.env.CHATGPT_API_KEY?.trim() || '';
  const customKey = process.env.XFTOKEN_API_KEY?.trim() || '';

  // Determine active key (explicit > OpenAI/ChatGPT > Gemini > Custom XFTOKEN)
  let apiKey = explicitApiKey || openaiKey || geminiKey || customKey || '';

  const isGeminiKey = apiKey.startsWith('AIzaSy');
  const isOpenAIKey = apiKey.startsWith('sk-') || (!!openaiKey && apiKey === openaiKey);

  let baseUrl = '';
  let model = '';

  if (isGeminiKey) {
    // Official Google Gemini Mode
    baseUrl = process.env.GEMINI_BASE_URL?.trim() || '';
    model = process.env.LLM_MODEL || 'gemini-2.5-flash';
  } else if (isOpenAIKey) {
    // Official OpenAI / ChatGPT Mode
    baseUrl = process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1';
    model = process.env.OPENAI_MODEL || process.env.LLM_MODEL || 'gpt-4o-mini';
  } else {
    // Custom OpenAI / NVIDIA NIM / Self-hosted Mode
    baseUrl = process.env.XFTOKEN_BASE_URL?.trim() || process.env.OPENAI_BASE_URL?.trim() || '';
    model = process.env.LLM_MODEL ||
      process.env.XFTOKEN_MODEL ||
      (baseUrl.includes('nvidia') ? 'meta/llama-3.2-11b-vision-instruct' : 'gpt-4o-mini');
  }

  const isCustomEndpoint = !isGeminiKey || !!baseUrl;

  return {
    apiKey,
    baseUrl: baseUrl ? baseUrl.replace(/\/+$/, '') : '',
    model,
    isCustomEndpoint,
    isOpenAI: isOpenAIKey,
  };
}

/**
 * Creates a unified AI client compatible with the gemini generateContent calling convention.
 */
export function createAIClient(explicitApiKey = null) {
  const config = getAIConfig(explicitApiKey);

  if (!config.apiKey) {
    throw new Error('No AI API Key found. Please set OPENAI_API_KEY (ChatGPT), GEMINI_API_KEY, or XFTOKEN_API_KEY in .env');
  }

  // ── Mode 1: Custom / OpenAI-Compatible Endpoint (OpenAI ChatGPT, NVIDIA NIM, XFTOKEN, Ollama, DeepSeek, etc.) ──
  if (config.isCustomEndpoint) {
    const defaultEndpoint = config.isOpenAI
      ? 'https://api.openai.com/v1/chat/completions'
      : 'https://integrate.api.nvidia.com/v1/chat/completions';

    const endpoint = config.baseUrl
      ? (config.baseUrl.endsWith('/chat/completions') ? config.baseUrl : `${config.baseUrl}/chat/completions`)
      : defaultEndpoint;

    return {
      provider: 'custom_openai',
      model: config.model,
      baseUrl: endpoint,
      models: {
        async generateContent({ contents, config: genConfig = {}, model }) {
          // If caller passed hardcoded 'gemini-...', ignore it in custom endpoint mode and use config.model
          const targetModel = (model && !model.startsWith('gemini')) ? model : config.model;
          const systemInstruction = genConfig.systemInstruction || '';
          const responseMimeType = genConfig.responseMimeType || '';

          const messages = [];

          if (systemInstruction) {
            messages.push({ role: 'system', content: String(systemInstruction) });
          }

          // Handle contents (either string or structured array)
          let userPrompt = '';
          if (typeof contents === 'string') {
            userPrompt = contents;
          } else if (Array.isArray(contents)) {
            userPrompt = contents.map(c => (typeof c === 'string' ? c : JSON.stringify(c))).join('\n\n');
          } else if (typeof contents === 'object' && contents.parts) {
            userPrompt = contents.parts.map(p => p.text || '').join('\n');
          } else {
            userPrompt = String(contents);
          }

          // If JSON is requested, ensure prompt encourages strict JSON output
          if (responseMimeType === 'application/json' && !userPrompt.toLowerCase().includes('json')) {
            userPrompt += '\n\nPlease return strictly valid JSON matching the requested structure. Do not wrap in markdown quotes if possible.';
          }

          messages.push({ role: 'user', content: userPrompt });

          const requestBody = {
            model: targetModel,
            messages,
            temperature: 0.2,
          };

          if (responseMimeType === 'application/json') {
            requestBody.response_format = { type: 'json_object' };
          }

          let lastError = null;
          let response = null;

          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${config.apiKey}`,
                },
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(120000),
              });

              if (response.ok) {
                break;
              }

              const errText = await response.text().catch(() => '');
              lastError = new Error(`AI API request to ${endpoint} failed (${response.status}): ${errText}`);

              // If rate limited or server error (500, 502, 503), retry after backoff
              if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 3) {
                const backoffMs = attempt * 2000;
                console.warn(`  ⚠️ AI API returned ${response.status}. Retrying in ${backoffMs / 1000}s (attempt ${attempt}/3)...`);
                await new Promise(r => setTimeout(r, backoffMs));
                continue;
              }

              throw lastError;
            } catch (err) {
              lastError = err;
              if (attempt < 3 && !err.message.includes('410')) {
                const backoffMs = attempt * 2000;
                console.warn(`  ⚠️ AI API network error: ${err.message}. Retrying in ${backoffMs / 1000}s (attempt ${attempt}/3)...`);
                await new Promise(r => setTimeout(r, backoffMs));
                continue;
              }
              throw lastError;
            }
          }

          if (!response || !response.ok) {
            throw lastError || new Error(`AI API request failed after retries`);
          }

          const data = await response.json();
          let rawText = data?.choices?.[0]?.message?.content || '';

          // Clean JSON response (handle markdown blocks or conversational preamble)
          const jsonBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (jsonBlockMatch) {
            rawText = jsonBlockMatch[1].trim();
          } else if (rawText.includes('{') || rawText.includes('[')) {
            const firstBracket = rawText.indexOf('[');
            const firstBrace = rawText.indexOf('{');
            let startIdx = -1;
            if (firstBracket !== -1 && firstBrace !== -1) {
              startIdx = Math.min(firstBracket, firstBrace);
            } else {
              startIdx = firstBracket !== -1 ? firstBracket : firstBrace;
            }

            if (startIdx !== -1) {
              const lastBracket = rawText.lastIndexOf(']');
              const lastBrace = rawText.lastIndexOf('}');
              const endIdx = Math.max(lastBracket, lastBrace);
              if (endIdx > startIdx) {
                rawText = rawText.substring(startIdx, endIdx + 1).trim();
              }
            }
          }

          return {
            text: rawText,
            raw: data,
          };
        },
      },
    };
  }

  // ── Mode 2: Standard Google Gemini API (@google/genai) ──
  const googleAI = new GoogleGenAI({ apiKey: config.apiKey });
  return {
    provider: 'gemini',
    model: config.model,
    models: {
      async generateContent(options) {
        return googleAI.models.generateContent({
          model: options.model || config.model,
          contents: options.contents,
          config: options.config,
        });
      },
    },
  };
}

/**
 * Resilient JSON parser that handles markdown fences, unescaped newlines, and preamble text.
 */
export function safeJsonParse(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  let text = rawText.trim();

  // Strip markdown code fences if present
  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    text = jsonBlockMatch[1].trim();
  }

  // Extract from outer brackets/braces if model included conversational wrapper
  const firstBracket = text.indexOf('[');
  const firstBrace = text.indexOf('{');
  let startIdx = -1;
  if (firstBracket !== -1 && firstBrace !== -1) {
    startIdx = Math.min(firstBracket, firstBrace);
  } else {
    startIdx = firstBracket !== -1 ? firstBracket : firstBrace;
  }

  if (startIdx !== -1) {
    const lastBracket = text.lastIndexOf(']');
    const lastBrace = text.lastIndexOf('}');
    const endIdx = Math.max(lastBracket, lastBrace);
    if (endIdx > startIdx) {
      text = text.substring(startIdx, endIdx + 1).trim();
    }
  }

  // Attempt 1: Direct JSON.parse
  try {
    return JSON.parse(text);
  } catch {
    // Attempt 2: Sanitize unescaped newlines/tabs inside quotes
    try {
      const sanitized = text.replace(/"((?:\\.|[^"\\])*)"/gs, (m, p) => {
        return '"' + p.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
      });
      return JSON.parse(sanitized);
    } catch {
      // Attempt 3: Strip control characters
      try {
        const cleanCtrl = text.replace(/[\x00-\x1F\x7F-\x9F]/g, ch => (ch === '\n' || ch === '\r' || ch === '\t') ? ' ' : '');
        return JSON.parse(cleanCtrl);
      } catch {
        return null;
      }
    }
  }
}

export default { createAIClient, getAIConfig, safeJsonParse };

