'use strict';

const { buildRequest, parseResponse, DEFAULT_MODEL } = require('../src/providers/groq');

describe('groq provider — buildRequest', () => {
  test('builds an OpenAI-compatible chat completions request', () => {
    const { url, headers, body } = buildRequest({
      system: 'You are a concierge.',
      userContent: 'Where is gate 4?',
      maxTokens: 200,
      apiKey: 'sk-test',
      model: null,
    });

    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(headers.Authorization).toBe('Bearer sk-test');
    expect(headers['Content-Type']).toBe('application/json');

    const parsed = JSON.parse(body);
    expect(parsed.model).toBe(DEFAULT_MODEL);
    expect(parsed.max_tokens).toBe(200);
    expect(parsed.messages).toEqual([
      { role: 'system', content: 'You are a concierge.' },
      { role: 'user', content: 'Where is gate 4?' },
    ]);
  });

  test('uses an explicit model override when provided', () => {
    const { body } = buildRequest({
      system: 's', userContent: 'u', maxTokens: 10, apiKey: 'k', model: 'custom-test-model',
    });
    expect(JSON.parse(body).model).toBe('custom-test-model');
  });

  test('sets reasoning_effort=low for the default GPT-OSS model, to leave room for the actual answer', () => {
    const { body } = buildRequest({
      system: 's', userContent: 'u', maxTokens: 400, apiKey: 'k', model: null,
    });
    expect(JSON.parse(body).reasoning_effort).toBe('low');
  });

  test('does not set reasoning_effort for a non-reasoning model override', () => {
    const { body } = buildRequest({
      system: 's', userContent: 'u', maxTokens: 400, apiKey: 'k', model: 'custom-test-model',
    });
    expect(JSON.parse(body).reasoning_effort).toBeUndefined();
  });
});

describe('groq provider — parseResponse', () => {
  test('extracts message content from a well-formed response', () => {
    const data = { choices: [{ message: { content: '  Gate 4 is nearest.  ' } }] };
    expect(parseResponse(data)).toBe('Gate 4 is nearest.');
  });

  test('throws on a response with no choices', () => {
    expect(() => parseResponse({ choices: [] })).toThrow(/Unexpected Groq response/);
  });

  test('throws on a response missing message content entirely', () => {
    expect(() => parseResponse({})).toThrow(/Unexpected Groq response/);
  });

  test('gives a specific, actionable error when a reasoning model burned its whole budget thinking', () => {
    // This is the exact failure mode reported in practice: max_tokens too
    // low for a GPT-OSS model, which spends it all on hidden reasoning and
    // returns empty content alongside a populated `reasoning` field.
    const data = {
      choices: [{
        message: { content: '', reasoning: 'The user wants a status classification...' },
        finish_reason: 'length',
      }],
    };
    expect(() => parseResponse(data)).toThrow(/spent its full max_tokens budget on internal reasoning/);
  });
});
