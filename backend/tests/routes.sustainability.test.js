'use strict';

/**
 * routes.sustainability.test.js
 * ---------------------------------------------------------------------------
 * Integration tests for POST /api/sustainability.
 * The GenAI client is mocked so tests are fast, deterministic, and offline.
 */

const request = require('supertest');

jest.mock('../src/genaiClient', () => ({
  generate: jest.fn(),
  GenAIError: class GenAIError extends Error {
    constructor(message) {
      super(message);
      this.statusCode = 502;
    }
  },
}));

const genai = require('../src/genaiClient');
const { createApp } = require('../server');

const app = createApp();

beforeEach(() => {
  genai.generate.mockReset();
});

/** Valid base payload used across multiple tests. */
const VALID_PAYLOAD = {
  venueName: 'Levi\'s Stadium',
  attendees: 70000,
  waterLitres: 3500000,
  energyKwh: 700000,
  recyclingPercent: 72,
  carbonOffsetTonnes: 120,
};

describe('POST /api/sustainability', () => {
  test('returns score, grade, and advisory for a valid request', async () => {
    genai.generate.mockResolvedValue(
      'HIGHLIGHTS: Recycling rate above 70%, carbon offset purchased.\n'
      + 'IMPROVEMENTS: Reduce water per person to 50 L, install solar panels.\n'
      + 'PRIORITY: Install greywater recycling system.',
    );

    const res = await request(app)
      .post('/api/sustainability')
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(200);
    expect(typeof res.body.score).toBe('number');
    expect(res.body.score).toBeGreaterThanOrEqual(0);
    expect(res.body.score).toBeLessThanOrEqual(100);
    expect(['A+', 'A', 'B', 'C', 'D', 'F']).toContain(res.body.grade);
    expect(res.body.advisory).toContain('HIGHLIGHTS');
    expect(res.body.venueName).toBe('Levi\'s Stadium');
    expect(genai.generate).toHaveBeenCalledTimes(1);
  });

  test('rejects a missing venueName with 400', async () => {
    const res = await request(app)
      .post('/api/sustainability')
      .send({ ...VALID_PAYLOAD, venueName: undefined });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('venueName');
    expect(genai.generate).not.toHaveBeenCalled();
  });

  test('rejects an attendees value of 0 with 400', async () => {
    const res = await request(app)
      .post('/api/sustainability')
      .send({ ...VALID_PAYLOAD, attendees: 0 });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('attendees');
    expect(genai.generate).not.toHaveBeenCalled();
  });

  test('rejects recyclingPercent above 100 with 400', async () => {
    const res = await request(app)
      .post('/api/sustainability')
      .send({ ...VALID_PAYLOAD, recyclingPercent: 101 });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('recyclingPercent');
    expect(genai.generate).not.toHaveBeenCalled();
  });

  test('rejects a negative energyKwh with 400', async () => {
    const res = await request(app)
      .post('/api/sustainability')
      .send({ ...VALID_PAYLOAD, energyKwh: -1 });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('energyKwh');
    expect(genai.generate).not.toHaveBeenCalled();
  });

  test('gives a perfect score for an exemplary venue', async () => {
    genai.generate.mockResolvedValue('HIGHLIGHTS: Excellent.\nIMPROVEMENTS: None needed.\nPRIORITY: Maintain current practices.');

    // Minimal water and energy, 100% recycling, full carbon offset.
    const res = await request(app)
      .post('/api/sustainability')
      .send({
        venueName: 'Green Arena',
        attendees: 50000,
        waterLitres: 2000000,  // 40 L/person (below 50 L target)
        energyKwh: 4000000,    // 80 kWh/person (below 100 target)
        recyclingPercent: 100,
        carbonOffsetTonnes: 50000, // exceeds any reasonable footprint
      });

    expect(res.status).toBe(200);
    // Score should be high (A or A+)
    expect(['A+', 'A']).toContain(res.body.grade);
  });

  test('surfaces a GenAI service failure as 502', async () => {
    const { GenAIError } = genai;
    genai.generate.mockRejectedValue(
      new GenAIError('GenAI service unavailable, please retry shortly.'),
    );

    const res = await request(app)
      .post('/api/sustainability')
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/unavailable/i);
  });
});
