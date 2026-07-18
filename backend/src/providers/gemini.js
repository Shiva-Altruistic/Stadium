'use strict';

/**
 * Google Gemini — https://ai.google.dev (Google AI Studio)
 * Free tier: no credit card required, generous daily request volume on the
 * Flash / Flash-Lite models. Uses Google's own request shape (system
 * instruction + contents/parts), which is why this adapter looks different
 * from groq.js even though both are called through the same generate()
 * facade in genaiClient.js.
 *
 * DEFAULT_MODEL note: Google renames/retires dated Gemini model strings
 * frequently (multiple times in the months before this was written) — so
 * instead of pinning a dated name like "gemini-2.5-flash", this defaults to
 * the "gemini-flash-latest" alias, which Google hot-swaps to point at its
 * current flagship Flash model on every release (with 2 weeks' email notice
 * before the target changes). That trades a small, well-documented amount
 * of behavior drift for not silently 404ing mid-tournament.
 *
 * Get a key: aistudio.google.com/apikey -> set GEMINI_API_KEY in backend/.env
 */

const DEFAULT_MODEL = 'gemini-flash-latest';

function buildRequest({ system, userContent, maxTokens, apiKey, model }) {
  const resolvedModel = model || DEFAULT_MODEL;
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent`,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  };
}

function parseResponse(data) {
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    const reason = candidate?.finishReason;
    throw new Error(
      reason
        ? `Unexpected Gemini response shape (finishReason: ${reason}).`
        : 'Unexpected Gemini response shape (no content parts).',
    );
  }
  return parts
    .map((part) => part.text || '')
    .join('\n')
    .trim();
}

module.exports = { name: 'gemini', DEFAULT_MODEL, buildRequest, parseResponse };
