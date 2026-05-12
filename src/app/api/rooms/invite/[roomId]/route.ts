import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ roomId: string }>;
};

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { roomId } = await params;

  const [roomRes, participantsCountRes] = await Promise.all([
    supabaseAdmin
    .from("study_rooms")
    .select(`
      id, title, mission, online_count, max_members, duration, ai_mode, files,
      conversation_id, timer_started_at, timer_ends_at, timer_status,
      alert_5m_sent, alert_2m_sent, alert_end_sent, created_at, updated_at
    `)
    .eq("id", roomId)
    .eq("is_active", true)
    .neq("timer_status", "finished")
      .maybeSingle(),
    supabaseAdmin
      .from("study_room_participants")
      .select("user_id", { count: "exact", head: true })
      .eq("room_id", roomId),
  ]);

  if (roomRes.error) {
    return NextResponse.json({ error: roomRes.error.message }, { status: 500 });
  }

  if (participantsCountRes.error) {
    return NextResponse.json({ error: participantsCountRes.error.message }, { status: 500 });
  }

  if (!roomRes.data) {
    return NextResponse.json({ error: "Room invitation is invalid or expired." }, { status: 404 });
  }

  const currentMembers = participantsCountRes.count ?? 0;
  if (currentMembers >= (roomRes.data.max_members ?? 8)) {
    return NextResponse.json({ error: "This room is already full." }, { status: 409 });
  }

  return NextResponse.json({
    data: {
      ...roomRes.data,
      online_count: Math.max(roomRes.data.online_count ?? 0, currentMembers),
    },
  });
}
