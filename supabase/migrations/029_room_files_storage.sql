-- ============================================================
-- RAYA - Migration 029: Room Files Storage
-- ============================================================

-- 1. Create Storage Bucket (if not exists)
-- Using minimal columns for maximum compatibility
INSERT INTO storage.buckets (id, name, public)
VALUES ('room-files', 'room-files', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage Policies for the 'room-files' bucket
-- These policies apply to storage.objects, which is standard
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects
    FOR SELECT USING (bucket_id = 'room-files');

DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
CREATE POLICY "Authenticated Upload" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'room-files' 
        AND auth.role() = 'authenticated'
    );

-- 3. Dedicated table for room files metadata
CREATE TABLE IF NOT EXISTS public.room_files (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id     UUID NOT NULL REFERENCES public.study_rooms(id) ON DELETE CASCADE,
    file_name   TEXT NOT NULL,
    file_path   TEXT NOT NULL, -- Path relative to bucket
    file_url    TEXT NOT NULL, -- Resolved public URL
    file_type   TEXT NOT NULL DEFAULT 'other', -- image, pdf, etc.
    mime_type   TEXT,
    file_size   INTEGER,
    uploader_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- 4. Indices
CREATE INDEX IF NOT EXISTS room_files_room_id_idx ON public.room_files (room_id);

-- 5. RLS for room_files
ALTER TABLE public.room_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active room files" ON public.room_files;
CREATE POLICY "Anyone can view active room files" ON public.room_files
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.study_rooms 
            WHERE study_rooms.id = room_files.room_id 
            AND study_rooms.is_active = true
        )
    );

DROP POLICY IF EXISTS "Users can upload files to rooms" ON public.room_files;
CREATE POLICY "Users can upload files to rooms" ON public.room_files
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 6. Trigger to update study_rooms.updated_at
CREATE OR REPLACE FUNCTION update_room_on_file_change()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.study_rooms 
    SET updated_at = now() 
    WHERE id = NEW.room_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_update_room_on_file_change ON public.room_files;
CREATE TRIGGER tr_update_room_on_file_change
AFTER INSERT ON public.room_files
FOR EACH ROW EXECUTE FUNCTION update_room_on_file_change();
