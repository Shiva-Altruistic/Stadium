'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const conciergeRouter = require('./src/routes/concierge');
const crowdAdvisoryRouter = require('./src/routes/crowdAdvisory');
const incidentSummaryRouter = require('./src/routes/incidentSummary');
const translateRouter = require('./src/routes/translate');
const { ValidationError } = require('./src/security');
const { GenAIError } = require('./src/genaiClient');

function createApp() {
  const app = express();

  // Never trust client-controlled proxy headers for rate limiting unless
  // explicitly behind a known proxy (set via env in real deployment).
  app.set('trust proxy', process.env.TRUST_PROXY === '1');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", 'https://fonts.googleapis.com'],
          fontSrc: ["https://fonts.gstatic.com"],
          connectSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          scriptSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  // CORS matters only if the frontend is ever served from a different origin
  // than this API (e.g. a separate static host). When server.js also serves
  // frontend/ (the default below), every request is same-origin and CORS
  // never comes into play.
  app.use(
    cors({
      origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
      methods: ['GET', 'POST'],
    }),
  );
  app.use(express.json({ limit: '20kb' }));

  // Serve the static frontend from this same process, so the whole
  // application — UI and API — starts with a single `npm start`.
  app.use(express.static(path.join(__dirname, '..', 'frontend'), { index: 'index.html' }));

  // Generous ceiling for a stadium-scale audience, tight enough to blunt
  // scripted abuse of paid model calls. Tune per route in production using
  // real traffic data from FIFA World Cup 2026 pilot events.
  const genaiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please wait a moment and try again.' },
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api/concierge', genaiLimiter, conciergeRouter);
  app.use('/api/crowd-advisory', genaiLimiter, crowdAdvisoryRouter);
  app.use('/api/incident-summary', genaiLimiter, incidentSummaryRouter);
  app.use('/api/translate', genaiLimiter, translateRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Centralized error handler — the only place that decides what error
  // detail is safe to send to a client. Stack traces never leave the server.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof ValidationError) {
      return res.status(err.statusCode).json({ error: err.message, field: err.field });
    }
    if (err instanceof GenAIError) {
      // The client only ever sees the generic message above — but the real
      // cause (DNS failure, timeout, wrong endpoint, provider outage, etc.)
      // is logged here so it's visible in the terminal running `npm start`.
      console.error('GenAI request failed:', err.message, err.cause || '');
      return res.status(err.statusCode).json({ error: err.message });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request payload too large.' });
    }
    console.error('Unhandled error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`StadiumPulse AI backend listening on port ${port}`);
  });
}

module.exports = { createApp };
