/* app.js — wires the DOM to api.js. One zone dataset drives the fan status
   box, the pulse-screen messages, and the ops crowd-intelligence panel, so
   every view stays consistent with the same underlying "ground truth". */

const ZONES = [
  { id: 0, label: 'A', name: 'North Upper', cap: 6000, gate: 4100, seat: 4050, tag: 'Gate 3' },
  { id: 1, label: 'B', name: 'North Lower', cap: 7000, gate: 5200, seat: 5100, tag: 'Main concourse' },
  { id: 2, label: 'C', name: 'East Upper', cap: 5000, gate: 4850, seat: 3980, tag: 'Restroom' },
  { id: 3, label: 'D', name: 'East Lower', cap: 7200, gate: 3200, seat: 3150, tag: '' },
  { id: 4, label: 'E', name: 'South Upper', cap: 5000, gate: 4550, seat: 4500, tag: 'Food court' },
  { id: 5, label: 'F', name: 'South Lower', cap: 7200, gate: 3000, seat: 2950, tag: '' },
  { id: 6, label: 'G', name: 'West Upper', cap: 4800, gate: 2400, seat: 2350, tag: 'Accessible entry' },
  { id: 7, label: 'H', name: 'West Lower', cap: 7200, gate: 6950, seat: 6900, tag: 'Transport hub' },
];
const density = (z) => z.seat / z.cap;
const mismatch = (z) => (z.gate === 0 ? 0 : (z.gate - z.seat) / z.gate);
const densityLabel = (d) => (d >= 0.85 ? 'High' : d >= 0.62 ? 'Moderate' : 'Low');
const densityClass = (d) => (d >= 0.85 ? 'lvl-high' : d >= 0.62 ? 'lvl-mod' : 'lvl-low');
const avgDensity = () => ZONES.reduce((s, z) => s + density(z), 0) / ZONES.length;

/* ---------------- i18n ---------------- */
const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'hi', label: 'हिंदी' },
];
const TRANSLATE_TARGETS = [
  { code: 'en', label: 'English' }, { code: 'es', label: 'Spanish' }, { code: 'fr', label: 'French' },
  { code: 'hi', label: 'Hindi' }, { code: 'ar', label: 'Arabic' }, { code: 'pt', label: 'Portuguese' },
  { code: 'de', label: 'German' }, { code: 'ja', label: 'Japanese' },
];

