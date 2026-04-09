-- Migration 09: Add thumbnail_style column for A/B thumbnail testing
-- Tracks which thumbnail style (editorial, minimalist, bold_gradient) was used
-- Enables measuring CTR impact of different thumbnail designs.

ALTER TABLE video_projects
ADD COLUMN IF NOT EXISTS thumbnail_style TEXT DEFAULT NULL;

COMMENT ON COLUMN video_projects.thumbnail_style IS 'A/B test: editorial | minimalist | bold_gradient';
