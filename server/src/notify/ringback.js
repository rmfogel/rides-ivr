import twilio from 'twilio';
import logger from '../utils/logger.js';

function getClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  
  if (!sid || !token) {
    logger.warn('Missing Twilio credentials', {
      hasSid: !!sid,
      hasToken: !!token
    });
    return null;
  }
  
  try { 
    return twilio(sid, token); 
  } catch (err) { 
    logger.error('Failed to initialize Twilio client', {
      error: err.message,
      stack: err.stack
    });
    return null; 
  }
}

export async function ringbackRider(phone) {
  const client = getClient();
  const from = process.env.TWILIO_NUMBER;
  const base = process.env.PUBLIC_BASE_URL;
  
  if (!client || !from || !base) {
    logger.warn('Cannot perform rider ringback, missing configuration', {
      hasClient: !!client,
      hasFromNumber: !!from,
      hasBaseUrl: !!base,
      phone
    });
    return false;
  }
  
  logger.debug('Attempting to ringback rider', {
    phone,
    from,
    webhook: `${base}/voice/ringback-start?r=${encodeURIComponent(phone)}`
  });
  
  try {
    const call = await client.calls.create({
      to: phone,
      from,
      url: `${base}/voice/ringback-start?r=${encodeURIComponent(phone)}`,
      machineDetection: 'Enable',
    });
    
    logger.info('Successfully initiated rider ringback', {
      phone,
      callSid: call.sid
    });
    return true;
  } catch (e) {
    logger.error('Failed to ringback rider', {
      phone,
      error: e.message,
      code: e.code,
      stack: e.stack
    });
    return false;
  }
}

export async function ringbackDriver(phone) {
  const client = getClient();
  const from = process.env.TWILIO_NUMBER;
  const base = process.env.PUBLIC_BASE_URL;
  
  if (!client || !from || !base) {
    logger.warn('Cannot perform driver ringback, missing configuration', {
      hasClient: !!client,
      hasFromNumber: !!from,
      hasBaseUrl: !!base,
      phone
    });
    return false;
  }
  
  logger.debug('Attempting to ringback driver', {
    phone,
    from,
    webhook: `${base}/voice/ringback-start?d=${encodeURIComponent(phone)}`
  });
  
  try {
    const call = await client.calls.create({
      to: phone,
      from,
      url: `${base}/voice/ringback-start?d=${encodeURIComponent(phone)}`,
      machineDetection: 'Enable',
    });
    
    logger.info('Successfully initiated driver ringback', {
      phone,
      callSid: call.sid
    });
    return true;
  } catch (e) {
    logger.error('Failed to ringback driver', {
      phone,
      error: e.message,
      code: e.code,
      stack: e.stack
    });
    return false;
  }
}
