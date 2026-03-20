-- Migration: Database Sanitization for Global Expansion
-- Mục tiêu: Cô lập dữ liệu tiếng Việt cũ thành legacy_vi, bổ sung ranh giới cứng target_language.

-- 1. Bổ sung `target_language` cho bảng trends (để đảm bảo Phase 1 cũng lưu ngôn ngữ)
ALTER TABLE trends 
ADD COLUMN IF NOT EXISTS target_language VARCHAR(20) DEFAULT 'en-US';

-- Thêm index cho target_language của trends
CREATE INDEX IF NOT EXISTS idx_trends_language ON trends(target_language);

-- 2. Đánh dấu dữ liệu tiếng Việt cũ trong video_projects
-- Các dự án có chứa ký tự tiếng Việt có dấu trong title hoặc description sẽ bị gắn nhãn legacy_vi
UPDATE video_projects 
SET status = 'legacy_vi' 
WHERE 
  title ~* '[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]'
  OR youtube_description ~* '[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]';

-- Đảm bảo các job bị null target_language được chuyển về en-US hoặc legacy
UPDATE video_projects
SET target_language = 'vi-VN'
WHERE status = 'legacy_vi' AND target_language IS NULL;

-- Với các dòng còn lại, nếu thiếu target_language thì mặc định là en-US
UPDATE video_projects
SET target_language = 'en-US'
WHERE target_language IS NULL;

-- 3. Đánh dấu tiếng Việt trên bảng video_scripts (Phase 2 output)
-- Dựa vào chuỗi JSON của scenes
UPDATE video_scripts
SET raw_response = jsonb_set(raw_response, '{status}', '"legacy_vi"')
WHERE scenes::text ~* '[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]';
