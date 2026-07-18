/* api.js — thin fetch wrapper around the backend /api/* routes.
   All AI calls go through the Express backend (Groq / Gemini via genaiClient),
   so no model key is ever exposed in the browser. */

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
 * POST /api/concierge
 * body : { message, language, venueContext? }
 * reply: { reply, language }
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
 * POST /api/translate
 * body : { text, targetLanguage }
 * reply: { translation, targetLanguage }
 */
async function translateText(text, targetLangCode) {
  const data = await apiFetch('/api/translate', {
    text,
    targetLanguage: targetLangCode,
  });
  return data.translation;
}

/**
 * POST /api/incident-summary
 * body : { reports: string[] }
 * reply: { brief, reportsMerged }
 *
 * The backend returns a plain-text brief in the shape:
 *   SEVERITY: LOW|MEDIUM|HIGH
 *   SUMMARY: ...
 *   RECOMMENDED ACTION: ...
 *
 * We parse that into the object shape the UI expects.
 */
async function analyzeIncident(rawText) {
  const data = await apiFetch('/api/incident-summary', { reports: [rawText] });
  const brief = data.brief || '';

  // Parse the structured plain-text response from the backend
  const sev   = (brief.match(/SEVERITY:\s*(\w+)/i)         || [])[1] || 'medium';
  const sum   = (brief.match(/SUMMARY:\s*(.+?)(?:\n|$)/i)  || [])[1] || rawText.slice(0, 140);
  const action= (brief.match(/RECOMMENDED ACTION:\s*(.+)/i)|| [])[1] || 'Route to duty manager';

  return {
    severity:    sev.toLowerCase(),
    category:    'other',
    summary:     sum.trim(),
    actions:     [action.trim()],
    escalate_to: 'Duty Manager',
  };
}

/**
 * POST /api/crowd-advisory
 * body : { readings: [{ zone, densityPercent, trend }] }
 * reply: { advisory, readingsEvaluated }
 *
 * zoneSummary is the string already built by app.js (e.g. "A: cap 6000, gate-scan 4100, seated 4050 | ...")
 * We convert it back into the readings array the backend expects.
 */
async function generateAdvisory(zoneSummary) {
  // Parse "Label: cap N, gate-scan N, seated N" segments produced by app.js
  const readings = zoneSummary.split('|').map((seg) => {
    const label   = (seg.match(/^([A-Z]+):/i) || [])[1] || 'Zone';
    const cap     = Number((seg.match(/cap\s+(\d+)/i)       || [])[1] || 1);
    const seated  = Number((seg.match(/seated\s+(\d+)/i)    || [])[1] || 0);
    const density = Math.round((seated / cap) * 100);
    return { zone: label, densityPercent: density, trend: 'stable' };
  }).filter((r) => r.zone);

  const data = await apiFetch('/api/crowd-advisory', { readings });
  return data.advisory;
}
