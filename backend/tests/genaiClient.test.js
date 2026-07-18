'use strict';

describe('genaiClient.generate (provider-agnostic orchestration)', () => {
  const ORIGINAL_ENV = process.env;
  const ORIGINAL_FETCH = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    global.fetch = ORIGINAL_FETCH;
    jest.restoreAllMocks();
  });

  test('defaults to the groq provider when GENAI_PROVIDER is unset', async () => {
    process.env.GENAI_PROVIDER = undefined;
    process.env.GROQ_API_KEY = 'test-groq-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Gate 4.' } }] }),
    });

    const { generate } = require('../src/genaiClient');
    const result = await generate('system', 'hello');

    expect(result).toBe('Gate 4.');
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer test-groq-key');
  });

  test('throws GenAIError when the selected provider has no API key configured', async () => {
    process.env.GENAI_PROVIDER = 'groq';
    delete process.env.GROQ_API_KEY;
    const { generate, GenAIError } = require('../src/genaiClient');
    await expect(generate('system', 'hello')).rejects.toBeInstanceOf(GenAIError);
  });

  test('throws GenAIError immediately for an unknown provider name, without calling fetch', async () => {
    process.env.GENAI_PROVIDER = 'not-a-real-provider';
    global.fetch = jest.fn();
    const { generate, GenAIError } = require('../src/genaiClient');
    await expect(generate('system', 'hello')).rejects.toBeInstanceOf(GenAIError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('switches to gemini and uses its request/response shape when GENAI_PROVIDER=gemini', async () => {
    process.env.GENAI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'La puerta 4.' }] } }],
      }),
    });

    const { generate } = require('../src/genaiClient');
    const result = await generate('system prompt', 'hello');

    expect(result).toBe('La puerta 4.');
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent');
    expect(options.headers['x-goog-api-key']).toBe('test-gemini-key');
    expect(JSON.parse(options.body).system_instruction.parts[0].text).toBe('system prompt');
  });

  test('honors a GENAI_MODEL override instead of the provider default', async () => {
    process.env.GENAI_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'test-key';
    process.env.GENAI_MODEL = 'custom-test-model';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });

    const { generate } = require('../src/genaiClient');
    await generate('system', 'hello');

    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body).model).toBe('custom-test-model');
  });

  test('does not retry on a 4xx response and reports it as a GenAIError', async () => {
    process.env.GENAI_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'bad request detail',
    });

    const { generate, GenAIError } = require('../src/genaiClient');
    await expect(generate('system', 'hello')).rejects.toBeInstanceOf(GenAIError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('retries once on a 5xx response, then succeeds', async () => {
    process.env.GENAI_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'test-key';
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'unavailable' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'recovered' } }] }),
      });

    const { generate } = require('../src/genaiClient');
    const result = await generate('system', 'hello');

    expect(result).toBe('recovered');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('throws GenAIError after exhausting retries on repeated 5xx failures', async () => {
    process.env.GENAI_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'test-key';
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500, text: async () => 'down' });

    const { generate, GenAIError } = require('../src/genaiClient');
    await expect(generate('system', 'hello')).rejects.toBeInstanceOf(GenAIError);
    expect(global.fetch).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
  });
});
