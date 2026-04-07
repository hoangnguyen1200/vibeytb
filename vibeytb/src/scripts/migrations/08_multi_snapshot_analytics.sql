-- Migration: Add multi-snapshot analytics columns to video_projects
-- views_24h/likes_24h/comments_24h = first snapshot (historical reference, set once)
-- views_latest/likes_latest/comments_latest = updated EVERY analytics run (real-time)
-- analytics_updated_at = timestamp of last analytics update

ALTER TABLE video_projects
  ADD COLUMN IF NOT EXISTS views_latest INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS likes_latest INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS comments_latest INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS analytics_updated_at TIMESTAMPTZ DEFAULT NULL;

-- Index for analytics queries: fetch all published with URLs
CREATE INDEX IF NOT EXISTS idx_video_projects_analytics_latest
  ON video_projects (status, analytics_updated_at)
  WHERE status = 'published' AND youtube_url IS NOT NULL;
