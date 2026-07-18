'use strict';

/**
 * genaiClient.js
 * ---------------------------------------------------------------------------
 * Single choke point for every call this platform makes to an LLM — now
 * provider-agnostic. Routes never know or care whether a request goes to
 * Groq or Gemini; they just call generate(system, userContent, maxTokens).
 *
 * Why a choke point matters for this project:
 *   - The API key lives ONLY in process.env on this server. It is never
 *     sent to, or readable by, the browser. Routes never see the key, and
 *     neither does the frontend — see README for why this app deliberately
 *     does NOT call any model API directly from the browser.
 *   - The `system` prompt for each feature is authored in the route files,
 *     server-side, and is never built from raw client input — client text
 *     always arrives as a fenced, sanitized data block (see security.js).
 *   - One place enforces a request timeout, one bounded retry on transient
 *     failure, and one error shape, regardless of which provider answered.
 *
 * Supported providers (both genuinely free, no credit card required):
 *   - groq   (default) -> src/providers/groq.js   — OpenAI-compatible, fast
 *   - gemini            -> src/providers/gemini.js — Google's own format
 *
 * Select with GENAI_PROVIDER=groq|gemini in backend/.env (see .env.example).
 */

const groqProvider = require('./providers/groq');
const geminiProvider = require('./providers/gemini');

const PROVIDERS = { groq: groqProvider, gemini: geminiProvider };
const API_KEY_ENV_VAR = { groq: 'GROQ_API_KEY', gemini: 'GEMINI_API_KEY' };

const REQUEST_TIMEOUT_MS = 8000;
const MAX_RETRIES = 1;

class GenAIError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'GenAIError';
    this.statusCode = 502;
    this.cause = cause;
  }
}

/** Reads env vars fresh on every call so tests can swap providers cleanly. */
function resolveProvider() {
  const providerName = (process.env.GENAI_PROVIDER || 'groq').toLowerCase();
  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new GenAIError(
      `Unknown GENAI_PROVIDER "${providerName}". Supported: ${Object.keys(PROVIDERS).join(', ')}.`,
    );
  }

  const apiKeyEnvVar = API_KEY_ENV_VAR[providerName];
  const apiKey = process.env[apiKeyEnvVar];
  if (!apiKey) {
    throw new GenAIError(`Server misconfiguration: ${apiKeyEnvVar} is not set.`);
  }

  return { provider, providerName, apiKey };
}

async function callWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends one turn to whichever provider is configured and returns plain text.
 *
 * @param {string} system      - Server-authored system prompt for this feature.
 * @param {string} userContent - Sanitized, fenced user content (never raw).
 * @param {number} maxTokens
 */
async function generate(system, userContent, maxTokens = 400) {
  const { provider, providerName, apiKey } = resolveProvider();
  const model = process.env.GENAI_MODEL || provider.DEFAULT_MODEL;
  const { url, headers, body } = provider.buildRequest({
    system, userContent, maxTokens, apiKey, model,
  });

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await callWithTimeout(
        url,
        { method: 'POST', headers, body },
        REQUEST_TIMEOUT_MS,
      );

      if (!response.ok) {
        // 4xx from the provider won't be fixed by retrying — fail fast
        // instead of burning a second call against a rate-limited free tier.
        if (response.status < 500) {
          const detail = await response.text();
          throw new GenAIError(
            `${providerName} request rejected (${response.status}): ${detail}`,
          );
        }
        // 5xx is treated as transient and falls through to the retry loop.
        lastError = new Error(`Upstream ${response.status}`);
        continue;
      }

      const data = await response.json();
      return provider.parseResponse(data);
    } catch (err) {
      if (err instanceof GenAIError) throw err; // non-retryable, propagate now
      lastError = err;
    }
  }

  throw new GenAIError(`${providerName} service unavailable, please retry shortly.`, lastError);
}

module.exports = { generate, GenAIError, PROVIDERS };
