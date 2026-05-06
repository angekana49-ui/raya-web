-- Migration 040: Persistent file storage bucket for solo chat & study rooms
-- Solves the "AI amnesia" bug where files vanish after the request completes
-- because they were only held as base64 in memory / Vercel payload.

-- Create the room_assets public bucket for persistent file storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'room_assets',
  'room_assets',
  true,
  15728640, -- 15 MB
  ARRAY[
    'image/png','image/jpeg','image/gif','image/webp','image/svg+xml',
    'application/pdf',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','text/csv'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Allow anyone to read (public bucket)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Public Read room_assets' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Public Read room_assets"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'room_assets');
  END IF;
END $$;

-- Allow authenticated users to upload
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Auth Upload room_assets' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Auth Upload room_assets"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'room_assets');
  END IF;
END $$;

-- Allow authenticated users to delete their own uploads (owner = auth.uid())
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Owner Delete room_assets' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Owner Delete room_assets"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'room_assets' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;
