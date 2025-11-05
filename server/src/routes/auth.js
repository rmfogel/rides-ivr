import { Router } from 'express';
import { getUserByPhone, getUserPIN } from '../db/repo.js';
import { verifyPIN } from '../utils/pin.js';
import logger from '../utils/logger.js';

export const authRouter = Router();

/**
 * Login endpoint - verify phone and PIN
 * POST /api/login
 * Body: { phone, pin }
 */
authRouter.post('/login', async (req, res) => {
  const { phone, pin } = req.body;
  
  logger.info('Login attempt', { phone, hasPin: !!pin });
  
  try {
    // Validate inputs
    if (!phone || !pin) {
      logger.warn('Login failed: missing phone or PIN');
      return res.status(400).json({ error: 'נא להזין מספר טלפון וסיסמה' });
    }
    
    if (!/^\d{10}$/.test(phone)) {
      logger.warn('Login failed: invalid phone format', { phone });
      return res.status(400).json({ error: 'מספר טלפון לא תקין' });
    }
    
    if (!/^\d{4}$/.test(pin)) {
      logger.warn('Login failed: invalid PIN format');
      return res.status(400).json({ error: 'סיסמה חייבת להכיל 4 ספרות' });
    }
    
    // Check if user exists
    const user = await getUserByPhone(phone);
    if (!user) {
      logger.warn('Login failed: user not found', { phone });
      return res.status(401).json({ error: 'משתמש לא קיים. אנא הירשם דרך המערכת הקולית' });
    }
    
    // Check if user completed IVR registration
    if (!user.registered_via_ivr) {
      logger.warn('Login failed: user not registered via IVR', { phone });
      return res.status(401).json({ error: 'ההרשמה לא הושלמה. אנא השלם את ההרשמה דרך המערכת הקולית' });
    }
    
    // Get stored PIN hash
    const storedPINHash = await getUserPIN(phone);
    if (!storedPINHash) {
      logger.warn('Login failed: no PIN set', { phone });
      return res.status(401).json({ error: 'לא נקבעה סיסמה. אנא השלם את ההרשמה דרך המערכת הקולית' });
    }
    
    // Verify PIN
    const isPINValid = await verifyPIN(pin, storedPINHash);
    if (!isPINValid) {
      logger.warn('Login failed: invalid PIN', { phone });
      return res.status(401).json({ error: 'סיסמה שגויה' });
    }
    
    // Success - create session
    req.session.userId = user.id || user._id.toString();
    req.session.phone = phone;
    req.session.authenticated = true;
    
    logger.info('Login successful', { phone, userId: req.session.userId });
    
    res.json({ 
      success: true, 
      message: 'התחברות בוצעה בהצלחה',
      user: {
        phone,
        name: user.name,
        hasNameRecording: !!user.name_recording_url
      }
    });
    
  } catch (err) {
    logger.error('Login error', {
      error: err.message,
      stack: err.stack,
      phone
    });
    res.status(500).json({ error: 'שגיאת שרת. נסה שוב מאוחר יותר' });
  }
});

/**
 * Logout endpoint
 * POST /api/logout
 */
authRouter.post('/logout', (req, res) => {
  const phone = req.session?.phone;
  
  logger.info('Logout', { phone });
  
  req.session.destroy((err) => {
    if (err) {
      logger.error('Logout error', { error: err.message });
      return res.status(500).json({ error: 'שגיאה בהתנתקות' });
    }
    
    res.json({ success: true, message: 'התנתקת בהצלחה' });
  });
});

/**
 * Verify session endpoint
 * GET /api/verify-session
 */
authRouter.get('/verify-session', (req, res) => {
  if (req.session && req.session.authenticated && req.session.phone) {
    logger.debug('Session verified', { phone: req.session.phone });
    res.json({ 
      authenticated: true,
      phone: req.session.phone
    });
  } else {
    logger.debug('Session not authenticated');
    res.status(401).json({ 
      authenticated: false,
      error: 'לא מחובר'
    });
  }
});

/**
 * Middleware to protect routes - require authentication
 */
export function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated && req.session.phone) {
    next();
  } else {
    logger.warn('Unauthorized access attempt', { 
      path: req.path,
      hasSession: !!req.session 
    });
    res.status(401).json({ 
      error: 'נדרשת התחברות',
      redirectTo: '/login.html'
    });
  }
}

export default authRouter;
