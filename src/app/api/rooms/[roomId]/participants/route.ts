import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveUserId } from "@/lib/auth";

type Params = {
  params: Promise<{ roomId: string }>;
};

export async function GET(req: NextRequest, { params }: Params) {
  const userId = await resolveUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roomId } = await params;

  const [roomRes, participantAccessRes] = await Promise.all([
    supabaseAdmin
      .from("study_rooms")
      .select("id, created_by")
      .eq("id", roomId)
      .single(),
    supabaseAdmin
      .from("study_room_participants")
      .select("user_id")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (roomRes.error || !roomRes.data) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const hasAccess = roomRes.data.created_by === userId || !!participantAccessRes.data;
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const participantsRes = await supabaseAdmin
    .from("study_room_participants")
    .select(`
      user_id,
      is_creator,
      joined_at,
      users:user_id (
        id,
        display_name,
        username
      )
    `)
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });

  if (participantsRes.error) {
    return NextResponse.json({ error: participantsRes.error.message }, { status: 500 });
  }

  const data = (participantsRes.data || []).map((row: any) => ({
    id: row.user_id as string,
    isCreator: Boolean(row.is_creator),
    joinedAt: row.joined_at as string | null,
    displayName: row.users?.display_name ?? null,
    username: row.users?.username ?? null,
  }));

  return NextResponse.json({ data });
}
