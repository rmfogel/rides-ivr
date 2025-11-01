import express from 'express';
import { collections } from '../db/mongoClient.js';
import * as logger from '../utils/logger.js';

export const registerRouter = express.Router();

/**
 * POST /api/register
 * Handle user registration submissions
 */
registerRouter.post('/', async (req, res) => {
  try {
    const {
      fullName,
      phone,
      email,
      city,
      role,
      carModel,
      seats,
      notes,
      timestamp
    } = req.body;

    // Validate required fields
    if (!fullName || !phone || !city || !role) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Validate phone format (Israeli phone numbers)
    const phoneRegex = /^0\d{1,2}-?\d{7}$/;
    const cleanPhone = phone.replace(/\s/g, '');
    if (!phoneRegex.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format'
      });
    }

    // Validate email if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format'
        });
      }
    }

    // Validate role
    const validRoles = ['driver', 'rider', 'both'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role'
      });
    }

    // Get registrations collection
    const { registrations } = await collections();

    // Check if phone number already registered
    const existingUser = await registrations.findOne({ phone: cleanPhone });
    if (existingUser) {
      logger.info('Registration attempt with existing phone', { phone: cleanPhone });
      return res.status(409).json({
        success: false,
        error: 'Phone number already registered'
      });
    }

    // Prepare registration document
    const registration = {
      fullName: fullName.trim(),
      phone: cleanPhone,
      email: email ? email.trim().toLowerCase() : null,
      city: city.trim(),
      role,
      carModel: carModel ? carModel.trim() : null,
      seats: seats ? parseInt(seats, 10) : null,
      notes: notes ? notes.trim() : null,
      status: 'pending', // pending, approved, rejected
      createdAt: new Date(timestamp || Date.now()),
      updatedAt: new Date()
    };

    // Insert registration
    const result = await registrations.insertOne(registration);

    logger.info('New registration created', {
      registrationId: result.insertedId,
      phone: cleanPhone,
      role,
      city
    });

    // Return success response
    res.status(201).json({
      success: true,
      registrationId: result.insertedId,
      message: 'Registration submitted successfully'
    });

  } catch (error) {
    logger.error('Error processing registration', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/register/check/:phone
 * Check if a phone number is already registered
 */
registerRouter.get('/check/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const cleanPhone = phone.replace(/\s|-/g, '');

    const { registrations } = await collections();
    const existingUser = await registrations.findOne({ phone: cleanPhone });

    res.json({
      exists: !!existingUser,
      phone: cleanPhone
    });

  } catch (error) {
    logger.error('Error checking registration', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});
