/* utils.js — small shared helpers. Classic script, no modules, so these
   attach to the global scope for api.js / app.js to use directly. */

function qs(sel, root) { return (root || document).querySelector(sel); }
function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

function escapeHtml(str) {
  if (str === null || typeof str === 'undefined') return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function announce(msg) {
  const region = qs('#live-region');
  if (region) region.textContent = msg;
}

function showError(msg) {
  const banner = qs('#error-banner');
  if (!banner) return;
  banner.textContent = msg;
  banner.hidden = false;
  clearTimeout(showError._t);
  showError._t = setTimeout(() => { banner.hidden = true; }, 6000);
}

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function crossfadeText(el, newText) {
  if (!el) return;
  if (prefersReducedMotion()) { el.textContent = newText; return; }
  el.style.opacity = '0';
  setTimeout(() => { el.textContent = newText; el.style.opacity = '1'; }, 220);
}

function nowClock() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function debounce(fn, wait) {
  let timeoutId;
  return function debounced(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), wait);
  };
}

function densityStatus(percentage) {
  if (percentage >= 100) return { level: 'critical', label: 'Critical' };
  if (percentage >= 85) return { level: 'elevated', label: 'Elevated' };
  return { level: 'normal', label: 'Normal' };
}

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
