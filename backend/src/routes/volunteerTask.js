'use strict';

/**
 * volunteerTask.js
 * ---------------------------------------------------------------------------
 * POST /api/volunteer-tasks — AI-powered volunteer task assignment intelligence.
 *
 * Accepts the current operational state of a venue zone (staff count, active
 * incidents, crowd level, and zone name) and returns a prioritized list of
 * tasks for the duty manager to assign to volunteers — directly addressing
 * the "real-time decision support" and "operational intelligence" requirements
 * for FIFA World Cup 2026 tournament operations.
 *
 * This route enables:
 *   - Dynamic reallocation of volunteer resources as crowd conditions evolve.
 *   - AI-generated task briefs so duty managers spend seconds, not minutes,
 *     formulating volunteer assignments.
 *   - Escalation flags when the situation requires more than volunteer response.
 *
 * Input safety:
 *   - `zoneName`    — length-capped and prompt-fenced.
 *   - `staffCount`  — range-validated integer.
 *   - `crowdLevel`  — allow-listed to prevent prompt injection via this field.
 *   - `incidents`   — optional array, each item length-capped and fenced.
 */

const express = require('express');
const genai = require('../genaiClient');
const {
  assertWithinLength,
  assertNumericRange,
  sanitizeForPrompt,
  ValidationError,
} = require('../security');

const router = express.Router();

/** Maximum character length for a zone name. @type {number} */
const MAX_ZONE_NAME_LENGTH = 80;

/** Maximum number of active incidents accepted per request. @type {number} */
const MAX_INCIDENTS = 10;

/** Maximum character length for a single incident description. @type {number} */
const MAX_INCIDENT_LENGTH = 300;

/**
 * Valid crowd level values accepted from the client.
 * Allow-listed to prevent injection via this enum-like field.
 * @type {ReadonlyArray<string>}
 */
const VALID_CROWD_LEVELS = ['low', 'moderate', 'high', 'critical'];

/**
 * System prompt for the volunteer task assignment assistant.
 * Authored server-side; never built from or influenced by client input.
 * @type {string}
 */
const SYSTEM_PROMPT = `You are the FIFA World Cup 2026 Volunteer Operations AI.
You receive the current state of a stadium zone — staff available, crowd level,
and any active incidents — and must produce a prioritized task list for the
duty manager to assign to volunteers.

Output plain text with exactly three lines, no markdown:
Line 1 starting "PRIORITY:" — HIGH, MEDIUM, or LOW (overall urgency).
Line 2 starting "TASKS:" — a comma-separated list of 2–5 concrete, specific
volunteer tasks (e.g. "Direct crowd to Gate 4B, Position 2 stewards at north
concourse entrance, Check on fan with mobility equipment at Row 12").
Line 3 starting "ESCALATE:" — YES or NO, followed by one sentence. If YES,
name the specific role to escalate to (e.g. Safety Officer, Medical Team).

Base all tasks strictly on the zone data provided. Never invent incidents,
locations, or staff roles not in the input.`;

/**
 * POST /api/volunteer-tasks
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 *
 * Body parameters:
 * @param {string} req.body.zoneName - Name of the venue zone (required, max 80 chars).
 * @param {number} req.body.staffCount - Number of volunteers currently available (0–500).
 * @param {string} req.body.crowdLevel - Crowd density level: 'low' | 'moderate' | 'high' | 'critical'.
 * @param {string[]} [req.body.incidents] - Optional list of active incident descriptions.
 *
 * Response:
 * @returns {{ priority: string, tasks: string[], escalate: boolean, escalateReason: string, zoneName: string }}
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      zoneName,
      staffCount,
      crowdLevel,
      incidents = [],
    } = req.body || {};

    // Validate all inputs before reaching the model.
    const cleanZoneName = assertWithinLength(zoneName, 'zoneName', MAX_ZONE_NAME_LENGTH);
    const cleanStaffCount = assertNumericRange(staffCount, 'staffCount', 0, 500);

    if (!VALID_CROWD_LEVELS.includes(crowdLevel)) {
      const { ValidationError } = require('../security');
      throw new ValidationError(
        `crowdLevel must be one of: ${VALID_CROWD_LEVELS.join(', ')}.`,
        'crowdLevel',
      );
    }

    // Validate and sanitize optional incidents array.
    const cleanIncidents = Array.isArray(incidents)
      ? incidents
        .slice(0, MAX_INCIDENTS)
        .map((inc, idx) => sanitizeForPrompt(
          assertWithinLength(String(inc), `incidents[${idx}]`, MAX_INCIDENT_LENGTH),
        ))
      : [];

    // Build structured data block for the model.
    const incidentBlock = cleanIncidents.length > 0
      ? `\nActive incidents:\n${cleanIncidents.map((inc, i) => `${i + 1}. ${inc}`).join('\n')}`
      : '\nNo active incidents reported.';

    const userContent = [
      `zone: ${sanitizeForPrompt(cleanZoneName)}`,
      `volunteers_available: ${cleanStaffCount}`,
      `crowd_level: ${crowdLevel}`,
      incidentBlock,
    ].join('\n');

    const brief = await genai.generate(SYSTEM_PROMPT, userContent, 400);

    // Parse the structured plain-text response.
    const priorityMatch = brief.match(/PRIORITY:\s*(HIGH|MEDIUM|LOW)/i);
    const tasksMatch = brief.match(/TASKS:\s*(.+?)(?:\n|$)/i);
    const escalateMatch = brief.match(/ESCALATE:\s*(YES|NO)(?:[\s—-]+(.+))?/i);

    const priority = priorityMatch ? priorityMatch[1].toUpperCase() : 'MEDIUM';
    const tasks = tasksMatch
      ? tasksMatch[1].split(',').map((t) => t.trim()).filter(Boolean)
      : ['Manual assessment required'];
    const escalate = escalateMatch ? escalateMatch[1].toUpperCase() === 'YES' : false;
    const escalateReason = escalateMatch && escalateMatch[2]
      ? escalateMatch[2].trim()
      : '';

    res.json({
      priority,
      tasks,
      escalate,
      escalateReason,
      zoneName: cleanZoneName,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
