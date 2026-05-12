import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveUserId } from "@/lib/auth";

type ActiveRoomRow = {
  id: string;
  online_count: number | null;
  max_members: number | null;
  [key: string]: unknown;
};

async function withParticipantCounts(rows: ActiveRoomRow[]) {
  if (rows.length === 0) return rows;

  const roomIds = rows.map((row) => row.id);
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

  return rows.map((row) => ({
    ...row,
    online_count: Math.min(
      Math.max(row.online_count ?? 0, counts.get(row.id) ?? 0),
      row.max_members ?? 8,
    ),
  }));
}

export async function GET(req: NextRequest) {
  try {
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

    let query = supabaseAdmin
      .from("study_rooms")
      .select(`
        id, title, mission, online_count, max_members, duration, ai_mode, files,
        conversation_id, timer_started_at, timer_ends_at, timer_status,
        alert_5m_sent, alert_2m_sent, alert_end_sent, created_at, updated_at
      `)
      .eq("is_active", true);

    if (participantRoomIds.length > 0) {
      query = query.or(`created_by.eq.${userId},id.in.(${participantRoomIds.join(",")})`);
    } else {
      query = query.eq("created_by", userId);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: await withParticipantCounts((data ?? []) as ActiveRoomRow[]) });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load active rooms" },
      { status: 500 },
    );
  }
}