const STRINGS = {
  en: { statusTitle: 'Live Stadium Status', gateStatus: 'Gate Status', crowdStatus: 'Crowd Density',
    fanUpdateLabel: 'Ops Team update', fanNoUpdate: 'No active fan update.', chatTitle: 'AI Support', chatSub: 'multilingual · answers in your selected language',
    chatPlaceholder: 'Ask about gates, accessibility, transit, sustainability…', chatSubmit: 'Ask', thinking: 'thinking…',
    greeting: "Hi! I'm your concierge — ask me about gates, accessibility, transit, or sustainability.",
    chatError: "Connection hiccup — here's what I have directly:",
    cards: [
      { t: 'Navigation', d: 'Step-free routes, nearest gates, and concourse wayfinding.', q: 'Fastest step-free route to my section?' },
      { t: 'Accessibility', d: 'Sensory rooms, assistive listening, accessible seating.', q: 'Nearest cooling zone for someone heat-sensitive?' },
      { t: 'Transportation', d: 'Shuttles, transit lines, and rideshare pickup zones.', q: 'Best way back downtown after the match?' },
      { t: 'Sustainability', d: 'Refill stations, recycling points, low-carbon travel tips.', q: 'Nearest water refill and recycling point?' },
    ], askBtn: 'Ask about this',
    reportIssueTitle: 'Report your issue', reportIssueSub: 'Tell us what\'s wrong — your report goes straight to the ops team.',
    reportPlaceholder: 'e.g. Can\'t find step-free route to Section 208', reportSubmit: 'Submit report', reportExample: 'Try example',
    reportConfirm: 'Report received — the ops team has been notified.',
    logsEmpty: 'No reports yet — fan and staff submissions will appear here.',
    sosTitle: 'Emergency SOS', sosCancel: 'Cancel', sosSent: 'Alert sent — nearest steward is on the way.',
    sosOptions: ['Medical emergency', 'Security concern', 'Lost child', 'Share my location with staff'] },
  es: { statusTitle: 'Estado del estadio en vivo', gateStatus: 'Estado de puertas', crowdStatus: 'Densidad de gente',
    chatTitle: 'Conserje IA', chatSub: 'multilingüe · responde en tu idioma',
    chatPlaceholder: 'Pregunta sobre puertas, accesibilidad, transporte, sostenibilidad…', chatSubmit: 'Preguntar', thinking: 'pensando…',
    greeting: '¡Hola! Soy tu conserje — pregúntame sobre puertas, accesibilidad, transporte o sostenibilidad.',
    chatError: 'Problema de conexión — esto es lo que tengo directamente:',
    cards: [
      { t: 'Navegación', d: 'Rutas sin escalones, puertas cercanas y orientación en el estadio.', q: '¿Ruta accesible más rápida a mi sección?' },
      { t: 'Accesibilidad', d: 'Salas sensoriales, ayuda auditiva, asientos accesibles.', q: '¿Zona fresca más cercana para sensibilidad al calor?' },
      { t: 'Transporte', d: 'Traslados, líneas de transporte y zonas de recogida.', q: '¿Mejor forma de volver al centro tras el partido?' },
      { t: 'Sostenibilidad', d: 'Puntos de agua, reciclaje y consejos de viaje sostenible.', q: '¿Punto de agua y reciclaje más cercano?' },
    ], askBtn: 'Preguntar',
    reportIssueTitle: 'Reporta tu problema', reportIssueSub: 'Cuéntanos qué ocurre — tu reporte va directo al equipo de operaciones.',
    reportPlaceholder: 'p. ej. No encuentro ruta accesible a la Sección 208', reportSubmit: 'Enviar reporte', reportExample: 'Probar ejemplo',
    reportConfirm: 'Reporte recibido — el equipo de operaciones ha sido notificado.',
    logsEmpty: 'Sin reportes aún — las solicitudes de fans y personal aparecerán aquí.',
    sosTitle: 'Emergencia SOS', sosCancel: 'Cancelar', sosSent: 'Alerta enviada — un asistente va en camino.',
    sosOptions: ['Emergencia médica', 'Problema de seguridad', 'Niño perdido', 'Compartir mi ubicación con el personal'] },
  fr: { statusTitle: 'État du stade en direct', gateStatus: 'État des portes', crowdStatus: 'Densité de foule',
    chatTitle: 'Concierge IA', chatSub: 'multilingue · répond dans votre langue',
    chatPlaceholder: 'Portes, accessibilité, transport, durabilité…', chatSubmit: 'Demander', thinking: 'réflexion…',
    greeting: 'Bonjour ! Je suis votre concierge — demandez-moi les portes, l\u2019accessibilité, le transport ou la durabilité.',
    chatError: 'Souci de connexion — voici ce que j\u2019ai directement :',
    cards: [
      { t: 'Navigation', d: 'Itinéraires sans marches, portes proches, orientation.', q: 'Itinéraire accessible le plus rapide vers ma section ?' },
      { t: 'Accessibilité', d: 'Salles sensorielles, aide auditive, sièges accessibles.', q: 'Zone fraîche la plus proche pour sensibilité à la chaleur ?' },
      { t: 'Transport', d: 'Navettes, lignes de transport, zones de dépose.', q: 'Meilleur moyen de rentrer en ville après le match ?' },
      { t: 'Durabilité', d: 'Points d\u2019eau, recyclage, conseils de trajet bas-carbone.', q: 'Point d\u2019eau et recyclage les plus proches ?' },
    ], askBtn: 'Demander',
    reportIssueTitle: 'Signaler un problème', reportIssueSub: 'Dites-nous ce qui ne va pas — votre signalement va directement à l\'équipe ops.',
    reportPlaceholder: 'p. ex. Impossible de trouver un itinéraire accessible vers la Section 208', reportSubmit: 'Envoyer le signalement', reportExample: 'Essayer l\'exemple',
    reportConfirm: 'Signalement reçu — l\'équipe ops a été notifiée.',
    logsEmpty: 'Aucun signalement — les soumissions des fans et du personnel apparaîtront ici.',
    sosTitle: 'Urgence SOS', sosCancel: 'Annuler', sosSent: 'Alerte envoyée — un agent arrive.',
    sosOptions: ['Urgence médicale', 'Problème de sécurité', 'Enfant perdu', 'Partager ma position avec le personnel'] },
  hi: { statusTitle: 'लाइव स्टेडियम स्थिति', gateStatus: 'गेट स्थिति', crowdStatus: 'भीड़ घनत्व',
    chatTitle: 'AI कॉन्सियर्ज', chatSub: 'बहुभाषी · आपकी भाषा में उत्तर',
    chatPlaceholder: 'गेट, सुगम्यता, परिवहन, स्थिरता के बारे में पूछें…', chatSubmit: 'पूछें', thinking: 'सोच रहा है…',
    greeting: 'नमस्ते! मैं आपका कॉन्सियर्ज हूं — गेट, सुगम्यता, परिवहन या स्थिरता के बारे में पूछें।',
    chatError: 'कनेक्शन में समस्या — यह सीधे उपलब्ध जानकारी है:',
    cards: [
      { t: 'नेविगेशन', d: 'सीढ़ी-मुक्त मार्ग, निकटतम गेट और मार्गदर्शन।', q: 'मेरी सीट तक सबसे तेज़ सुगम्य मार्ग?' },
      { t: 'सुगम्यता', d: 'संवेदी कक्ष, श्रवण सहायता, सुगम्य सीटें।', q: 'गर्मी-संवेदनशीलता के लिए निकटतम ठंडा क्षेत्र?' },
      { t: 'परिवहन', d: 'शटल, परिवहन लाइनें, राइडशेयर पिकअप।', q: 'मैच के बाद डाउनटाउन जाने का सबसे अच्छा तरीका?' },
      { t: 'स्थिरता', d: 'रिफिल स्टेशन, रीसाइक्लिंग पॉइंट, यात्रा सुझाव।', q: 'निकटतम पानी रिफिल और रीसाइक्लिंग पॉइंट?' },
    ], askBtn: 'पूछें',
    reportIssueTitle: 'अपनी समस्या रिपोर्ट करें', reportIssueSub: 'बताएं क्या गलत है — आपकी रिपोर्ट सीधे ऑप्स टीम को जाती है।',
    reportPlaceholder: 'उदा. सेक्शन 208 तक सुगम्य मार्ग नहीं मिल रहा', reportSubmit: 'रिपोर्ट भेजें', reportExample: 'उदाहरण आज़माएं',
    reportConfirm: 'रिपोर्ट प्राप्त — ऑप्स टीम को सूचित कर दिया गया है।',
    logsEmpty: 'अभी कोई रिपोर्ट नहीं — fan और staff की रिपोर्ट यहाँ दिखेंगी।',
    sosTitle: 'आपातकालीन SOS', sosCancel: 'रद्द करें', sosSent: 'अलर्ट भेजा गया — निकटतम स्टाफ आ रहा है।',
    sosOptions: ['चिकित्सा आपातकाल', 'सुरक्षा चिंता', 'बच्चा खो गया', 'स्टाफ के साथ लोकेशन साझा करें'] },
};

