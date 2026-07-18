'use strict';

const { buildRequest, parseResponse, DEFAULT_MODEL } = require('../src/providers/gemini');

describe('gemini provider — buildRequest', () => {
  test('builds a generateContent request with system_instruction and contents', () => {
    const { url, headers, body } = buildRequest({
      system: 'You are a concierge.',
      userContent: 'Where is gate 4?',
      maxTokens: 200,
      apiKey: 'gm-test',
      model: null,
    });

    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`);
    expect(headers['x-goog-api-key']).toBe('gm-test');

    const parsed = JSON.parse(body);
    expect(parsed.system_instruction.parts[0].text).toBe('You are a concierge.');
    expect(parsed.contents).toEqual([{ role: 'user', parts: [{ text: 'Where is gate 4?' }] }]);
    expect(parsed.generationConfig.maxOutputTokens).toBe(200);
  });

  test('uses an explicit model override in the URL', () => {
    const { url } = buildRequest({
      system: 's', userContent: 'u', maxTokens: 10, apiKey: 'k', model: 'custom-test-model',
    });
    expect(url).toContain('custom-test-model:generateContent');
  });
});

describe('gemini provider — parseResponse', () => {
  test('joins text parts from a well-formed response', () => {
    const data = {
      candidates: [{ content: { parts: [{ text: 'Gate 4 is ' }, { text: 'nearest.' }] } }],
    };
    expect(parseResponse(data)).toBe('Gate 4 is \nnearest.');
  });

  test('throws a descriptive error when the response was blocked (no content parts)', () => {
    const data = { candidates: [{ finishReason: 'SAFETY', content: {} }] };
    expect(() => parseResponse(data)).toThrow(/SAFETY/);
  });

  test('throws on a response with no candidates at all', () => {
    expect(() => parseResponse({})).toThrow(/Unexpected Gemini response/);
  });
});
