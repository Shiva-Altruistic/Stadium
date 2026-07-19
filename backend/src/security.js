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

/** Maximum number of characters permitted in a single free-text message field. */
const MAX_MESSAGE_LENGTH = 2000;

/** Maximum number of reports/readings accepted in a single batch request. */
const MAX_BATCH_ITEMS = 25;

/**
 * BCP-47 language codes accepted across all multilingual endpoints.
 * Any code not in this allow-list is rejected before touching the model.
 * @type {Set<string>}
 */
const SUPPORTED_LANGUAGES = new Set([
  'en', 'es', 'fr', 'pt', 'de', 'it', 'ar', 'ja', 'ko', 'zh',
  'hi', 'nl', 'tr', 'ru', 'pl', 'sw', 'ha',
]);

/**
 * Typed error for invalid client input.
 * Carries the field name so the centralized error handler can return a
 * structured `{ error, field }` JSON body, making client-side form
 * highlighting straightforward.
 */
class ValidationError extends Error {
  /**
   * @param {string} message - Human-readable description of the validation failure.
   * @param {string} field - Name of the request field that failed validation.
   */
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    /** @type {string} The request field that failed validation. */
    this.field = field;
    /** @type {number} HTTP status code to return to the client. */
    this.statusCode = 400;
  }
}

/**
 * Escapes the five HTML-significant characters before any user-supplied or
 * model-generated string is inserted into the DOM.
 * Use this for every value that reaches `innerHTML`; prefer `textContent`
 * where no HTML structure is needed.
 *
 * @param {*} input - Value to escape. Non-strings are coerced to empty string.
 * @returns {string} HTML-safe string.
 */
function escapeHtml(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Asserts that a value is a non-empty string within the character limit.
 * Trims leading/trailing whitespace and returns the trimmed value on success.
 *
 * @param {*} value - The value to validate (expected to be a string).
 * @param {string} fieldName - Name of the field, used in the error message.
 * @param {number} [maxLength=MAX_MESSAGE_LENGTH] - Optional override for the length cap.
 * @returns {string} The trimmed, validated string.
 * @throws {ValidationError} When the value is absent, empty, or too long.
 */
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

/**
 * Asserts that a language code is in the supported allow-list.
 * Rejects any code not explicitly listed in SUPPORTED_LANGUAGES to prevent
 * prompt-injection via a crafted language parameter.
 *
 * @param {*} code - Language code to validate (expected to be a BCP-47 string).
 * @returns {string} The validated language code, unchanged.
 * @throws {ValidationError} When the code is unsupported or not a string.
 */
function assertLanguageSupported(code) {
  if (!SUPPORTED_LANGUAGES.has(code)) {
    throw new ValidationError(`Unsupported language code: ${code}`, 'language');
  }
  return code;
}

/**
 * Asserts that a value is a non-empty array within the batch size cap.
 *
 * @param {*} items - Value to validate (expected to be an array).
 * @param {string} fieldName - Name of the field, used in the error message.
 * @returns {Array} The validated array, unchanged.
 * @throws {ValidationError} When the value is not an array, is empty, or exceeds the cap.
 */
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
 * Asserts that a value is a finite number within an inclusive range.
 * Used to validate numeric sensor readings before they are formatted into
 * a prompt, preventing NaN or extreme values from distorting model output.
 *
 * @param {*} value - Value to validate (expected to be a number).
 * @param {string} fieldName - Name of the field, used in the error message.
 * @param {number} min - Minimum allowed value (inclusive).
 * @param {number} max - Maximum allowed value (inclusive).
 * @returns {number} The validated number.
 * @throws {ValidationError} When the value is not a finite number or out of range.
 */
function assertNumericRange(value, fieldName, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new ValidationError(
      `${fieldName} must be a number between ${min} and ${max}.`,
      fieldName,
    );
  }
  return n;
}

/**
 * Neutralises attempts to hijack the system prompt (e.g. "ignore previous
 * instructions...") by stripping role-marker tokens a user should never be
 * able to inject, and fencing the remaining text as inert data.
 *
 * This is defense-in-depth, not a substitute for keeping the system prompt
 * itself authoritative server-side (which genaiClient.js also enforces by
 * never letting client input alter the `system` field of a request).
 *
 * @param {string} rawText - Unsanitized text from the client.
 * @returns {string} The text wrapped in `<fan_message>` tags with role markers neutralized.
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
  assertNumericRange,
  sanitizeForPrompt,
  MAX_MESSAGE_LENGTH,
  MAX_BATCH_ITEMS,
  SUPPORTED_LANGUAGES,
};
