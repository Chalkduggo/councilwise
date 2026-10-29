'use strict';
// Optional API connection. Every major provider (OpenAI, Anthropic, Google Gemini,
// Mistral, DeepSeek, xAI, Perplexity, Cohere, OpenRouter, and local Ollama) offers an
// OpenAI-compatible /chat/completions endpoint, so one small client covers them all.

async function chat({ baseUrl, model, apiKey, messages, timeoutMs = 10 * 60000, signal }) {
  if (!baseUrl || !model) throw new Error('API base URL and model are required.');
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => ctrl.abort());
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers.Authorization = 'Bearer ' + apiKey;
      if (/anthropic\.com/.test(baseUrl)) { headers['x-api-key'] = apiKey; headers['anthropic-version'] = '2023-06-01'; }
    }
    const res = await fetch(url, {
      method: 'POST', headers, signal: ctrl.signal,
      body: JSON.stringify({ model, messages })
    });
    const body = await res.text();
    if (!res.ok) {
      const err = new Error(`API ${res.status}: ${body.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    const data = JSON.parse(body);
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    const content = msg && (typeof msg.content === 'string' ? msg.content
      : Array.isArray(msg.content) ? msg.content.map(p => p.text || '').join('') : '');
    if (!content) throw new Error('API returned an empty answer.');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

async function test({ baseUrl, model, apiKey }) {
  const out = await chat({ baseUrl, model, apiKey, timeoutMs: 60000, messages: [{ role: 'user', content: 'Reply with the single word: ready' }] });
  return out.slice(0, 80);
}

module.exports = { chat, test };
