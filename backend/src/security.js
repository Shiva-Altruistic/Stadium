/**
 * security.js
 * ---------------------------------------------------------------------------
 * Central place for every input-safety rule used before user-supplied text
 * reaches the GenAI layer or is echoed back to a browser.
 *
 * Three distinct risks are handled here, deliberately kept separate so each
 * can be tested and reasoned about on its own:
 *
 *   1. XSS         -> escapeHtml()            (output going back to a browser)
 *   2. Overload/DoS -> assertWithinLength()    (oversized payloads)
 *   3. Prompt injection / role hijacking
 *                   -> sanitizeForPrompt()     (input going into an LLM prompt)
 *
 * No function here ever throws on "bad" input silently — callers get a
 * typed ValidationError they can turn into a clean 4xx response.
 */

'use strict';

const MAX_MESSAGE_LENGTH = 2000;
const MAX_BATCH_ITEMS = 25;
const SUPPORTED_LANGUAGES = new Set([
  'en', 'es', 'fr', 'pt', 'de', 'it', 'ar', 'ja', 'ko', 'zh',
  'hi', 'nl', 'tr', 'ru', 'pl', 'sw', 'ha',
]);

class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.statusCode = 400;
  }
}

/** Escape text before it is ever inserted into HTML on the client. */
function escapeHtml(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Reject empty / oversized strings before they cost a model call. */
function assertWithinLength(value, fieldName, maxLength = MAX_MESSAGE_LENGTH) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} is required.`, fieldName);
  }
  if (value.length > maxLength) {
    throw new ValidationError(
      `${fieldName} exceeds the ${maxLength} character limit.`,
      fieldName,
    );
  }
  return value.trim();
}

function assertLanguageSupported(code) {
  if (!SUPPORTED_LANGUAGES.has(code)) {
    throw new ValidationError(`Unsupported language code: ${code}`, 'language');
  }
  return code;
}

function assertBatchSize(items, fieldName) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidationError(`${fieldName} must be a non-empty array.`, fieldName);
  }
  if (items.length > MAX_BATCH_ITEMS) {
    throw new ValidationError(
      `${fieldName} may contain at most ${MAX_BATCH_ITEMS} items per request.`,
      fieldName,
    );
  }
  return items;
}

/**
 * Neutralise attempts to hijack the system prompt (e.g. "ignore previous
 * instructions...") by stripping role-marker tokens a user should never be
 * able to inject, and fencing the remaining text as inert data.
 *
 * This is defense-in-depth, not a substitute for keeping the system prompt
 * itself authoritative server-side (which genaiClient.js also enforces by
 * never letting client input alter the `system` field of a request).
 */
function sanitizeForPrompt(rawText) {
  const withoutRoleMarkers = rawText.replace(
    /(system|assistant|human)\s*:/gi,
    '[$1]:',
  );
  // Fence the text so the model treats it as data to respond to, not
  // instructions to follow.
  return `<fan_message>\n${withoutRoleMarkers}\n</fan_message>`;
}

module.exports = {
  ValidationError,
  escapeHtml,
  assertWithinLength,
  assertLanguageSupported,
  assertBatchSize,
  sanitizeForPrompt,
  MAX_MESSAGE_LENGTH,
  MAX_BATCH_ITEMS,
  SUPPORTED_LANGUAGES,
};
