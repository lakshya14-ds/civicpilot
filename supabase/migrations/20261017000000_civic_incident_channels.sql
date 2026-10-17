-- Private citizen evidence. Only the service role uploads/downloads; no public policy is added.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('civic-evidence', 'civic-evidence', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS conversation_drafts (
  sender TEXT PRIMARY KEY,
  first_message_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('description', 'location')),
  description TEXT,
  image_reference TEXT,
  location_text TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  language TEXT NOT NULL DEFAULT 'en',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX IF NOT EXISTS idx_conversation_drafts_expiry ON conversation_drafts (expires_at);
ALTER TABLE conversation_drafts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS channel_messages (
  message_id TEXT PRIMARY KEY,
  sender TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_channel_messages_created ON channel_messages (created_at);
ALTER TABLE channel_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE complaints ADD COLUMN IF NOT EXISTS government_provider TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS official_reference TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS government_status TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS government_synced_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_complaints_official_reference ON complaints (official_reference) WHERE official_reference IS NOT NULL;
