-- Migration 08: A/B Title Style Tracking
-- Adds title_style column to track which style generates best views

ALTER TABLE video_projects 
  ADD COLUMN IF NOT EXISTS title_style TEXT DEFAULT NULL;

COMMENT ON COLUMN video_projects.title_style IS 'A/B title style: question, bold_claim, listicle, urgency';