let currentLang = LANGS[0];
let chatHistory = [];
let fanBroadcastText = '';

/* ---------------- language ---------------- */
function t() { return STRINGS[currentLang.code] || STRINGS.en; }

function applyLanguage() {
  const s = t();
  document.documentElement.lang = currentLang.code;
  qs('#status-title').textContent = s.statusTitle;
  qs('#gate-status-label').textContent = s.gateStatus;
  qs('#crowd-status-label').textContent = s.crowdStatus;
  qs('.chat-panel h2').innerHTML = escapeHtml(s.chatTitle) + ' <span class="eyebrow">' + escapeHtml(s.chatSub) + '</span>';
  qs('#chat-input').placeholder = s.chatPlaceholder;
  qs('#chat-submit').textContent = s.chatSubmit;
  renderFeatureCards();
  renderChatChips();
  if (chatHistory.length === 1 && chatHistory[0].greeting) {
    chatHistory = [{ role: 'ai', text: s.greeting, greeting: true }];
    renderChat();
  }
  renderStatus();
}

function populateLanguageSelect() {
  const sel = qs('#language-select');
  sel.innerHTML = LANGS.map((l) => '<option value="' + l.code + '">' + escapeHtml(l.label) + '</option>').join('');
  sel.value = currentLang.code;
  sel.addEventListener('change', () => {
    currentLang = LANGS.find((l) => l.code === sel.value) || LANGS[0];
    applyLanguage();
    announce('Language set to ' + currentLang.label);
  });
}

