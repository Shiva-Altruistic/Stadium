'use strict';

/**
 * crowdAdvisory.js
 * ---------------------------------------------------------------------------
 * POST /api/crowd-advisory — Real-time crowd density advisory for ops staff.
 *
 * Receives structured zone readings (gate scan count vs. capacity percentage)
 * from the ops dashboard and generates a concise, actionable advisory for
 * duty managers at a FIFA World Cup 2026 venue. Each advisory ends with one
 * concrete, immediately executable instruction (e.g. open overflow gate,
 * redirect crowd flow, pause entry).
 *
 * Input safety:
 *   - `readings` — validated as a non-empty array, max MAX_ZONES items.
 *   - Per-reading: zone is a trimmed string; densityPercent is 0–200;
 *     trend is allow-listed to 'rising' | 'falling' | 'stable'.
 */

const express = require('express');
const genai = require('../genaiClient');
const { ValidationError } = require('../security');

const router = express.Router();

/**
 * Maximum number of zones accepted in a single advisory request.
 * Matches the maximum number of named zones in the frontend ZONES array.
 * @type {number}
 */
const MAX_ZONES = 12;

/**
 * Maximum allowed density percentage (200 = twice safe capacity).
 * Values above this indicate a data error rather than a real reading.
 * @type {number}
 */
const MAX_DENSITY_PERCENT = 200;

/**
 * Valid trend values for a zone reading.
 * @type {ReadonlyArray<string>}
 */
const VALID_TRENDS = ['rising', 'falling', 'stable'];

/**
 * System prompt for the crowd density advisor.
 * Authored server-side; never influenced by client input.
 * @type {string}
 */
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

/**
 * Validates and normalizes a readings array from the request body.
 * Rejects missing fields, out-of-range densities, and oversized batches
 * before they reach the model.
 *
 * @param {unknown} readings - Raw value from `req.body.readings`.
 * @returns {Array<{ zone: string, densityPercent: number, trend: string }>} Normalized readings.
 * @throws {ValidationError} On any structural or range violation.
 */
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
    if (!Number.isFinite(density) || density < 0 || density > MAX_DENSITY_PERCENT) {
      throw new ValidationError(
        `readings[${idx}].densityPercent must be a number between 0 and ${MAX_DENSITY_PERCENT}.`,
        'readings',
      );
    }
    return {
      zone: r.zone.trim().slice(0, 60),
      densityPercent: Math.round(density),
      trend: VALID_TRENDS.includes(r.trend) ? r.trend : 'stable',
    };
  });
}

/**
 * POST /api/crowd-advisory
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 *
 * Body parameters:
 * @param {Array<{ zone: string, densityPercent: number, trend?: string }>} req.body.readings
 *   Per-zone density readings. `trend` defaults to 'stable' if omitted.
 *
 * Response:
 * @returns {{ advisory: string, readingsEvaluated: number }}
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
