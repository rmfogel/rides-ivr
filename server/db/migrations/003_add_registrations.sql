-- Add registrations collection (MongoDB collections are created automatically)
-- This file is for documentation purposes

-- Create index on phone for fast lookups
CREATE INDEX idx_registrations_phone ON registrations(phone);

-- Create index on status for filtering
CREATE INDEX idx_registrations_status ON registrations(status);

-- Create index on createdAt for sorting
CREATE INDEX idx_registrations_created_at ON registrations(createdAt);

-- Expected document structure:
-- {
--   _id: ObjectId,
--   fullName: String (required),
--   phone: String (required, unique),
--   email: String (optional),
--   city: String (required),
--   role: String (required, enum: 'driver', 'rider', 'both'),
--   carModel: String (optional),
--   seats: Number (optional),
--   notes: String (optional),
--   status: String (required, default: 'pending', enum: 'pending', 'approved', 'rejected'),
--   createdAt: Date (required),
--   updatedAt: Date (required)
-- }
