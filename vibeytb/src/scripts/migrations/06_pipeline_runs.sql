-- Migration: Create pipeline_runs table for tracking pipeline execution history
-- This table stores each orchestrator run with status, timing, and error info

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT UNIQUE NOT NULL,            -- unique run identifier from orchestrator
  status TEXT NOT NULL DEFAULT 'running', -- running | completed | failed
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,                    -- total duration in milliseconds
  videos_processed INTEGER DEFAULT 0,
  videos_published INTEGER DEFAULT 0,
  videos_failed INTEGER DEFAULT 0,
  trigger_type TEXT DEFAULT 'scheduled',  -- scheduled | manual
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for listing recent runs
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started ON pipeline_runs (started_at DESC);

-- Enable RLS
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access on pipeline_runs"
  ON pipeline_runs
  FOR ALL
  USING (true)
  WITH CHECK (true);
