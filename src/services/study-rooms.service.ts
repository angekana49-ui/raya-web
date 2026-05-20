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
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = {};

    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const response = await fetch('/api/rooms/active', { headers });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(errorText || `Active rooms request failed with ${response.status}`);
    }

    const payload = await response.json();
    return Array.isArray(payload?.data)
      ? payload.data.map((row: StudyRoomRow) => mapStudyRoomRow(row))
      : [];
  } catch (error: any) {
    console.error('Error fetching active rooms:', error?.message || error?.code || error);
    return [];
  }
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

export async function getRoomInvitePreview(id: string): Promise<StudyRoomPreview | null> {
  if (!isValidUuid(id)) return null;

  try {
    const response = await fetch(`/api/rooms/invite/${encodeURIComponent(id)}`);
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return payload?.data ? mapStudyRoomRow(payload.data as StudyRoomRow) : null;
  } catch (error) {
    console.error('Error fetching room invite preview:', error);
    return null;
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

  // Use the RPC function to create the study room
  const { data, error } = await supabase.rpc('create_study_room', {
    p_title: payload.title,
    p_mission: payload.mission,
    p_duration: payload.duration,
    p_ai_mode: payload.aiMode,
    p_max_members: 8, // default
  });

  if (error) {
    try {
      console.error('Failed to create study room row:', {
        error: typeof error === 'object' ? JSON.parse(JSON.stringify(error)) : String(error),
        message: (error as any)?.message ?? null,
        code: (error as any)?.code ?? null,
        details: (error as any)?.details ?? null,
        hint: (error as any)?.hint ?? null,
        dbUserId,
        title: payload.title,
        duration: payload.duration,
        aiMode: payload.aiMode,
      });
    } catch (logErr) {
      console.error('Failed to stringify RPC error:', logErr, 'original:', error);
    }

    const errMsg = (error as any)?.message || JSON.stringify(error) || 'Unknown RPC error';
    throw new Error(errMsg);
  }
  return data;
}

export async function getRoomMessages(conversationId: string) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const response = await fetch('/api/rooms/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(errorText || `Room messages request failed with ${response.status}`);
    }

    const payload = await response.json();
    return [...(payload?.data || [])].reverse();
  } catch (error: any) {
    console.error('Error loading room messages:', error?.message || error?.code || error);
    return [];
  }
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
  const { data, error } = await supabase.rpc('join_study_room', {
    p_room_id: roomId,
  });

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

export async function syncRoomOnlineCount(roomId: string, onlineCount: number): Promise<number | null> {
  const { data, error } = await supabase.rpc('sync_room_online_count', {
    p_room_id: roomId,
    p_online_count: onlineCount,
  });

  if (error) {
    console.error('Failed to sync room online count:', error.message || error.code || error);
    return null;
  }

  return typeof data === 'number' ? data : null;
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
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('You must be signed in to upload files.');

  const formData = new FormData();
  files.slice(0, 3).forEach((file) => formData.append('files', file));

  const response = await fetch(`/api/rooms/${roomId}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `Room file upload failed with ${response.status}`);
  }

  const payload = await response.json();
  return Array.isArray(payload?.data) ? payload.data : [];
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

  const files = await Promise.all(data.map(async (row) => {
    const { data: signed } = await supabase.storage
      .from('room-files')
      .createSignedUrl(row.file_path, 60 * 30);

    return {
      id: row.id,
      name: row.file_name,
      type: row.file_type as any,
      url: signed?.signedUrl ?? '',
      mimeType: row.mime_type,
      size: row.file_size
    };
  }));

  return files.filter((file) => file.url);
}
