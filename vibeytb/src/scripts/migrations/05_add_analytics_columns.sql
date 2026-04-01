-- Migration: Add 24h analytics columns to video_projects
-- These are populated by analytics-tracker.ts ~24h after publishing.

ALTER TABLE video_projects
  ADD COLUMN IF NOT EXISTS views_24h INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS likes_24h INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS comments_24h INTEGER DEFAULT NULL;

-- Index for analytics query: find published videos in time window
CREATE INDEX IF NOT EXISTS idx_video_projects_analytics
  ON video_projects (status, updated_at)
  WHERE status = 'published' AND youtube_url IS NOT NULL;
