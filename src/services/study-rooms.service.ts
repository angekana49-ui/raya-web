import { supabase } from '@/lib/supabase/client';
import type { StudyRoomPreview } from '@/types';

function isValidUuid(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}
import type { StudyRoomReport } from '@/lib/room-report';

type RoomJoinErrorCode = 'ROOM_FULL' | 'ROOM_CLOSED' | 'ROOM_JOIN_FAILED';

export class RoomJoinError extends Error {
  code: RoomJoinErrorCode;

  constructor(code: RoomJoinErrorCode, message: string) {
    super(message);
    this.name = 'RoomJoinError';
    this.code = code;
  }
}

type StudyRoomRow = {
  id: string;
  title: string;
  mission: string;
  online_count: number;
  max_members: number;
  duration: number;
  ai_mode: 'passive' | 'active';
  files: any[] | null;
  conversation_id: string | null;
  timer_started_at: string | null;
  timer_ends_at: string | null;
  timer_status: 'idle' | 'running' | 'finished';
  alert_5m_sent: boolean;
  alert_2m_sent: boolean;
  alert_end_sent: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  has_report?: boolean;
  report_created_at?: string | null;
};

export function mapStudyRoomRow(row: StudyRoomRow): StudyRoomPreview {
  return {
    id: row.id,
    title: row.title,
    mission: row.mission,
    onlineCount: row.online_count,
    maxMembers: row.max_members,
    vibe: 'Active room',
    duration: row.duration,
    aiMode: row.ai_mode,
    files: row.files || [],
    conversationId: row.conversation_id ?? undefined,
    timerStartedAt: row.timer_started_at,
    timerEndsAt: row.timer_ends_at,
    timerStatus: row.timer_status,
    alert5mSent: row.alert_5m_sent,
    alert2mSent: row.alert_2m_sent,
    alertEndSent: row.alert_end_sent,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    hasReport: row.has_report ?? false,
    reportCreatedAt: row.report_created_at ?? null,
  };
}

// Resolve auth.uid() → public.users.id via RPC
async function getDbUserId(): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_db_user_id');
  if (error || !data) {
    console.error('Could not resolve DB user ID:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
    return null;
  }
  return data as string;
}

export async function getActiveRooms(): Promise<StudyRoomPreview[]> {
  const { data, error } = await supabase
    .from('study_rooms')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching active rooms:', error.message || error.code || error);
    return [];
  }

  return ((data || []) as StudyRoomRow[]).map(mapStudyRoomRow);
}

export async function getRoomHistory(): Promise<StudyRoomPreview[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = {};

    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const response = await fetch('/api/rooms/history', { headers });
    if (!response.ok) {
      throw new Error(`Room history request failed with ${response.status}`);
    }

    const payload = await response.json();
    return Array.isArray(payload?.data)
      ? payload.data.map((row: StudyRoomRow) => mapStudyRoomRow(row))
      : [];
  } catch (error) {
    console.error('Error fetching room history:', error);
    return [];
  }
}

export async function getStudyRoom(id: string): Promise<StudyRoomPreview | null> {
  const { data, error } = await supabase
    .from('study_rooms')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching study room:', error.message || error.code || error);
    }
    return null;
  }

  return mapStudyRoomRow(data as StudyRoomRow);
}

export async function createStudyRoom(payload: {
  title: string;
  mission: string;
  duration: number;
  aiMode: 'passive' | 'active';
  files: any[];
}) {
  const dbUserId = await getDbUserId();
  if (!dbUserId) throw new Error('You must be signed in to create a room.');

  // 1. Create a dedicated conversation for this room
  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .insert({
      user_id: dbUserId,
      title: `Room: ${payload.title}`,
      preview: '',
      is_active: true,
      context_type: 'study_room'
    })
    .select()
    .single();

  if (convError) {
    console.error('Failed to create room conversation:', {
      message: convError.message,
      code: convError.code,
      details: convError.details,
      hint: convError.hint,
      dbUserId,
      title: payload.title,
      contextType: 'study_room',
    });
    throw convError;
  }

  // 2. Create the room linked to the conversation, with timer started
  const now = new Date();
  const endsAt = new Date(now.getTime() + payload.duration * 60 * 1000);

  const { data, error } = await supabase
    .from('study_rooms')
    .insert({
      created_by: dbUserId,
      title: payload.title,
      mission: payload.mission,
      duration: payload.duration,
      ai_mode: payload.aiMode,
      files: payload.files,
      online_count: 1,
      is_active: true,
      conversation_id: conv.id,
      timer_status: 'running',
      timer_started_at: now.toISOString(),
      timer_ends_at: endsAt.toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create study room row:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      dbUserId,
      conversationId: conv.id,
      title: payload.title,
      duration: payload.duration,
      aiMode: payload.aiMode,
      filesCount: payload.files.length,
    });
    await supabase.from('conversations').delete().eq('id', conv.id);
    throw error;
  }
  return data;
}

