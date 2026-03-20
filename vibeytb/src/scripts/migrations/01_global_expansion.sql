-- Migration: Global Expansion
-- Thêm các cột cấu hình phục vụ đa quốc gia (Multi-region) cho hệ thống Auto-Pilot

ALTER TABLE video_projects 
ADD COLUMN IF NOT EXISTS target_region VARCHAR(10) DEFAULT 'US',
ADD COLUMN IF NOT EXISTS target_language VARCHAR(20) DEFAULT 'en-US',
ADD COLUMN IF NOT EXISTS tone_of_voice TEXT DEFAULT 'casual and engaging American English';

-- Thêm các Index mỏng cho query nhanh, đề phòng trường hợp tương lai có nhiều quốc gia
CREATE INDEX IF NOT EXISTS idx_video_projects_region ON video_projects(target_region);
