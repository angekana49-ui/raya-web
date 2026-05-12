import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ roomId: string }>;
};

type RoomMode = "passive" | "active";

function isRoomMode(value: unknown): value is RoomMode {
  return value === "passive" || value === "active";
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const userId = await resolveUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roomId } = await params;
  const body = await req.json().catch(() => ({}));
  const aiMode = body?.aiMode;

  if (!isRoomMode(aiMode)) {
    return NextResponse.json({ error: "Invalid room AI mode" }, { status: 400 });
  }

  const [roomRes, participantRes] = await Promise.all([
    supabaseAdmin
      .from("study_rooms")
      .select("id, created_by, ai_mode, is_active")
      .eq("id", roomId)
      .maybeSingle(),
    supabaseAdmin
      .from("study_room_participants")
      .select("user_id, mode_changes_left")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (roomRes.error || !roomRes.data) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const isCreator = roomRes.data.created_by === userId;
  let participant = participantRes.data;
  if (!isCreator && !participant) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (isCreator && !participant) {
    const { data: insertedParticipant, error: insertError } = await supabaseAdmin
      .from("study_room_participants")
      .insert({
        room_id: roomId,
        user_id: userId,
      })
      .select("user_id, mode_changes_left")
      .single();

    if (insertError || !insertedParticipant) {
      return NextResponse.json({ error: "Could not initialize room permissions" }, { status: 500 });
    }

    participant = insertedParticipant;
  }

  if (roomRes.data.is_active === false) {
    return NextResponse.json({ error: "Room is closed" }, { status: 409 });
  }

  if (roomRes.data.ai_mode === aiMode) {
    return NextResponse.json({
      data: {
        aiMode,
        changesRemaining: participant?.mode_changes_left ?? (isCreator ? 5 : 1),
      },
    });
  }

  const currentRemaining = Number(participant?.mode_changes_left ?? 0);
  if (currentRemaining <= 0) {
    return NextResponse.json({ error: "No AI mode changes left for this session" }, { status: 409 });
  }

  const { data: decremented, error: decrementError } = await supabaseAdmin
    .from("study_room_participants")
    .update({ mode_changes_left: currentRemaining - 1 })
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .eq("mode_changes_left", currentRemaining)
    .select("mode_changes_left")
    .maybeSingle();

  if (decrementError || !decremented) {
    return NextResponse.json({ error: "Could not reserve a mode change" }, { status: 409 });
  }

  const { data: updatedRoom, error: updateError } = await supabaseAdmin
    .from("study_rooms")
    .update({
      ai_mode: aiMode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", roomId)
    .select("ai_mode")
    .single();

  if (updateError || !updatedRoom) {
    return NextResponse.json({ error: updateError?.message || "Could not update room mode" }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      aiMode: updatedRoom.ai_mode as RoomMode,
      changesRemaining: decremented.mode_changes_left as number,
    },
  });
}
