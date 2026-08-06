'use strict';

const axios = require('axios');

const EMBED_MODELS = ['text-embedding-004', 'gemini-embedding-001'];
const EMBED_MODEL = EMBED_MODELS[0];
const GEN_MODEL = 'gemini-2.0-flash';

function getApiKey() {
  const functions = require('firebase-functions');
  return (
    process.env.GOOGLE_AI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    functions.config().gemini?.api_key ||
    functions.config().google?.ai_api_key ||
    ''
  );
}


function shouldRetryStatus(status) {
  return status === 429 || status === 503 || status === 500;
}

function retryDelayMs(attempt, retryAfterHeader) {
  const retryAfter = Number(retryAfterHeader || 0);
  if (retryAfter > 0 && Number.isFinite(retryAfter)) {
    return Math.min(retryAfter * 1000, 20000);
  }
  const base = 1200;
  return Math.min(base * Math.pow(2, attempt), 12000);
}

function formatApiError(prefix, err, status) {
  const detail = err?.response?.data?.error?.message || err?.message || String(err);
  if (status === 429) return prefix + ': RATE_LIMITED (429) ' + detail;
  return prefix + ': ' + detail;
}

async function postWithRetry(url, body, timeoutMs, label) {
  const maxAttempts = 3;
  let lastErr = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await axios.post(url, body, { timeout: timeoutMs });
    } catch (err) {
      lastErr = err;
      const status = err?.response?.status;
      if (!shouldRetryStatus(status) || attempt === maxAttempts - 1) {
        throw new Error(formatApiError(label, err, status));
      }
      const retryAfter = err?.response?.headers?.['retry-after'];
      await sleep(retryDelayMs(attempt, retryAfter));
    }
  }
  throw lastErr || new Error(label + ': request failed');
}


async function embedText(text, apiKey) {
  const key = apiKey || getApiKey();
  if (!key) throw new Error('Gemini API key not configured. Set: firebase functions:config:set gemini.api_key="YOUR_KEY"');

  const input = String(text || '').slice(0, 12000);
  let lastErr = null;

  for (let m = 0; m < EMBED_MODELS.length; m++) {
    const model = EMBED_MODELS[m];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${key}`;
    try {
      const res = await postWithRetry(url, {
        model: `models/${model}`,
        content: { parts: [{ text: input }] },
      }, 60000, 'Embedding failed (' + model + ')');

      const values = res.data?.embedding?.values;
      if (!Array.isArray(values) || !values.length) {
        throw new Error('Embedding API returned no vector');
      }
      return values;
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      if (status === 404 || status === 400) continue;
      throw err;
    }
  }

  const detail = lastErr?.response?.data?.error?.message || lastErr?.message || 'unknown error';
  throw new Error('Embedding failed: ' + detail);
}

async function embedBatch(texts, apiKey, onProgress) {
  const out = [];
  const concurrency = 3;
  let i = 0;

  async function worker() {
    while (i < texts.length) {
      const idx = i++;
      out[idx] = await embedText(texts[idx], apiKey);
      if (onProgress) onProgress(idx + 1, texts.length);
    }
  }

  const workers = [];
  for (let w = 0; w < Math.min(concurrency, texts.length); w++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return out;
}

async function generateMarkdown(systemPrompt, userPrompt, apiKey) {
  const key = apiKey || getApiKey();
  if (!key) throw new Error('Gemini API key not configured');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEN_MODEL}:generateContent?key=${key}`;
  const res = await postWithRetry(url, {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.55,
      maxOutputTokens: 8192,
    },
  }, 120000, 'Generation failed');

  const parts = res.data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map(function (p) { return p.text || ''; }).join('').trim();
  if (!text) throw new Error('Generation returned empty response');
  return text;
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return -1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : -1;
}

module.exports = {
  embedText,
  embedBatch,
  generateMarkdown,
  cosineSimilarity,
  getApiKey,
  EMBED_MODEL,
  GEN_MODEL,
};
