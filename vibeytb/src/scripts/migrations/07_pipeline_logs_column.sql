-- Migration: Add logs JSONB column to pipeline_phase_logs
-- Strategy: Reuse existing table instead of creating new one (free tier optimization)
-- Each phase row stores its log entries as a JSONB array, ~3-6 entries per phase

-- Add logs column (array of {ts, level, msg, meta?})
ALTER TABLE pipeline_phase_logs
  ADD COLUMN IF NOT EXISTS logs JSONB DEFAULT '[]'::jsonb;

-- Add metadata column for phase-level context (tool_name, url, etc.)
ALTER TABLE pipeline_phase_logs
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Example logs format:
-- [
--   {"ts": "2026-04-06T02:01:05Z", "level": "info", "msg": "🔍 Discovering tools via Gemini Search..."},
--   {"ts": "2026-04-06T02:01:08Z", "level": "info", "msg": "📊 Found 7 tools, filtering..."},
--   {"ts": "2026-04-06T02:01:10Z", "level": "info", "msg": "✅ Selected: Krea AI (score: 85)"},
--   {"ts": "2026-04-06T02:01:12Z", "level": "info", "msg": "🌐 URL verified: https://krea.ai"}
-- ]
