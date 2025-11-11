import express from 'express';
import { getMatchById, updateMatchStatus } from '../db/repo.js';
import logger from '../utils/logger.js';

export const matchRouter = express.Router();

/**
 * Normalize phone number for Israeli system
 */
function normalizeIsraeliPhone(phone) {
  if (!phone) return '';
  let cleaned = phone.replace(/[^+\d]/g, '');
  if (cleaned.startsWith('+972')) {
    cleaned = '0' + cleaned.substring(4);
  }
  return cleaned;
}

/**
 * PUT /api/rides/match/:id/accept
 * Accept a match
 */
matchRouter.put('/:id/accept', async (req, res) => {
  try {
    const { id } = req.params;
    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required for verification'
      });
    }

    const cleanPhone = normalizeIsraeliPhone(phone);
    
    // Get the match
    const match = await getMatchById(id);

    if (!match) {
      return res.status(404).json({
        success: false,
        error: 'Match not found'
      });
    }

    // Verify ownership (user must be part of this match)
    // We'll need to check if the phone matches either the driver or rider
    // This requires getting the offer/request details
    // For now, we'll update the status

    // Update match status to 'accepted'
    await updateMatchStatus(id, 'accepted');

    logger.info('Match accepted', {
      matchId: id,
      phone: cleanPhone
    });

    res.json({
      success: true,
      message: 'ההתאמה אושרה בהצלחה!'
    });

  } catch (error) {
    logger.error('Error accepting match', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'שגיאה באישור ההתאמה'
    });
  }
});

/**
 * PUT /api/rides/match/:id/decline
 * Decline a match
 */
matchRouter.put('/:id/decline', async (req, res) => {
  try {
    const { id } = req.params;
    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required for verification'
      });
    }

    const cleanPhone = normalizeIsraeliPhone(phone);
    
    // Get the match
    const match = await getMatchById(id);

    if (!match) {
      return res.status(404).json({
        success: false,
        error: 'Match not found'
      });
    }

    // Update match status to 'declined'
    await updateMatchStatus(id, 'declined');

    logger.info('Match declined', {
      matchId: id,
      phone: cleanPhone
    });

    res.json({
      success: true,
      message: 'ההתאמה נדחתה'
    });

  } catch (error) {
    logger.error('Error declining match', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'שגיאה בדחיית ההתאמה'
    });
  }
});