function populateTranslateTargets() {
  const sel = qs('#translate-target');
  sel.innerHTML = TRANSLATE_TARGETS.map((l) => '<option value="' + escapeHtml(l.code) + '">' + escapeHtml(l.label) + '</option>').join('');
}

/* ---------------- status + feature cards ---------------- */
function gateWaitMinutes() { return Math.max(1, Math.round(avgDensity() * 9)); }

function renderStatus() {
  qs('#gate-status').textContent = gateWaitMinutes() + ' min avg wait';
  qs('#crowd-status').textContent = densityLabel(avgDensity()) + ' (' + Math.round(avgDensity() * 100) + '%)';
  renderFanBroadcast();
}

function renderFeatureCards() {
  const s = t();
  qs('#feature-cards').innerHTML = s.cards.map((c) =>
    '<div class="feature-card"><h3>' + escapeHtml(c.t) + '</h3><p>' + escapeHtml(c.d) + '</p>'
    + '<div class="feature-question-row">'
    + '<button type="button" data-prompt="' + escapeHtml(c.q) + '">' + escapeHtml(s.askBtn) + '</button>'
    + '<button type="button" data-prompt="' + escapeHtml('How do I get to the nearest ' + c.t.toLowerCase() + ' support point?') + '">Quick help</button>'
    + '</div></div>'
  ).join('');
  qsa('#feature-cards button').forEach((b) => b.addEventListener('click', () => sendChat(b.dataset.prompt)));
}

function renderChatChips() {
  const s = t();
  const chips = s.cards.slice(0, 3).map((c) => c.q);
  qs('#chat-chips').innerHTML = chatHistory.length > 1 ? '' : chips.map((c) => '<button type="button" class="chip">' + escapeHtml(c) + '</button>').join('');
  qsa('#chat-chips .chip').forEach((b) => b.addEventListener('click', () => sendChat(b.textContent)));
}

function renderFanBroadcast() {
  const text = fanBroadcastText.trim();
  const banner = qs('#broadcast-banner');
  const label = qs('.broadcast-label');
  const message = qs('#fan-broadcast-text');
  if (!banner || !label || !message) return;
  label.textContent = t().fanUpdateLabel;
  message.textContent = text || t().fanNoUpdate;
}

/* ---------------- pulse screen ---------------- */
function pulseMessages() {
  const flagged = ZONES.filter((z) => Math.abs(mismatch(z)) > 0.12);
  const hot = ZONES.filter((z) => density(z) > 0.85).sort((a, b) => density(b) - density(a));
  const msgs = [];
  if (flagged.length) {
    const z = flagged[0];
    msgs.push('Zone ' + z.label + ': ' + z.seat.toLocaleString() + ' seated vs ' + z.gate.toLocaleString() + ' scanned — reconciliation flagged');
  }
  if (hot.length) msgs.push(hot.length + ' zone' + (hot.length > 1 ? 's' : '') + ' at high density — Zone ' + hot[0].label + ' leading at ' + Math.round(density(hot[0]) * 100) + '%');
  msgs.push('Gate average entry wait: ' + gateWaitMinutes() + ' min');
  msgs.push(ZONES.length + ' zones monitored · all other systems nominal');
  return msgs;
}

function startPulse() {
  const msgs = pulseMessages();
  let i = 0;
  const el = qs('#pulse-message');
  crossfadeText(el, msgs[0]);
  setInterval(() => { i = (i + 1) % msgs.length; crossfadeText(el, msgs[i]); }, 5000);
  setInterval(() => { qs('#clock').textContent = nowClock(); }, 1000);
  qs('#clock').textContent = nowClock();
}

/* ---------------- chat ---------------- */
function statusFacts() {
  return 'Gate average wait ' + gateWaitMinutes() + ' minutes. Overall crowd density ' + densityLabel(avgDensity()) + ' at ' + Math.round(avgDensity() * 100) + '%. '
    + 'Zones: ' + ZONES.map((z) => z.label + ' (' + (z.tag || z.name) + ', ' + Math.round(density(z) * 100) + '% full)').join('; ') + '.';
}

