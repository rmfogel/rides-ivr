-- Add IVR registration fields to users collection (MongoDB)
-- This file is for documentation purposes

-- Add indexes for the new fields
CREATE INDEX idx_users_pin ON users(pin);

-- Expected updates to user document structure:
-- {
--   _id: ObjectId,
--   phone: String (required, unique),
--   name: String (optional - text name),
--   name_recording_url: String (optional - URL to Twilio recording of user's name),
--   pin: String (optional - hashed 4-digit PIN for web interface login),
--   registered_via_ivr: Boolean (default: false - indicates if user completed IVR registration),
--   is_allowed: Boolean (default: true),
--   declared_gender: String (optional, enum: 'male', 'female'),
--   created_at: Date (required),
--   updated_at: Date (required)
-- }

-- Notes:
-- 1. name_recording_url: Stores Twilio recording URL from IVR registration
-- 2. pin: 4-digit PIN hashed with bcrypt for web interface authentication
-- 3. registered_via_ivr: True if user completed full IVR registration (name recording + PIN)
-- 4. PIN is ONLY used for web interface login, NOT for IVR authentication
