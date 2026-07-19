/* utils.js
 * ---------------------------------------------------------------------------
 * Pure helper functions shared by api.js and app.js. Attaches to
 * window.StadiumPulseUtils so tests can import them without a bundler.
 *
 * All functions are stateless and free of DOM side-effects so they can be
 * tested in a jsdom environment without a full browser.
 */
'use strict';

/**
 * Alias for `document.querySelector` with an optional root element.
 *
 * @param {string} sel - CSS selector.
 * @param {ParentNode} [root=document] - Optional root node to query within.
 * @returns {Element|null}
 */
function qs(sel, root) { return (root || document).querySelector(sel); }

/**
 * Alias for `document.querySelectorAll`, returning a true Array.
 *
 * @param {string} sel - CSS selector.
 * @param {ParentNode} [root=document] - Optional root node to query within.
 * @returns {Element[]}
 */
function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

/**
 * Escapes the five HTML-significant characters before any string is
 * inserted via `innerHTML`. Prefer `textContent` where no HTML structure
 * is needed — this function exists for the cases where HTML is unavoidable.
 *
 * @param {*} str - Value to escape. Null/undefined coerce to empty string.
 * @returns {string} HTML-safe string.
 */
function escapeHtml(str) {
  if (str === null || typeof str === 'undefined') return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Announces a message to screen readers via the page's aria-live region
 * without moving keyboard focus. Used for async operation results.
 *
 * @param {string} msg - The message to announce.
 */
function announce(msg) {
  const region = qs('#live-region');
  if (region) region.textContent = msg;
}

/**
 * Shows a dismissible error banner and auto-hides it after 6 seconds.
 * Safe to call multiple times — each call resets the auto-hide timer.
 *
 * @param {string} msg - Error message to display to the user.
 */
function showError(msg) {
  const banner = qs('#error-banner');
  if (!banner) return;
  banner.textContent = msg;
  banner.hidden = false;
  clearTimeout(showError._t);
  showError._t = setTimeout(() => { banner.hidden = true; }, 6000);
}

/**
 * Returns true when the user has requested reduced motion via the OS or
 * browser accessibility settings.
 *
 * @returns {boolean}
 */
function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Cross-fades an element to a new text value.
 * Falls back to an instant text swap when reduced motion is preferred.
 *
 * @param {HTMLElement|null} el - The element whose text content to update.
 * @param {string} newText - The new text to display.
 */
function crossfadeText(el, newText) {
  if (!el) return;
  if (prefersReducedMotion()) { el.textContent = newText; return; }
  el.style.opacity = '0';
  setTimeout(() => { el.textContent = newText; el.style.opacity = '1'; }, 220);
}

/**
 * Returns the current time formatted as HH:MM in the user's locale.
 *
 * @returns {string} e.g. "14:35"
 */
function nowClock() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Returns a debounced version of a function that delays invoking `fn` until
 * after `wait` milliseconds have elapsed since the last call.
 *
 * @template {(...args: unknown[]) => unknown} T
 * @param {T} fn - The function to debounce.
 * @param {number} wait - Delay in milliseconds.
 * @returns {T} The debounced function.
 */
function debounce(fn, wait) {
  let timeoutId;
  return function debounced(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), wait);
  };
}

/**
 * Maps a crowd density percentage to a named level and label for display.
 *
 * @param {number} percentage - Crowd density as a percentage (0–200+).
 * @returns {{ level: 'critical'|'elevated'|'normal', label: string }}
 */
function densityStatus(percentage) {
  if (percentage >= 100) return { level: 'critical', label: 'Critical' };
  if (percentage >= 85) return { level: 'elevated', label: 'Elevated' };
  return { level: 'normal', label: 'Normal' };
}

/**
 * BCP-47 language options available in the fan-facing language selector.
 * @type {ReadonlyArray<{ code: string, label: string }>}
 */
const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'hi', label: 'हिंदी' },
];

if (typeof window !== 'undefined') {
  window.StadiumPulseUtils = {
    qs,
    qsa,
    escapeHtml,
    announce,
    showError,
    prefersReducedMotion,
    crossfadeText,
    nowClock,
    debounce,
    densityStatus,
    SUPPORTED_LANGUAGES,
  };
}