function renderChat() {
  const log = qs('#chat-log');
  log.innerHTML = chatHistory.map((m) => {
    if (m.role === 'user') return '<div class="msg msg-user">' + escapeHtml(m.text) + '</div>';
    const badge = m.source === 'ai' ? '<span class="badge-ai">✦</span>' : '';
    return '<div class="msg msg-ai">' + badge + escapeHtml(m.text) + '</div>';
  }).join('');
  log.scrollTop = log.scrollHeight;
}

async function sendChat(text) {
  if (!text || !text.trim()) return;
  chatHistory.push({ role: 'user', text });
  renderChat();
  renderChatChips();
  const log = qs('#chat-log');
  const loadingEl = document.createElement('div');
  loadingEl.className = 'msg msg-loading';
  loadingEl.textContent = t().thinking;
  log.appendChild(loadingEl);
  log.scrollTop = log.scrollHeight;
  qs('#chat-submit').disabled = true;
  try {
    const reply = await askConcierge(text, currentLang.code, statusFacts());
    chatHistory.push({ role: 'ai', text: reply, source: 'ai' });
    announce(reply);
  } catch {
    chatHistory.push({ role: 'ai', text: t().chatError + ' ' + statusFacts(), source: 'fallback' });
    showError('Concierge is temporarily unreachable.');
  } finally {
    qs('#chat-submit').disabled = false;
    renderChat();
  }
}

function publishFanBroadcast(text) {
  fanBroadcastText = text.trim();
  renderFanBroadcast();
  announce('Ops team update: ' + fanBroadcastText);
}

/* ---------------- incidents ---------------- */
let incidentCount = 0;

function renderIncident(item) {
  // Hide the "no reports yet" empty state
  const empty = qs('#logs-empty');
  if (empty) empty.hidden = true;

  // Increment badge on Ops tab
  incidentCount += 1;
  const opsTab = qs('#tab-ops');
  if (opsTab) opsTab.textContent = 'Ops Team (' + incidentCount + ')';

  const li = document.createElement('li');
  li.className = 'incident-item sev-' + item.severity;
  li.innerHTML = '<div class="incident-head"><span class="sev-badge sev-' + item.severity + '">' + escapeHtml(item.severity) + '</span>'
    + '<span class="incident-cat">' + escapeHtml(item.category) + '</span><span class="incident-time">' + nowClock() + '</span></div>'
    + '<p class="incident-summary">' + escapeHtml(item.summary) + '</p>'
    + '<ul class="incident-actions">' + item.actions.map((a) => '<li>' + escapeHtml(a) + '</li>').join('') + '</ul>'
    + '<p class="incident-escalate">→ ' + escapeHtml(item.escalate_to) + '</p>';
  qs('#incident-list').prepend(li);
}

/* ---------------- crowd / zone rows ---------------- */
function renderZoneRows() {
  qs('#zone-rows').innerHTML = ZONES.map((z) => {
    const d = density(z), mm = mismatch(z), flagged = Math.abs(mm) > 0.12;
    return '<div class="zone-row"><span class="zone-chip ' + densityClass(d) + '">' + z.label + '</span>'
      + '<span class="zone-name">' + escapeHtml(z.name) + (z.tag ? ' · ' + escapeHtml(z.tag) : '') + '</span>'
      + '<span class="zone-nums">' + z.gate.toLocaleString() + ' scan / ' + z.seat.toLocaleString() + ' seated</span>'
      + '<span class="zone-flag">' + (flagged ? Math.abs(Math.round(mm * 100)) + '% mismatch' : '') + '</span>'
      + '<span class="zone-flag">' + Math.round(d * 100) + '%</span></div>';
  }).join('');
}

function zoneSummaryString() {
  return ZONES.map((z) => z.label + ': cap ' + z.cap + ', gate-scan ' + z.gate + ', seated ' + z.seat).join(' | ');
}

