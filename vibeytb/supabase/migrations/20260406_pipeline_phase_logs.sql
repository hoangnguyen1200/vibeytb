-- Pipeline Phase Logs — tracks per-phase progress for live dashboard monitoring
CREATE TABLE IF NOT EXISTS pipeline_phase_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id TEXT NOT NULL,
  phase INTEGER NOT NULL CHECK (phase BETWEEN 1 AND 4),
  phase_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  log_lines JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by run_id (dashboard polling)
CREATE INDEX IF NOT EXISTS idx_phase_logs_run_id ON pipeline_phase_logs(run_id);

-- Add phase_logs column to pipeline_runs for quick summary
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS phases_summary JSONB DEFAULT '[]'::jsonb;
