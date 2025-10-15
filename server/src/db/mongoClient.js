import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';
dotenv.config();

let client; // MongoClient instance
let db;     // Selected database

async function ensureConnected(uri) {
  // Try a cheap ping; if it fails, (re)connect
  try {
    if (client) {
      const testDb = client.db(process.env.MONGODB_DB || 'rides');
      await testDb.command({ ping: 1 });
      logger.debug('MongoDB connection verified');
      return; // already connected
    }
  } catch (e) {
    logger.warn('MongoDB connection test failed', { 
      error: e.message,
      name: e.name 
    });
    // If topology closed or other connection issue, release the client for reconnect
    if (
      e?.name === 'MongoTopologyClosedError' || 
      e?.name === 'MongoNotConnectedError' || 
      /Topology is closed/i.test(e?.message || '')
    ) {
      try { await client?.close().catch(() => {}); } catch {}
      client = undefined;
      db = undefined;
    }
    // Fall through to reconnect
  }

  if (!client) {
    const allowInvalid = (process.env.MONGODB_TLS_ALLOW_INVALID || '').toLowerCase() === 'true';
    const isLocalhost = uri.includes('localhost') || uri.includes('127.0.0.1');
    
    logger.debug('Creating new MongoDB client', {
      uri: uri.replace(/mongodb:\/\/([^:]+):([^@]+)@/, 'mongodb://***:***@'),
      isLocalhost,
      tlsEnabled: !isLocalhost,
      tlsAllowInvalid: allowInvalid
    });
    
    client = new MongoClient(uri, {
      maxPoolSize: 10,
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
      // TLS settings (only applied for non-localhost)
      tls: !isLocalhost,
      tlsAllowInvalidCertificates: allowInvalid,
    });
  }
  
  // Always attempt connect; it's idempotent on an already-connected client
  try {
    logger.debug('Connecting to MongoDB');
    await client.connect();
    logger.info('Successfully connected to MongoDB');
  } catch (e) {
    logger.error('Failed to connect to MongoDB', {
      error: e.message,
      stack: e.stack,
      code: e.code
    });
    // If connection failed, clear the client
    client = undefined;
    db = undefined;
    throw e; // Rethrow for caller handling
  }
}

export async function getDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    logger.error('MONGODB_URI environment variable not set');
    throw new Error('MONGODB_URI not set');
  }
  
  const dbName = process.env.MONGODB_DB || 'rides';
  logger.debug('Getting database connection', { dbName });

  // Try to ensure we're connected, with retry for transient issues
  const maxRetries = 2;
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        logger.debug('Retrying database connection', { attempt, maxRetries });
      }
      
      await ensureConnected(uri);
      db = client.db(dbName);
      return db;
    } catch (err) {
      lastError = err;
      logger.warn('Database connection attempt failed', { 
        attempt, 
        error: err.message,
        code: err.code,
        willRetry: attempt < maxRetries
      });
      
      if (attempt < maxRetries) {
        // Short delay between retries (500ms, 1000ms)
        const delay = 500 * (attempt + 1);
        logger.debug('Waiting before retry', { delay });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // If we get here, all retries failed
  logger.error('Failed to connect to MongoDB after all retries', {
    maxRetries,
    lastError: lastError?.message
  });
  throw lastError || new Error('Failed to connect to MongoDB after retries');
}

export async function closeMongo() {
  try {
    if (client) {
      logger.debug('Closing MongoDB connection');
      await client.close();
      logger.info('MongoDB connection closed');
    }
  } catch (err) {
    logger.error('Error closing MongoDB connection', {
      error: err.message,
      stack: err.stack
    });
  } finally {
    client = undefined;
    db = undefined;
  }
}

export async function collections() {
  logger.debug('Getting collections');
  const database = await getDb();
  const cols = {
    users: database.collection('users'),
    offers: database.collection('ride_offers'),
    requests: database.collection('ride_requests'),
    matches: database.collection('matches'),
  };
  return cols;
}

export async function ensureIndexes() {
  const { users, offers, requests, matches } = await collections();
  await Promise.all([
    users.createIndex({ phone: 1 }, { unique: true }),
    offers.createIndex({ status: 1, departure_time: 1 }),
    requests.createIndex({ status: 1, earliest_time: 1, latest_time: 1 }),
    matches.createIndex({ request_id: 1 }),
    matches.createIndex({ status: 1, created_at: 1 }),
  ]);
}
