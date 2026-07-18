<div align="center">

# 🏟️ StadiumPulse AI

### GenAI-Enabled Smart Stadium & Tournament Operations — FIFA World Cup 2026

*Challenge 4: Smart Stadiums & Tournament Operations*

[![CI](https://img.shields.io/github/actions/workflow/status/Adityaraj1969/Smart-Stadiums-Tournament-Operations/ci.yml?branch=main&style=for-the-badge&label=tests)](https://github.com/Adityaraj1969/Smart-Stadiums-Tournament-Operations/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg?style=for-the-badge)](LICENSE)

[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com)
[![Groq](https://img.shields.io/badge/GenAI-Groq-F55036?style=flat-square&logo=groq&logoColor=white)](https://console.groq.com)
[![Gemini](https://img.shields.io/badge/GenAI-Gemini-4285F4?style=flat-square&logo=googlegemini&logoColor=white)](https://aistudio.google.com)
[![Tests](https://img.shields.io/badge/tests-65%20passing-brightgreen?style=flat-square)](#-testing)
[![Coverage](https://img.shields.io/badge/coverage-~98%25-brightgreen?style=flat-square)](#-testing)

**[📂 Repository](https://github.com/Adityaraj1969/Smart-Stadiums-Tournament-Operations)** · *🚀 Deployment coming soon*

</div>

---

## 📋 The problem this solves

> Build a GenAI-enabled solution that enhances stadium operations and the overall tournament
> experience for fans, organizers, volunteers, or venue staff. The solution must leverage
> Generative AI to improve navigation, crowd management, accessibility, transportation,
> sustainability, multilingual assistance, operational intelligence, or real-time decision
> support during the FIFA World Cup 2026.

StadiumPulse AI is a **two-tab platform** — **Fan** and **Ops Team** — with one GenAI layer
underneath. The Ops Team tab serves both volunteers/staff and organizers in a single combined view,
so the same model reasoning handles a fan asking *"where's the nearest accessible gate?"* and a
duty manager asking *"what do I do about Concourse South at 91% density?"*

## 📑 Table of contents

- [Two views, one platform](#-two-views-one-platform)
- [Feature mapping](#-how-this-maps-to-the-brief)
- [Architecture](#-architecture)
- [Project structure](#-project-structure)
- [Running it locally](#-running-it-locally)
- [Security](#-security)
- [Accessibility](#-accessibility)
- [Testing](#-testing)
- [Efficiency](#-efficiency)
- [Limitations & roadmap](#-honest-limitations--roadmap)

## 🧭 Two views, one platform

A tournament venue has fans and operations staff making decisions at the same time, over the same
event, with very different needs. StadiumPulse AI gives each group its own view over one shared
operational picture:

| Tab | Who uses it | What it provides |
|---|---|---|
| **Fan** | Stadium attendees | AI Concierge for multilingual Q&A (navigation, accessibility, transport, sustainability), live stadium status, and SOS emergency flow |
| **Ops Team** | Volunteers, staff, and organizers — in one combined view | Incident reporting + AI triage, crowd density advisory, quick fan-broadcast, and staff↔fan quick translate |

## 🗺️ How this maps to the brief

| Area named in the brief | Implementation |
|---|---|
| 🧭 **Navigation** | Fan Concierge answers wayfinding questions (gates, sections, step-free routes); quick-prompt cards pre-fill common navigation asks and offer a one-line "Quick help" action. |
| 👥 **Crowd management** | Ops Team view turns per-zone density readings into live status updates and fan-visible operational alerts. |
| ♿ **Accessibility** | Dedicated concierge topic for step-free routes, sensory rooms, and assistive listening — plus the UI itself is fully accessible (see below). |
| 🚌 **Transportation** | Concierge topic for shuttles, transit lines, and rideshare pickup zones. |
| 🌱 **Sustainability** | Concierge topic for refill/recycling points and lower-carbon travel choices. |
| 🌐 **Multilingual assistance** | Every concierge and translate call is language-parameterized (11 languages); staff quick-translate bridges volunteer↔fan language gaps live. |
| 🧠 **Operational intelligence** | Incident Summary consolidates scattered free-text field reports into one severity-ranked brief for a duty manager, and Ops Team messages can be broadcast to the fan live-status panel. |
| ⚡ **Real-time decision support** | Crowd advisories and incident briefs are generated on demand from live input and always end in a concrete, named next action. |

## 🏗️ Architecture

The frontend (`js/api.js`) calls the **Express backend** (`/api/*` routes), which handles all AI
requests via **Groq** or **Gemini** (configured by `GENAI_PROVIDER` in `backend/.env`). The API key
never leaves the server — the browser only ever hits same-origin `/api/*` endpoints.

The backend also serves the static frontend files, so the full application — UI and API — starts
from one process (`npm start` inside `backend/`).

### Why Groq and Gemini, not OpenAI

Both offer a genuine **ongoing, no-credit-card** free API tier. Switching providers is one
environment variable (`GENAI_PROVIDER=groq|gemini`); adding a third means adding one file in
`src/providers/` — no route changes needed.

## 📁 Project structure

```
Smart-Stadiums-Tournament-Operations/
├── .github/
│   └── workflows/
│       └── Ci.YML                  Runs both test suites on every push to main
│
├── backend/                        Express API — the ONLY place that holds a model API key
│   ├── server.js                   App wiring: helmet+CSP, CORS, rate limiting, serves frontend/ too
│   ├── package.json                Dependencies: express, helmet, cors, dotenv, express-rate-limit
│   ├── .env.example                Template for required environment variables (never commit .env)
│   └── src/
│       ├── genaiClient.js          Provider-agnostic choke point for every LLM call (8s timeout, 1 retry)
│       ├── security.js             Input validation, XSS escaping, prompt-injection fencing
│       ├── providers/
│       │   ├── groq.js             Groq adapter (default) — OpenAI-compatible, free, no card needed
│       │   └── gemini.js           Gemini adapter (alternate) — Google's own request shape
│       └── routes/
│           ├── concierge.js        Fan AI Concierge — multilingual Q&A with venue context
│           ├── crowdAdvisory.js    Organizer crowd-density → actionable advisory generation
│           ├── incidentSummary.js  Staff incident reports → severity-ranked duty-manager brief
│           └── translate.js        Quick staff↔fan language translation (11 languages)
│
├── frontend/                       Static, CDN-free UI — talks only to this app's own backend
│   ├── index.html                  Semantic, ARIA-labeled two-tab interface (Fan + Ops Team)
│   ├── package.json                Dev dependency: jest + jest-environment-jsdom (tests only)
│   ├── css/
│   │   └── styles.css              "Stadium Command Console" design system
│   └── js/
│       ├── api.js                  Backend HTTP client — calls /api/* routes (Groq/Gemini via backend)
│       ├── app.js                  UI wiring: tab logic, event handlers, ops→fan broadcast flow
│       └── utils.js                Pure helpers: escapeHtml, debounce, density threshold classifiers
│
├── backend/tests/                  55 automated tests — Jest + Supertest
│   ├── security.test.js            16 tests: escaping, validation, prompt-injection fencing
│   ├── genaiClient.test.js         8 tests: provider switching, retries, error handling
│   ├── providers.groq.test.js      8 tests: request shape, reasoning_effort, response parsing
│   ├── providers.gemini.test.js    5 tests: request shape, response parsing, safety-block handling
│   └── routes.test.js              18 tests: all four endpoints — happy paths, validation, failures
│
├── frontend/tests/                 10 automated tests — Jest + jsdom
│   └── utils.test.js               XSS escaping, debounce timing, density threshold classifiers
│
├── .gitattributes
├── .gitignore
├── LICENSE
└── README.md
```

> **Note:** `node_modules/` directories and `.env` files are git-ignored and should never be
> committed to the repository.

## 🚀 Running it locally

### Prerequisites

- **Node.js ≥ 18** — [download here](https://nodejs.org)
- A free API key from **[Groq](https://console.groq.com/keys)** or **[Google AI Studio](https://aistudio.google.com/apikey)**

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/Adityaraj1969/Smart-Stadiums-Tournament-Operations.git
cd Smart-Stadiums-Tournament-Operations

# 2. Install backend dependencies and configure environment
cd backend
npm install
cp .env.example .env
# Edit .env and set:
#   GENAI_PROVIDER=groq          # or: gemini
#   GROQ_API_KEY=your_key_here   # free key → https://console.groq.com/keys
#   GEMINI_API_KEY=your_key_here # free key → https://aistudio.google.com/apikey

# 3. Run backend tests (optional but recommended)
npm test                         # 55 backend tests

# 4. Start the server — serves both the API and the frontend
npm start                        # → http://localhost:3000
```

```bash
# Frontend tests (run separately from the frontend directory)
cd frontend
npm install
npm test                         # 10 frontend tests
```

The full application — UI and API — is served from **one process** at `http://localhost:3000`.

## 🔒 Security

- **API key isolation** — the key exists only in backend `process.env`; no route, log line, or
  client bundle ever contains it.
- **Prompt-injection resistance** — all user text is fenced inside `<fan_message>` tags and
  role-marker tokens (`system:`, `assistant:`, `human:`) are neutralized before reaching the model.
  The system prompt is always authored server-side, never built from client input.
- **XSS** — every value that reaches the DOM from a user or a model goes through `textContent` or
  `escapeHtml()`, never `innerHTML` with unescaped text. No inline styles either, so the CSP below
  needs no `unsafe-inline` exception.
- **Input validation** — length caps, batch-size caps, and an allow-list of language codes are
  enforced before a single token is sent to the model.
- **Transport hardening** — `helmet()` sets a strict `Content-Security-Policy`
  (`default-src 'self'`), a 20kb JSON body cap, and per-route rate limiting (20 req/min).
- **Fan broadcast flow** — Ops Team messages can be published into the Fan live-status panel so the
  latest operational note is visible in the stadium-wide status view immediately.
- **Fail-fast on transient errors** — one bounded retry on `5xx`, never on `4xx` — a bug caught by
  its own regression test during development (`genaiClient.test.js`).

## ♿ Accessibility

- Semantic landmarks, a working skip-link, and a real ARIA `tablist`/`tabpanel` pattern with
  roving arrow-key navigation between the two tabs (Fan / Ops Team).
- A visually-hidden `aria-live="polite"` region announces async results to screen readers without
  stealing keyboard focus.
- Every control has a programmatic label, including dynamically generated per-zone inputs.
- Visible focus rings in a color distinct from both accent colors.
- `prefers-reduced-motion` is respected throughout.
- A one-click "A+ Larger text" mode, independent of browser zoom.
- The concierge itself *is* an accessibility feature — fans can ask for step-free routes and
  sensory rooms in their own language instead of hunting a static map.
- The fan feature cards now present a compact one-line action row for "Ask about this" and
  "Quick help", keeping common fan requests easy to access without crowding the UI.

## 🧪 Testing

| Suite | Count | What it covers |
|---|---|---|
| `backend/tests/security.test.js` | 16 | Escaping, validation, prompt-injection fencing |
| `backend/tests/genaiClient.test.js` | 8 | Provider selection/switching, retries, error handling |
| `backend/tests/providers.groq.test.js` | 8 | Request shape, `reasoning_effort` handling, response parsing |
| `backend/tests/providers.gemini.test.js` | 5 | Request shape, response parsing, safety-block handling |
| `backend/tests/routes.test.js` | 18 | All four endpoints — happy paths, validation, failures, 404s |
| `frontend/tests/utils.test.js` | 10 | XSS escaping, debounce timing, density thresholds |
| **Total** | **65 passing**, ~98% statement coverage on `backend/src` | |

```bash
cd backend && npm test    # backend suite
cd frontend && npm test   # frontend suite
```

## ⚙️ Efficiency

- A single `genaiClient.generate()` choke point means one timeout (8s) and one bounded retry policy
  governs every feature.
- Requests fail validation *before* touching the network — invalid input never costs a model call.
- The frontend is dependency-free static HTML/CSS/JS — no bundler, no framework runtime to ship.
- JSON payloads capped at 20kb; batch endpoints capped at 25 items — keeps latency and token usage
  bounded on a rate-limited free tier.

## 🔭 Honest limitations & roadmap

- Crowd density and incident reports are simulated inputs in this prototype; a production version
  wires them to real turnstile/camera data and a volunteer-facing mobile app.
- The concierge's venue facts are placeholder demo data — the route already accepts a per-request
  `venueContext` override for real per-stadium data.
- No authentication yet on the Ops Team tab — any user can access the staff/organizer tools.
- Both free providers are rate-limited (Groq ~30 req/min); a multi-stadium rollout would move to a
  paid tier — the one-line `GENAI_PROVIDER` switch means that upgrade touches no route or test.
- 🚀 **Deployment coming soon** — the application will be hosted publicly once deployment is configured.

---

<div align="center">

Built for **Challenge 4: Smart Stadiums & Tournament Operations** · FIFA World Cup 2026

[MIT License](LICENSE)

</div>