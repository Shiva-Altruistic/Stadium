/* api.js
 * ---------------------------------------------------------------------------
 * Thin fetch wrapper around the Express backend /api/* routes.
 * All AI calls go through the Express backend (Groq / Gemini via genaiClient),
 * so no model API key is ever exposed in the browser.
 *
 * Each function here maps to one backend route. The functions are designed to
 * throw on non-2xx responses so callers can catch and handle errors in one
 * place (usually app.js) rather than checking status codes everywhere.
 */
'use strict';

/**
 * Base fetch helper for all /api/* POST requests.
 * Parses the JSON body and throws with the server's error message on failure.
 *
 * @param {string} path - The /api/* path (e.g. '/api/concierge').
 * @param {object} body - JSON-serializable request body.
 * @returns {Promise<object>} Parsed JSON response body.
 * @throws {Error} When the server returns a non-2xx status.
 */
async function apiFetch(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'API ' + res.status);
  }
  return res.json();
}

/**
 * Sends a fan question to the AI concierge and returns the plain-text reply.
 *
 * POST /api/concierge
 * Body:  { message, language, venueContext? }
 * Reply: { reply, language }
 *
 * @param {string} question - The fan's question.
 * @param {string} langCode - BCP-47 language code for the reply.
 * @param {string} statusFacts - Current venue status facts to ground the reply.
 * @returns {Promise<string>} The concierge's plain-text reply.
 */
async function askConcierge(question, langCode, statusFacts) {
  const data = await apiFetch('/api/concierge', {
    message: question,
    language: langCode,
    venueContext: statusFacts,
  });
  return data.reply;
}

/**
 * Translates a short text string into the target language.
 *
 * POST /api/translate
 * Body:  { text, targetLanguage }
 * Reply: { translation, targetLanguage }
 *
 * @param {string} text - Text to translate (max 600 chars).
 * @param {string} targetLangCode - BCP-47 code of the target language.
 * @returns {Promise<string>} The translated text.
 */
async function translateText(text, targetLangCode) {
  const data = await apiFetch('/api/translate', {
    text,
    targetLanguage: targetLangCode,
  });
  return data.translation;
}

/**
 * Submits a fan/staff field report and returns a parsed incident object.
 *
 * POST /api/incident-summary
 * Body:  { reports: string[] }
 * Reply: { brief, reportsMerged }
 *
 * The backend returns a plain-text brief in the shape:
 *   SEVERITY: LOW|MEDIUM|HIGH
 *   SUMMARY: ...
 *   RECOMMENDED ACTION: ...
 *
 * This function parses that into the structured object the UI expects.
 *
 * @param {string} rawText - Free-text description of the incident.
 * @returns {Promise<{ severity: string, category: string, summary: string, actions: string[], escalate_to: string }>}
 */
async function analyzeIncident(rawText) {
  const data = await apiFetch('/api/incident-summary', { reports: [rawText] });
  const brief = data.brief || '';

  // Parse the structured plain-text response from the backend.
  const sev    = (brief.match(/SEVERITY:\s*(\w+)/i)          || [])[1] || 'medium';
  const sum    = (brief.match(/SUMMARY:\s*(.+?)(?:\n|$)/i)   || [])[1] || rawText.slice(0, 140);
  const action = (brief.match(/RECOMMENDED ACTION:\s*(.+)/i) || [])[1] || 'Route to duty manager';

  return {
    severity:    sev.toLowerCase(),
    category:    'other',
    summary:     sum.trim(),
    actions:     [action.trim()],
    escalate_to: 'Duty Manager',
  };
}

/**
 * Sends per-zone density readings to the crowd advisory endpoint and returns
 * the plain-text advisory for the ops duty manager.
 *
 * POST /api/crowd-advisory
 * Body:  { readings: [{ zone, densityPercent, trend }] }
 * Reply: { advisory, readingsEvaluated }
 *
 * `zoneSummary` is the string already built by app.js
 * (e.g. "A: cap 6000, gate-scan 4100, seated 4050 | ...").
 * This function converts it to the readings array the backend expects.
 *
 * @param {string} zoneSummary - Pipe-delimited zone summary string from app.js.
 * @returns {Promise<string>} Plain-text advisory from the AI.
 */
async function generateAdvisory(zoneSummary) {
  // Parse "Label: cap N, gate-scan N, seated N" segments produced by app.js.
  const readings = zoneSummary.split('|').map((seg) => {
    const label   = (seg.match(/^([A-Z]+):/i) || [])[1] || 'Zone';
    const cap     = Number((seg.match(/cap\s+(\d+)/i)    || [])[1] || 1);
    const seated  = Number((seg.match(/seated\s+(\d+)/i) || [])[1] || 0);
    const density = Math.round((seated / cap) * 100);
    return { zone: label, densityPercent: density, trend: 'stable' };
  }).filter((r) => r.zone);

  const data = await apiFetch('/api/crowd-advisory', { readings });
  return data.advisory;
}

/**
 * Checks per-event sustainability metrics and returns a score, grade, and
 * GenAI-generated advisory with improvement recommendations.
 *
 * POST /api/sustainability
 * Body:  { venueName, attendees, waterLitres, energyKwh, recyclingPercent, carbonOffsetTonnes }
 * Reply: { score, grade, advisory, venueName }
 *
 * @param {{ venueName: string, attendees: number, waterLitres: number, energyKwh: number, recyclingPercent: number, carbonOffsetTonnes: number }} metrics
 * @returns {Promise<{ score: number, grade: string, advisory: string, venueName: string }>}
 */
async function checkSustainability(metrics) {
  return apiFetch('/api/sustainability', metrics);
}

/**
 * Requests AI-generated volunteer task assignments for a given zone.
 *
 * POST /api/volunteer-tasks
 * Body:  { zoneName, staffCount, crowdLevel, incidents? }
 * Reply: { priority, tasks, escalate, escalateReason, zoneName }
 *
 * @param {{ zoneName: string, staffCount: number, crowdLevel: string, incidents?: string[] }} params
 * @returns {Promise<{ priority: string, tasks: string[], escalate: boolean, escalateReason: string, zoneName: string }>}
 */
async function getVolunteerTasks(params) {
  return apiFetch('/api/volunteer-tasks', params);
}
