-- Migration 04: Align Schema with Actual Code Usage
-- Date: 2026-03-30
-- Safe: All operations use IF NOT EXISTS — idempotent, won't break existing data

-- ═══════════════════════════════════════════════════════════════
-- 1. Missing columns that code writes but schema doesn't have
-- ═══════════════════════════════════════════════════════════════

-- tiktok_url: Phase 4 writes this after TikTok cross-post
ALTER TABLE video_projects 
ADD COLUMN IF NOT EXISTS tiktok_url TEXT;

-- ═══════════════════════════════════════════════════════════════
-- 2. Tool tracking columns (optimize Content Memory)
-- Currently getRecentlyUsedTools() parses script_json JSONB
-- to extract tool names. These top-level columns enable 
-- direct SQL queries + analytics.
-- ═══════════════════════════════════════════════════════════════

-- tool_name: the AI tool featured in this video
ALTER TABLE video_projects 
ADD COLUMN IF NOT EXISTS tool_name VARCHAR(255);

-- tool_url: the product website URL used for recording
ALTER TABLE video_projects 
ADD COLUMN IF NOT EXISTS tool_url TEXT;

-- discovery_source: how the tool was found
-- Values: 'gemini-search' | 'google-cse' | 'fallback'
ALTER TABLE video_projects 
ADD COLUMN IF NOT EXISTS discovery_source VARCHAR(50);

-- ═══════════════════════════════════════════════════════════════
-- 3. Performance indexes
-- ═══════════════════════════════════════════════════════════════

-- Content Memory: getRecentlyUsedTools() queries last 7 days
CREATE INDEX IF NOT EXISTS idx_video_projects_created_at 
ON video_projects(created_at DESC);

-- Tool dedup: avoid repeating same tool within 7 days
CREATE INDEX IF NOT EXISTS idx_video_projects_tool_name 
ON video_projects(tool_name);

-- Status lookup: fetchNextJob() queries by status
CREATE INDEX IF NOT EXISTS idx_video_projects_status 
ON video_projects(status);
