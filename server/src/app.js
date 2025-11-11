import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';

import { healthRouter } from './routes/health.js';
import { voiceRouter } from './routes/voice.js';
import { manageRouter } from './routes/manage.js';
import { duplicateRouter } from './routes/duplicate.js';
import { registerRouter } from './routes/register.js';
import { offerRideRouter } from './routes/offer-ride.js';
import { requestRideRouter } from './routes/request-ride.js';
import { matchRouter } from './routes/match.js';
import authRouter from './routes/auth.js';
import { collections, getDb } from './db/mongoClient.js';
import * as logger from './utils/logger.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Add request logger middleware
app.use(logger.requestLogger);

// Twilio sends application/x-www-form-urlencoded by default for voice webhooks
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Log all parsed bodies
app.use((req, res, next) => {
  if (req.body && Object.keys(req.body).length > 0) {
    logger.debug('Request body:', req.body);
  }
  next();
});

// Session middleware using memory store for development/testing
// In production, you would use a proper session store like MongoDB or Redis
app.use(session({
  secret: process.env.SESSION_SECRET || 'rides-ivr-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 1000 } // 1 hour
}));

// Set default language for the application
const defaultLanguage = process.env.DEFAULT_LANG || 'en';
app.use((req, res, next) => {
  if (!req.session) {
    req.session = {};
  }
  // Set default language if not already set
  if (!req.session.language) {
    req.session.language = req.query.lang || defaultLanguage;
  }
  // Update language if specified in query
  if (req.query.lang) {
    req.session.language = req.query.lang;
    logger.debug('Language set from query parameter', { language: req.session.language });
  }
  next();
});

app.use('/health', healthRouter);
app.use('/voice', voiceRouter);
app.use('/voice/manage', manageRouter);
app.use('/voice/manage/duplicate', duplicateRouter);
app.use('/api/auth', authRouter);
// app.use('/api/register', registerRouter);  // Disabled: Registration now via IVR only
app.use('/api/rides/offer', offerRideRouter);
app.use('/api/rides/request', requestRideRouter);
app.use('/api/rides/match', matchRouter);

// Serve static files (recorded prompts) from /public under /static
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');
app.use('/static', express.static(publicDir));

// Serve all static HTML files from public directory
app.use(express.static(publicDir));

// Serve login form as home page
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'login.html'));
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).send('Internal Server Error');
});

app.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
  logger.info('Environment variables:', {
    NODE_ENV: process.env.NODE_ENV || 'development',
    MONGODB_URI: process.env.MONGODB_URI ? 'Set' : 'Not set',
    MONGODB_DB: process.env.MONGODB_DB,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ? 'Set' : 'Not set',
    TWILIO_NUMBER: process.env.TWILIO_NUMBER ? 'Set' : 'Not set',
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL
  });
});

// In-process expiration for pending matches (Mongo)
const ttlSec = parseInt(process.env.MATCH_TTL_SECONDS || '600', 10);
if (ttlSec > 0) {
  setInterval(async () => {
    try {
      const { matches } = await collections();
      const cutoffDate = new Date(Date.now() - ttlSec * 1000);
      logger.debug('Running match expiration job', { cutoffDate });
      
      const result = await matches.updateMany(
        { status: { $in: ['pending','notified'] }, created_at: { $lt: cutoffDate } },
        { $set: { status: 'expired', updated_at: new Date() } }
      );
      
      if (result.modifiedCount > 0) {
        logger.info('Expired matches', { 
          count: result.modifiedCount,
          matchedCount: result.matchedCount
        });
      }
    } catch (e) {
      logger.error('Error in match expiration job', { error: e.message, stack: e.stack });
    }
  }, Math.max(30_000, Math.min(ttlSec * 500, 300_000)));
}
