-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(80),
  is_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  declared_gender VARCHAR(10) CHECK (declared_gender IN ('male','female')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ride offers
CREATE TABLE IF NOT EXISTS ride_offers (
  id SERIAL PRIMARY KEY,
  driver_phone VARCHAR(20) NOT NULL REFERENCES users(phone),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('FROM','TO')),
  departure_time TIMESTAMPTZ NOT NULL,
  seats_male_only INT NOT NULL DEFAULT 0,
  seats_female_only INT NOT NULL DEFAULT 0,
  seats_unisex INT NOT NULL DEFAULT 0,
  status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','cancelled','filled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- Ride requests
CREATE TABLE IF NOT EXISTS ride_requests (
  id SERIAL PRIMARY KEY,
  rider_phone VARCHAR(20) NOT NULL REFERENCES users(phone),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('FROM','TO')),
  earliest_time TIMESTAMPTZ NOT NULL,
  latest_time TIMESTAMPTZ NOT NULL,
  passengers_total INT NOT NULL CHECK (passengers_total > 0),
  couples_count INT NOT NULL DEFAULT 0,
  passengers_male INT NOT NULL DEFAULT 0,
  passengers_female INT NOT NULL DEFAULT 0,
  together BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open','partial','matched','expired','cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- Matches
CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
  offer_id INT NOT NULL REFERENCES ride_offers(id),
  request_id INT NOT NULL REFERENCES ride_requests(id),
  allocated_couples INT NOT NULL DEFAULT 0,
  allocated_male INT NOT NULL DEFAULT 0,
  allocated_female INT NOT NULL DEFAULT 0,
  allocated_unisex INT NOT NULL DEFAULT 0,
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','notified','connected','confirmed','declined','expired')),
  notified_via VARCHAR(10) DEFAULT 'ringback',
  hold_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requests_status_time ON ride_requests(status, earliest_time, latest_time);
CREATE INDEX IF NOT EXISTS idx_offers_status_time ON ride_offers(status, departure_time);
CREATE INDEX IF NOT EXISTS idx_matches_request ON matches(request_id);