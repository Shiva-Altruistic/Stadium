'use strict';

/**
 * Groq — https://console.groq.com
 * Free tier: no credit card required. Rate-limited (not token-metered), so it
 * comfortably covers a demo/pilot workload. Uses the OpenAI-compatible chat
 * completions shape, which is why buildRequest/parseResponse below look like
 * a standard OpenAI integration.
 *
 * DEFAULT_MODEL note: Groq deprecated llama-3.3-70b-versatile and
 * llama-3.1-8b-instant on 2026-06-17, recommending openai/gpt-oss-120b and
 * openai/gpt-oss-20b as replacements. This adapter defaults to the 20b
 * model (fast, free-tier-friendly); swap to openai/gpt-oss-120b via
 * GENAI_MODEL for higher-quality answers at lower throughput. Groq's model
 * lineup changes fairly often — console.groq.com/docs/models is the source
 * of truth if a model here ever starts returning 404s.
 *
 * Reasoning-model note: GPT-OSS models are reasoning models — by default
 * (reasoning_effort: "medium") they spend part of the max_tokens budget on
 * an internal "thinking" pass before writing the final answer into
 * message.content. On a short max_tokens allowance, that thinking pass can
 * consume the entire budget and leave message.content empty. Every feature
 * here wants a short, direct answer rather than deep reasoning, so this
 * adapter requests reasoning_effort: "low" for GPT-OSS models specifically,
 * freeing up more of the budget for the actual reply. See
 * console.groq.com/docs/reasoning for the parameter's full behavior.
 *
 * Get a key: console.groq.com/keys -> set GROQ_API_KEY in backend/.env
 */

const DEFAULT_MODEL = 'openai/gpt-oss-20b';
const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const REASONING_MODEL_PATTERN = /^openai\/gpt-oss/;

function buildRequest({ system, userContent, maxTokens, apiKey, model }) {
  const resolvedModel = model || DEFAULT_MODEL;

  const payload = {
    model: resolvedModel,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ],
  };

  if (REASONING_MODEL_PATTERN.test(resolvedModel)) {
    payload.reasoning_effort = 'low';
  }

  return {
    url: API_URL,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  };
}

function parseResponse(data) {
  const message = data?.choices?.[0]?.message;
  const content = message?.content;

  if (typeof content === 'string' && content.length > 0) {
    return content.trim();
  }

  // A reasoning model can legitimately return an empty message.content if
  // it spent its entire max_tokens budget on the hidden reasoning pass.
  // Surface that distinctly from a truly malformed response, since the fix
  // (raise max_tokens on this route, or lower reasoning_effort) is different
  // from a genuine API/shape problem.
  if (typeof message?.reasoning === 'string' && message.reasoning.length > 0) {
    throw new Error(
      'Groq returned no message content — the model likely spent its full '
      + 'max_tokens budget on internal reasoning. Increase maxTokens on this '
      + 'route or confirm reasoning_effort is set to "low".',
    );
  }

  throw new Error('Unexpected Groq response shape (no message content).');
}

module.exports = { name: 'groq', DEFAULT_MODEL, buildRequest, parseResponse };
