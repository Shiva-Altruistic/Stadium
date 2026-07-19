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

/** Map of provider name -> provider module. */
const PROVIDERS = { groq: groqProvider, gemini: geminiProvider };

/** Map of provider name -> the env-var name that holds its API key. */
const API_KEY_ENV_VAR = { groq: 'GROQ_API_KEY', gemini: 'GEMINI_API_KEY' };

/** Milliseconds before an in-flight fetch is aborted and treated as failed. */
const REQUEST_TIMEOUT_MS = 8000;

/** How many times to retry after a transient 5xx before giving up. */
const MAX_RETRIES = 1;

/** Maximum number of cached responses kept in memory at any time. */
const CACHE_MAX_SIZE = 100;

/** Time-to-live for a cached response in milliseconds (5 minutes). */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Typed error for any failure that originates inside the GenAI layer.
 * Carries an HTTP status code so the centralized error handler in server.js
 * can map it to the correct response status without a switch/instanceof chain.
 */
class GenAIError extends Error {
  /**
   * @param {string} message - Human-readable description of the failure.
   * @param {Error|undefined} [cause] - Underlying error that caused this one.
   */
  constructor(message, cause) {
    super(message);
    this.name = 'GenAIError';
    /** @type {number} HTTP status code to return to the client. */
    this.statusCode = 502;
    /** @type {Error|undefined} */
    this.cause = cause;
  }
}

/**
 * Reads env vars fresh on every call so tests can swap providers cleanly.
 *
 * @returns {{ provider: object, providerName: string, apiKey: string }}
 * @throws {GenAIError} When the provider name is unknown or its key is absent.
 */
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

/**
 * Wraps `fetch` with an AbortController timeout so no call can block
 * indefinitely when a provider's API becomes unresponsive.
 *
 * @param {string} url - The endpoint URL to fetch.
 * @param {RequestInit} options - Standard `fetch` options (method, headers, body).
 * @param {number} timeoutMs - Milliseconds after which the request is aborted.
 * @returns {Promise<Response>}
 */
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
 * In-memory LRU-style response cache keyed by the full request parameters.
 * Avoids redundant model calls for identical repeated prompts within the TTL.
 * @type {Map<string, { result: string, timestamp: number }>}
 */
const responseCache = new Map();

/**
 * Returns a cached response if one exists and has not expired.
 *
 * @param {string} system - Server-authored system prompt.
 * @param {string} userContent - Sanitized user content.
 * @param {number} maxTokens - Token budget for the response.
 * @param {string} providerName - Active provider identifier (e.g. 'groq').
 * @param {string} model - Active model identifier.
 * @returns {string|null} The cached text response, or null on a cache miss.
 */
function getCachedResponse(system, userContent, maxTokens, providerName, model) {
  const key = JSON.stringify({ system, userContent, maxTokens, providerName, model });
  const cached = responseCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }
  return null;
}

/**
 * Stores a successful response in the in-memory cache.
 * Evicts the oldest entry when the cache is at capacity.
 *
 * @param {string} system - Server-authored system prompt.
 * @param {string} userContent - Sanitized user content.
 * @param {number} maxTokens - Token budget for the response.
 * @param {string} providerName - Active provider identifier.
 * @param {string} model - Active model identifier.
 * @param {string} result - The text response to cache.
 */
function setCachedResponse(system, userContent, maxTokens, providerName, model, result) {
  const key = JSON.stringify({ system, userContent, maxTokens, providerName, model });
  if (responseCache.size >= CACHE_MAX_SIZE) {
    // Evict the oldest entry (Map preserves insertion order).
    const oldestKey = responseCache.keys().next().value;
    responseCache.delete(oldestKey);
  }
  responseCache.set(key, { result, timestamp: Date.now() });
}

/**
 * Sends one turn to whichever provider is configured and returns plain text.
 * Checks the in-memory cache first, then calls the provider with one bounded
 * retry on transient 5xx failures. Never retries on 4xx (client errors).
 *
 * @param {string} system - Server-authored system prompt for this feature.
 * @param {string} userContent - Sanitized, fenced user content (never raw).
 * @param {number} [maxTokens=400] - Maximum number of tokens in the response.
 * @returns {Promise<string>} Plain-text model response.
 * @throws {GenAIError} On provider misconfiguration, 4xx, or exhausted retries.
 */
async function generate(system, userContent, maxTokens = 400) {
  const { provider, providerName, apiKey } = resolveProvider();
  const model = process.env.GENAI_MODEL || provider.DEFAULT_MODEL;

  const cached = getCachedResponse(system, userContent, maxTokens, providerName, model);
  if (cached) {
    return cached;
  }

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
      const result = provider.parseResponse(data);
      setCachedResponse(system, userContent, maxTokens, providerName, model, result);
      return result;
    } catch (err) {
      if (err instanceof GenAIError) throw err; // non-retryable, propagate now
      lastError = err;
    }
  }

  throw new GenAIError(`${providerName} service unavailable, please retry shortly.`, lastError);
}

module.exports = { generate, GenAIError, PROVIDERS };
