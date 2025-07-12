CREATE TABLE IF NOT EXISTS orbits (
  id SERIAL PRIMARY KEY,
  uri VARCHAR(255) UNIQUE NOT NULL,
  cid VARCHAR(255) NOT NULL,
  did VARCHAR(255) NOT NULL,
  rkey VARCHAR(255) NOT NULL,
  name VARCHAR(64) NOT NULL,
  description VARCHAR(256),
  video_feed_uri VARCHAR(255),
  photo_feed_uri VARCHAR(255),
  text_feed_uri VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  INDEX idx_did (did),
  INDEX idx_uri (uri),
  UNIQUE KEY unique_orbit (did, rkey)
);