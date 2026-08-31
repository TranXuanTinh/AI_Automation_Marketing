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
  const apiKey = explicitApiKey ||
    process.env.XFTOKEN_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    '';

  const baseUrl = process.env.XFTOKEN_BASE_URL ||
    process.env.GEMINI_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    '';

  const model = process.env.XFTOKEN_MODEL ||
    process.env.LLM_MODEL ||
    (baseUrl.includes('nvidia') ? 'meta/llama-3.1-70b-instruct' : 'gemini-2.5-flash');

  // If a custom Base URL is set or the key is not a standard Google key (AIzaSy...), use Custom/OpenAI mode
  const isCustomEndpoint = !!baseUrl || (apiKey && !apiKey.startsWith('AIzaSy'));

  return {
    apiKey,
    baseUrl: baseUrl ? baseUrl.replace(/\/+$/, '') : '',
    model,
    isCustomEndpoint,
  };
}

/**
 * Creates a unified AI client compatible with the gemini generateContent calling convention.
 */
export function createAIClient(explicitApiKey = null) {
  const config = getAIConfig(explicitApiKey);

  if (!config.apiKey) {
    throw new Error('No AI API Key found. Please set XFTOKEN_API_KEY or GEMINI_API_KEY in .env');
  }

  // ── Mode 1: Custom / OpenAI-Compatible Endpoint (NVIDIA NIM, XFTOKEN, Ollama, DeepSeek, etc.) ──
  if (config.isCustomEndpoint) {
    const endpoint = config.baseUrl
      ? (config.baseUrl.endsWith('/chat/completions') ? config.baseUrl : `${config.baseUrl}/chat/completions`)
      : 'https://integrate.api.nvidia.com/v1/chat/completions';

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

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`AI API request to ${endpoint} failed (${response.status}): ${errText}`);
          }

          const data = await response.json();
          let rawText = data?.choices?.[0]?.message?.content || '';

          // Clean markdown code blocks if present (```json ... ```)
          const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (jsonMatch) {
            rawText = jsonMatch[1].trim();
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

export default { createAIClient, getAIConfig };
