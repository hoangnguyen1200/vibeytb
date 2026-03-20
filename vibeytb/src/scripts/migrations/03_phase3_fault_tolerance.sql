-- Migration: Phase 3 Fault Tolerance Tracking
-- Thêm cột status vào bảng rendered_assets để track tiến trình render của từng cảnh

ALTER TABLE rendered_assets 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'processing';

-- Các status hợp lệ: 'processing', 'done', 'failed'

-- Index trên project_id và scene_index để truy vấn lấy trạng thái scene nhanh hơn
CREATE INDEX IF NOT EXISTS idx_rendered_assets_scene ON rendered_assets(project_id, scene_index, asset_type);
