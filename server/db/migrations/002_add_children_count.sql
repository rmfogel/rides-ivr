-- Add children_count column to ride_requests table
-- Children can take any type of seat (male_only, female_only, or anygender)

ALTER TABLE ride_requests 
ADD COLUMN IF NOT EXISTS children_count INTEGER DEFAULT 0 NOT NULL;

COMMENT ON COLUMN ride_requests.children_count IS 'Number of children passengers (can occupy any seat type)';
