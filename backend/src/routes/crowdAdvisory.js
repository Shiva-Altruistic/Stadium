'use strict';

const express = require('express');
const genai = require('../genaiClient');
const { ValidationError } = require('../security');

const router = express.Router();

const SYSTEM_PROMPT = `You are the Operational Intelligence assistant on a FIFA World
Cup 2026 stadium ops desk. You receive structured crowd-density readings from
gate and concourse sensors and must produce a short operational advisory for
duty managers and volunteers.

Output plain text with exactly three lines, no markdown:
Line 1 starting "STATUS:" — one of NORMAL, ELEVATED, or CRITICAL.
Line 2 starting "ADVISORY:" — one sentence describing the situation.
Line 3 starting "ACTION:" — one concrete, immediately executable instruction
(e.g. which gate to open, which route to redirect fans to, whether to pause
entry).

Base your severity only on the numbers provided. Never invent sensor
readings, gate names, or incidents that are not in the input.`;

const MAX_ZONES = 12;

function validateReadings(readings) {
  if (!Array.isArray(readings) || readings.length === 0) {
    throw new ValidationError('readings must be a non-empty array.', 'readings');
  }
  if (readings.length > MAX_ZONES) {
    throw new ValidationError(`readings may contain at most ${MAX_ZONES} zones.`, 'readings');
  }
  return readings.map((r, idx) => {
    if (typeof r.zone !== 'string' || r.zone.trim().length === 0) {
      throw new ValidationError(`readings[${idx}].zone is required.`, 'readings');
    }
    const density = Number(r.densityPercent);
    if (!Number.isFinite(density) || density < 0 || density > 200) {
      throw new ValidationError(
        `readings[${idx}].densityPercent must be a number between 0 and 200.`,
        'readings',
      );
    }
    return {
      zone: r.zone.trim().slice(0, 60),
      densityPercent: Math.round(density),
      trend: ['rising', 'falling', 'stable'].includes(r.trend) ? r.trend : 'stable',
    };
  });
}

/**
 * POST /api/crowd-advisory
 * body: { readings: [{ zone, densityPercent, trend }] }
 */
router.post('/', async (req, res, next) => {
  try {
    const readings = validateReadings((req.body || {}).readings);

    const table = readings
      .map((r) => `- ${r.zone}: ${r.densityPercent}% of safe capacity, trend ${r.trend}`)
      .join('\n');

    const advisory = await genai.generate(SYSTEM_PROMPT, table, 400);

    res.json({ advisory, readingsEvaluated: readings.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
