import { DateTime } from 'luxon';
import { TZ } from './time.js';

// Log levels
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 100
};

// Get the current log level from environment or default to INFO
const currentLevel = process.env.LOG_LEVEL ? 
  (LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] || LOG_LEVELS.INFO) : 
  LOG_LEVELS.INFO;

/**
 * Format the current timestamp
 * @returns {string} Formatted timestamp
 */
function getTimestamp() {
  return DateTime.now().setZone(TZ).toFormat('yyyy-MM-dd HH:mm:ss.SSS');
}

/**
 * Format a log message with timestamp and level
 * @param {string} level The log level
 * @param {string} message The log message
 * @param {Object} data Additional data to log
 * @returns {string} Formatted log message
 */
function formatLogMessage(level, message, data = null) {
  const timestamp = getTimestamp();
  let logMessage = `[${timestamp}] [${level}] ${message}`;
  
  if (data) {
    try {
      if (typeof data === 'object') {
        logMessage += '\n' + JSON.stringify(data, null, 2);
      } else {
        logMessage += ' ' + data;
      }
    } catch (e) {
      logMessage += ' [Error serializing data: ' + e.message + ']';
    }
  }
  
  return logMessage;
}

/**
 * Debug level logging
 * @param {string} message The message to log
 * @param {Object} data Additional data to log
 */
export function debug(message, data = null) {
  if (currentLevel <= LOG_LEVELS.DEBUG) {
    console.debug(formatLogMessage('DEBUG', message, data));
  }
}

/**
 * Info level logging
 * @param {string} message The message to log
 * @param {Object} data Additional data to log
 */
export function info(message, data = null) {
  if (currentLevel <= LOG_LEVELS.INFO) {
    console.info(formatLogMessage('INFO', message, data));
  }
}

/**
 * Warning level logging
 * @param {string} message The message to log
 * @param {Object} data Additional data to log
 */
export function warn(message, data = null) {
  if (currentLevel <= LOG_LEVELS.WARN) {
    console.warn(formatLogMessage('WARN', message, data));
  }
}

/**
 * Error level logging
 * @param {string} message The message to log
 * @param {Object} data Additional data to log
 */
export function error(message, data = null) {
  if (currentLevel <= LOG_LEVELS.ERROR) {
    console.error(formatLogMessage('ERROR', message, data));
  }
}

/**
 * HTTP request logging middleware for Express
 */
export function requestLogger(req, res, next) {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(2, 10);
  
  // Add the request ID to the request object for further use
  req.requestId = requestId;
  
  // Log request details
  info(`HTTP ${req.method} ${req.url}`, {
    requestId,
    method: req.method,
    url: req.url,
    params: req.params,
    query: req.query,
    body: req.method !== 'GET' ? req.body : undefined,
    headers: {
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type'],
      'accept': req.headers['accept'],
      'x-forwarded-for': req.headers['x-forwarded-for']
    }
  });
  
  // Capture the original end function
  const originalEnd = res.end;
  
  // Override the end function to log the response
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    
    info(`Response for ${req.method} ${req.url}`, {
      requestId,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
    
    // Call the original end function
    return originalEnd.call(this, chunk, encoding);
  };
  
  next();
}

export default {
  debug,
  info,
  warn,
  error,
  requestLogger
};