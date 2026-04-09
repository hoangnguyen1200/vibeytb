-- Affiliate Links table for VibeYtb
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS affiliate_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tool_name TEXT NOT NULL UNIQUE,
  affiliate_url TEXT NOT NULL,
  direct_url TEXT DEFAULT '',
  commission TEXT DEFAULT '',
  signup_url TEXT DEFAULT '',
  active BOOLEAN DEFAULT true,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for quick lookup by tool name
CREATE INDEX IF NOT EXISTS idx_affiliate_tool_name ON affiliate_links (lower(tool_name));

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_affiliate_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_affiliate_updated_at
  BEFORE UPDATE ON affiliate_links
  FOR EACH ROW
  EXECUTE FUNCTION update_affiliate_updated_at();

-- Enable RLS (Row Level Security)
ALTER TABLE affiliate_links ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can read/write
CREATE POLICY "Authenticated users can read affiliate_links"
  ON affiliate_links FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert affiliate_links"
  ON affiliate_links FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update affiliate_links"
  ON affiliate_links FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete affiliate_links"
  ON affiliate_links FOR DELETE
  TO authenticated
  USING (true);

-- Seed with existing ElevenLabs affiliate
INSERT INTO affiliate_links (tool_name, affiliate_url, direct_url, commission, signup_url, active)
VALUES ('ElevenLabs', 'https://try.elevenlabs.io/usuat31azvbv', 'https://elevenlabs.io', '22% recurring (12 months)', 'https://elevenlabs.io/affiliates', true)
ON CONFLICT (tool_name) DO NOTHING;
