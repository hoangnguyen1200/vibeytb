-- Migration 05: Dashboard tables
-- Purpose: Support dashboard settings and publish queue
-- Non-destructive: only adds new tables, no changes to video_projects

-- Settings key-value store
CREATE TABLE IF NOT EXISTS dashboard_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Publish queue for approval workflows
CREATE TABLE IF NOT EXISTS publish_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID REFERENCES video_projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('youtube', 'tiktok', 'reels', 'facebook')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'published', 'cancelled')),
  metadata JSONB DEFAULT '{}',
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_publish_queue_video_id ON publish_queue(video_id);
CREATE INDEX IF NOT EXISTS idx_publish_queue_status ON publish_queue(status);
CREATE INDEX IF NOT EXISTS idx_publish_queue_platform ON publish_queue(platform);

-- Default settings
INSERT INTO dashboard_settings (key, value)
VALUES
  ('auto_publish', '{"youtube": true, "tiktok": false}'::jsonb),
  ('publish_schedule', '{"cron": "0 23 * * *", "timezone": "Asia/Ho_Chi_Minh"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