export async function getRoomMessages(conversationId: string) {
  const { data, error } = await supabase.rpc('get_room_messages', {
    p_conversation_id: conversationId,
    p_limit: 200,
  });

  if (error) {
    console.error('Error loading room messages:', error.message || error.code || error);
    return [];
  }

  return [...(data || [])].reverse();
}

export async function closeRoom(roomId: string) {
  const { error } = await supabase
    .from('study_rooms')
    .update({ is_active: false })
    .eq('id', roomId);

  if (error) throw error;
}

export async function advanceStudyRoomTimer(
  roomId: string,
  alertKind: '5m' | '2m' | 'end',
): Promise<boolean> {
  const { data, error } = await supabase.rpc('advance_study_room_timer', {
    p_room_id: roomId,
    p_alert_kind: alertKind,
  });

  if (error) {
    console.error('Failed to advance study room timer:', error.message || error.code || error);
    return false;
  }

  return Boolean(data);
}

export async function joinRoom(roomId: string) {
  const dbUserId = await getDbUserId();
  if (!dbUserId) return null;

  // Upsert participation to trigger limits initialization
  const { data, error } = await supabase
    .from('study_room_participants')
    .upsert({ room_id: roomId, user_id: dbUserId }, { onConflict: 'room_id, user_id' })
    .select()
    .single();

  if (error) {
    console.error('Error joining room/tracking participant:', error.message || error.code || error);
    const normalizedMessage = String(error.message || '').toLowerCase();
    if (normalizedMessage.includes('room is full')) {
      throw new RoomJoinError('ROOM_FULL', 'This room already has 8 members. Try another live room or create your own.');
    }
    if (normalizedMessage.includes('room is not active') || normalizedMessage.includes('does not exist')) {
      throw new RoomJoinError('ROOM_CLOSED', 'This room is no longer active.');
    }
    throw new RoomJoinError('ROOM_JOIN_FAILED', 'Could not join this room right now.');
  }
  return data;
}

export async function getRoomParticipant(roomId: string) {
  const dbUserId = await getDbUserId();
  if (!dbUserId) return null;

  const { data, error } = await supabase
    .from('study_room_participants')
    .select('*')
    .eq('room_id', roomId)
    .eq('user_id', dbUserId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching participant data:', error.message || error.code || error);
    return null;
  }
  return data;
}

export async function decrementRoomLimit(roomId: string, limitType: 'mode' | 'model'): Promise<boolean> {
  const { data, error } = await supabase.rpc('decrement_room_limit', {
    p_room_id: roomId,
    p_limit_type: limitType
  });

  if (error) {
    console.error('Failed to decrement room limit:', error.message || error.code || error);
    return false;
  }
  return Boolean(data);
}

export async function getRoomReport(roomId: string): Promise<StudyRoomReport | null> {
  if (!isValidUuid(roomId)) return null;
  const { data, error } = await supabase
    .from('study_room_reports')
    .select('*')
    .eq('room_id', roomId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching room report:', error.message || error.code || error);
    return null;
  }
  return data as StudyRoomReport;
}

export async function uploadRoomFiles(roomId: string, files: File[]) {
  const dbUserId = await getDbUserId();
  if (!dbUserId) throw new Error('You must be signed in to upload files.');

  const uploads = files.map(async (file) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `${roomId}/${fileName}`;

    // 1. Upload to Storage
    const { error: uploadError } = await supabase.storage
      .from('room-files')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    // 2. Get Public URL
    const { data: { publicUrl } } = supabase.storage
      .from('room-files')
      .getPublicUrl(filePath);

    // 3. Save to room_files table
    const { data, error: dbError } = await supabase
      .from('room_files')
      .insert({
        room_id: roomId,
        file_name: file.name,
        file_path: filePath,
        file_url: publicUrl,
        file_type: file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'document',
        mime_type: file.type,
        file_size: file.size,
        uploader_id: dbUserId
      })
      .select()
      .single();

    if (dbError) throw dbError;
    return data;
  });

  return Promise.all(uploads);
}

export async function getRoomFiles(roomId: string) {
  if (!isValidUuid(roomId)) return [];

  const { data, error } = await supabase
    .from('room_files')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching room files:', error.message || error.code || error);
    return [];
  }

  return data.map(row => ({
    id: row.id,
    name: row.file_name,
    type: row.file_type as any,
    url: row.file_url,
    mimeType: row.mime_type,
    size: row.file_size
  }));
}
