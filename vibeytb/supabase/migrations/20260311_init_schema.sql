-- Bật Extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Bảng lưu trữ Trends
CREATE TABLE trends (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword VARCHAR(255) NOT NULL UNIQUE,
  search_volume INTEGER,
  niche_category VARCHAR(100),
  source VARCHAR(50), 
  raw_data JSONB, 
  is_processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Bảng cốt lõi: Video Projects (State Machine)
CREATE TABLE video_projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trend_id UUID REFERENCES trends(id) ON DELETE SET NULL,
  title VARCHAR(255),
  youtube_description TEXT,
  youtube_tags TEXT[],
  status VARCHAR(50) DEFAULT 'draft', 
  final_video_url TEXT, 
  youtube_url VARCHAR(255), 
  error_logs JSONB DEFAULT '[]'::jsonb, 
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hàm tự cập nhật updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_projects
BEFORE UPDATE ON video_projects
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- 3. Bảng Video Scripts
CREATE TABLE video_scripts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES video_projects(id) ON DELETE CASCADE UNIQUE,
  system_prompt TEXT, 
  raw_response JSONB, 
  scenes JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Bảng Rendered Assets cho từng phân đoạn
CREATE TABLE rendered_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES video_projects(id) ON DELETE CASCADE,
  scene_index INTEGER,
  asset_type VARCHAR(20), 
  file_url TEXT NOT NULL,
  duration_sec NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
