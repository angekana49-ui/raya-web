import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveUserId } from "@/lib/auth";

type HistoryRoomRow = {
  id: string;
  title: string;
  mission: string;
  online_count: number | null;
  max_members: number | null;
  duration: number | null;
  ai_mode: "passive" | "active" | null;
  files: unknown[] | null;
  conversation_id: string | null;
  timer_started_at: string | null;
  timer_ends_at: string | null;
  timer_status: "idle" | "running" | "finished" | null;
  alert_5m_sent: boolean | null;
  alert_2m_sent: boolean | null;
  alert_end_sent: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  study_room_reports?: Array<{ created_at: string | null }> | null;
};

function mapHistoryRoom(row: HistoryRoomRow) {
  const latestReport = Array.isArray(row.study_room_reports) ? row.study_room_reports[0] : null;

  return {
    id: row.id,
    title: row.title,
    mission: row.mission,
    online_count: row.online_count ?? 0,
    max_members: row.max_members ?? 8,
    duration: row.duration ?? 60,
    ai_mode: row.ai_mode === "passive" ? "passive" : "active",
    files: Array.isArray(row.files) ? row.files : [],
    conversation_id: row.conversation_id,
    timer_started_at: row.timer_started_at,
    timer_ends_at: row.timer_ends_at,
    timer_status: row.timer_status === "finished" ? "finished" : row.timer_status === "idle" ? "idle" : "running",
    alert_5m_sent: row.alert_5m_sent ?? false,
    alert_2m_sent: row.alert_2m_sent ?? false,
    alert_end_sent: row.alert_end_sent ?? false,
    created_at: row.created_at,
    updated_at: row.updated_at,
    has_report: Boolean(latestReport),
    report_created_at: latestReport?.created_at ?? null,
  };
}

async function getParticipantCountByRoom(roomIds: string[]) {
  if (roomIds.length === 0) return new Map<string, number>();

  const { data, error } = await supabaseAdmin
    .from("study_room_participants")
    .select("room_id")
    .in("room_id", roomIds);

  if (error) {
    throw error;
  }

  const counts = new Map<string, number>();
  for (const row of data || []) {
    counts.set(row.room_id, (counts.get(row.room_id) ?? 0) + 1);
  }

  return counts;
}

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) {
    return NextResponse.json({ data: [] });
  }

  const participantRowsRes = await supabaseAdmin
    .from("study_room_participants")
    .select("room_id")
    .eq("user_id", userId);

  if (participantRowsRes.error) {
    return NextResponse.json({ error: participantRowsRes.error.message }, { status: 500 });
  }

  const participantRoomIds = (participantRowsRes.data || []).map((row) => row.room_id);

  const createdRoomsRes = await supabaseAdmin
    .from("study_rooms")
    .select(`
      id, title, mission, online_count, max_members, duration, ai_mode, files,
      conversation_id, timer_started_at, timer_ends_at, timer_status,
      alert_5m_sent, alert_2m_sent, alert_end_sent, created_at, updated_at,
      study_room_reports (
        created_at
      )
    `)
    .eq("created_by", userId)
    .order("updated_at", { ascending: false });

  if (createdRoomsRes.error) {
    return NextResponse.json({ error: createdRoomsRes.error.message }, { status: 500 });
  }

  const participantRoomsRes = participantRoomIds.length > 0
    ? await supabaseAdmin
        .from("study_rooms")
        .select(`
          id, title, mission, online_count, max_members, duration, ai_mode, files,
          conversation_id, timer_started_at, timer_ends_at, timer_status,
          alert_5m_sent, alert_2m_sent, alert_end_sent, created_at, updated_at,
          study_room_reports (
            created_at
          )
        `)
        .in("id", participantRoomIds)
        .order("updated_at", { ascending: false })
    : { data: [], error: null };

  if (participantRoomsRes.error) {
    return NextResponse.json({ error: participantRoomsRes.error.message }, { status: 500 });
  }

  const merged = new Map<string, ReturnType<typeof mapHistoryRoom>>();
  for (const row of [...(createdRoomsRes.data || []), ...(participantRoomsRes.data || [])] as HistoryRoomRow[]) {
    merged.set(row.id, mapHistoryRoom(row));
  }

  const memberCounts = await getParticipantCountByRoom([...merged.keys()]);
  for (const [roomId, room] of merged) {
    room.online_count = Math.min(
      Math.max(room.online_count ?? 0, memberCounts.get(roomId) ?? 0),
      room.max_members ?? 8,
    );
  }

  const data = [...merged.values()].sort((left, right) => {
    const leftUpdated = new Date(left.updated_at ?? left.created_at ?? 0).getTime();
    const rightUpdated = new Date(right.updated_at ?? right.created_at ?? 0).getTime();
    return rightUpdated - leftUpdated;
  });

  return NextResponse.json({ data });
}
