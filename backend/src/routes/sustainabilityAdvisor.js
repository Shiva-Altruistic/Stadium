'use strict';

/**
 * sustainabilityAdvisor.js
 * ---------------------------------------------------------------------------
 * POST /api/sustainability — Venue sustainability scoring and advisory.
 *
 * Accepts per-event operational metrics (water usage, energy consumption,
 * waste recycling rate, and carbon offset tonnage) and returns a sustainability
 * score, letter grade, and GenAI-generated recommendations — directly
 * addressing the "sustainability" requirement for FIFA World Cup 2026 venues.
 *
 * This route enables:
 *   - Real-time sustainability dashboards for venue operations teams.
 *   - Post-match environmental impact briefings for organizers.
 *   - Fan-facing transparency on venue eco-performance.
 *
 * Input safety:
 *   - All numeric metrics are range-validated before reaching the model.
 *   - `venueName` is length-capped and sanitized to prevent prompt injection.
 */

const express = require('express');
const genai = require('../genaiClient');
const {
  assertWithinLength,
  assertNumericRange,
  sanitizeForPrompt,
} = require('../security');

const router = express.Router();

/** Maximum character length for a venue name. @type {number} */
const MAX_VENUE_NAME_LENGTH = 120;

/** Maximum litres of water usage accepted in one reading (prevents absurd inputs). @type {number} */
const MAX_WATER_LITRES = 10_000_000;

/** Maximum kWh energy usage accepted in one reading. @type {number} */
const MAX_ENERGY_KWH = 5_000_000;

/** Maximum carbon offset tonnage accepted in one reading. @type {number} */
const MAX_CARBON_TONNES = 50_000;

/**
 * Computes a 0–100 sustainability score from the four operational metrics.
 * Each metric contributes up to 25 points:
 *   - Water efficiency:  25 pts at ≤ 50 L/person, scaled linearly
 *   - Energy efficiency: 25 pts at ≤ 100 kWh/person, scaled linearly
 *   - Waste recycling:   25 pts at 100% recycling rate
 *   - Carbon offset:     25 pts at full offset of estimated footprint (est. from energy)
 *
 * @param {{ waterLitres: number, energyKwh: number, recyclingPercent: number, carbonOffsetTonnes: number, attendees: number }} metrics
 * @returns {number} Rounded integer score 0–100.
 */
function computeSustainabilityScore(metrics) {
  const { waterLitres, energyKwh, recyclingPercent, carbonOffsetTonnes, attendees } = metrics;
  const safeAttendees = Math.max(1, attendees);

  // Water: target is 50 L/person (average efficient stadium usage)
  const waterPerPerson = waterLitres / safeAttendees;
  const waterScore = Math.max(0, Math.min(25, 25 * (1 - (waterPerPerson - 50) / 200)));

  // Energy: target is 100 kWh/person (low for large venue matchday)
  const energyPerPerson = energyKwh / safeAttendees;
  const energyScore = Math.max(0, Math.min(25, 25 * (1 - (energyPerPerson - 100) / 400)));

  // Recycling: linear 0–100% maps to 0–25 pts
  const recyclingScore = Math.min(25, (recyclingPercent / 100) * 25);

  // Carbon: estimate footprint from energy (0.233 kg CO2/kWh), full offset = 25 pts
  const estimatedCarbonTonnes = (energyKwh * 0.233) / 1000;
  const carbonScore = estimatedCarbonTonnes > 0
    ? Math.min(25, (carbonOffsetTonnes / estimatedCarbonTonnes) * 25)
    : 25;

  return Math.round(waterScore + energyScore + recyclingScore + carbonScore);
}

/**
 * Maps a numeric score to a letter grade.
 *
 * @param {number} score - Sustainability score 0–100.
 * @returns {string} Grade letter (A+, A, B, C, D, or F).
 */
function scoreToGrade(score) {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/**
 * System prompt for the sustainability advisor.
 * Authored server-side; never influenced by client input.
 * @type {string}
 */
const SYSTEM_PROMPT = `You are the FIFA World Cup 2026 Venue Sustainability Advisor.
You receive per-event operational metrics for a stadium and must produce a
concise sustainability advisory for venue management.

Output plain text with exactly three lines, no markdown:
Line 1 starting "HIGHLIGHTS:" — two or three specific things the venue did well.
Line 2 starting "IMPROVEMENTS:" — two or three concrete, actionable steps to
reduce environmental impact at the next event.
Line 3 starting "PRIORITY:" — the single most impactful improvement to make first.

Base every observation strictly on the numbers provided. Never invent metrics,
benchmarks, or initiatives not derivable from the input data.`;

/**
 * POST /api/sustainability
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 *
 * Body parameters:
 * @param {string} req.body.venueName - Stadium name (required, max 120 chars).
 * @param {number} req.body.attendees - Number of attendees at the event (1–200,000).
 * @param {number} req.body.waterLitres - Total water used in litres (0–10,000,000).
 * @param {number} req.body.energyKwh - Total energy consumed in kWh (0–5,000,000).
 * @param {number} req.body.recyclingPercent - Percentage of waste recycled (0–100).
 * @param {number} req.body.carbonOffsetTonnes - Carbon offset purchased in tonnes CO₂e (0–50,000).
 *
 * Response:
 * @returns {{ score: number, grade: string, advisory: string, venueName: string }}
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      venueName,
      attendees,
      waterLitres,
      energyKwh,
      recyclingPercent,
      carbonOffsetTonnes,
    } = req.body || {};

    // Validate all inputs before touching the model.
    const cleanVenueName = assertWithinLength(venueName, 'venueName', MAX_VENUE_NAME_LENGTH);
    const cleanAttendees = assertNumericRange(attendees, 'attendees', 1, 200_000);
    const cleanWater = assertNumericRange(waterLitres, 'waterLitres', 0, MAX_WATER_LITRES);
    const cleanEnergy = assertNumericRange(energyKwh, 'energyKwh', 0, MAX_ENERGY_KWH);
    const cleanRecycling = assertNumericRange(recyclingPercent, 'recyclingPercent', 0, 100);
    const cleanCarbon = assertNumericRange(carbonOffsetTonnes, 'carbonOffsetTonnes', 0, MAX_CARBON_TONNES);

    const metrics = {
      waterLitres: cleanWater,
      energyKwh: cleanEnergy,
      recyclingPercent: cleanRecycling,
      carbonOffsetTonnes: cleanCarbon,
      attendees: cleanAttendees,
    };

    const score = computeSustainabilityScore(metrics);
    const grade = scoreToGrade(score);

    // Build a structured data block for the model — never raw user text.
    const metricsBlock = [
      `venue: ${sanitizeForPrompt(cleanVenueName)}`,
      `attendees: ${cleanAttendees.toLocaleString()}`,
      `water_used_litres: ${cleanWater.toLocaleString()} (${(cleanWater / cleanAttendees).toFixed(1)} L/person)`,
      `energy_used_kwh: ${cleanEnergy.toLocaleString()} (${(cleanEnergy / cleanAttendees).toFixed(1)} kWh/person)`,
      `waste_recycled_percent: ${cleanRecycling}%`,
      `carbon_offset_tonnes: ${cleanCarbon.toLocaleString()}`,
      `sustainability_score: ${score}/100 (grade ${grade})`,
    ].join('\n');

    const advisory = await genai.generate(SYSTEM_PROMPT, metricsBlock, 400);

    res.json({ score, grade, advisory, venueName: cleanVenueName });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