/* ---------------- SOS ---------------- */
function renderSosBody(sent) {
  const s = t();
  const body = qs('#sos-body');
  if (sent) {
    body.innerHTML = '<div class="sos-sent"><p class="incident-summary" style="font-size:1.05rem">' + escapeHtml(s.sosSent) + '</p>'
      + '<button type="button" class="primary-button mt-sm" id="sos-ok">OK</button></div>';
    qs('#sos-ok').addEventListener('click', closeSos);
  } else {
    body.innerHTML = '<h2 id="sos-title">🚨 ' + escapeHtml(s.sosTitle) + '</h2>'
      + s.sosOptions.map((o) => '<button type="button" class="sos-option">' + escapeHtml(o) + '</button>').join('')
      + '<button type="button" class="sos-cancel-btn" id="sos-cancel">' + escapeHtml(s.sosCancel) + '</button>';
    qsa('.sos-option', body).forEach((b) => b.addEventListener('click', () => renderSosBody(true)));
    qs('#sos-cancel').addEventListener('click', closeSos);
  }
}
function openSos() { qs('#sos-overlay').hidden = false; renderSosBody(false); qs('#sos-modal').focus(); }
function closeSos() { qs('#sos-overlay').hidden = true; qs('#sos-trigger').focus(); }

/* ---------------- tabs ---------------- */
function initTabs() {
  const tabs = qsa('[role="tab"]');
  const panels = { 'tab-fan': qs('#view-fan'), 'tab-ops': qs('#view-ops') };
  function select(tab) {
    tabs.forEach((tb) => { const sel = tb === tab; tb.setAttribute('aria-selected', String(sel)); tb.tabIndex = sel ? 0 : -1; });
    Object.entries(panels).forEach(([id, panel]) => { panel.hidden = id !== tab.id; });
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      next.focus(); select(next);
    });
  });
}

/* ---------------- init ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  chatHistory = [{ role: 'ai', text: STRINGS.en.greeting, greeting: true }];
  populateLanguageSelect();
  populateTranslateTargets();
  renderZoneRows();
  applyLanguage();
  renderChat();
  startPulse();
  initTabs();

  qs('#chat-form').addEventListener('submit', (e) => { e.preventDefault(); const inp = qs('#chat-input'); const v = inp.value; inp.value = ''; sendChat(v); });

  qs('#incident-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = qs('#incident-input');
    const text = inp.value.trim();
    if (!text) return;
    const submitBtn = qs('#incident-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
    inp.value = '';
    // Show the fan confirmation immediately
    const confirm = qs('#fan-report-confirm');
    if (confirm) confirm.hidden = false;
    announce('Report submitted — ops team notified.');
    try {
      const item = await analyzeIncident(text);
      renderIncident(item);
    } catch {
      // Even if AI triage fails, log a fallback entry in Ops
      renderIncident({ severity: 'medium', category: 'other', summary: text.slice(0, 140), actions: ['AI unreachable — manual triage needed'], escalate_to: 'Duty Manager' });
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit report';
      // Auto-hide fan confirmation after 5s
      setTimeout(() => { if (confirm) confirm.hidden = true; }, 5000);
    }
  });

  qs('#ops-broadcast-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = qs('#ops-broadcast-input');
    const text = inp.value.trim();
    if (!text) return;
    publishFanBroadcast(text);
    inp.value = '';
    showError('Fan update sent to live stadium status.');
  });
  qs('#incident-example').addEventListener('click', () => { qs('#incident-input').value = 'Fan reported dizziness near Zone C, section 14, possible heat exhaustion.'; });

  qs('#translate-submit').addEventListener('click', async () => {
    const text = qs('#translate-input').value.trim();
    const target = qs('#translate-target').value;
    if (!text) return;
    const out = qs('#translate-output');
    out.textContent = 'Translating…';
    try { out.textContent = await translateText(text, target); }
    catch { out.textContent = 'Translation service unreachable — try again shortly.'; showError('Translate is temporarily unreachable.'); }
  });

  qs('#crowd-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = qs('#advisory-output');
    out.textContent = 'Generating advisory…';
    try { out.textContent = await generateAdvisory(zoneSummaryString()); }
    catch { out.textContent = 'Advisory service unreachable. Manual check: ' + zoneSummaryString(); showError('Advisory generator is temporarily unreachable.'); }
  });

  qs('#text-size-toggle').addEventListener('click', () => {
    const body = document.body;
    const large = body.dataset.textSize !== 'large';
    body.dataset.textSize = large ? 'large' : 'normal';
    qs('#text-size-toggle').setAttribute('aria-pressed', String(large));
    qs('#text-size-toggle').textContent = large ? 'A- Normal text' : 'A+ Larger text';
  });

  qs('#sos-trigger').addEventListener('click', openSos);
  qs('#sos-overlay').addEventListener('click', (e) => { if (e.target.id === 'sos-overlay') closeSos(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !qs('#sos-overlay').hidden) closeSos(); });
});
