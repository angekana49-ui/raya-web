import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveUserId } from "@/lib/auth";
import { buildRoomReportHtml, type StudyRoomReport } from "@/lib/room-report";

type Params = {
  params: Promise<{ roomId: string }>;
};

export async function GET(req: NextRequest, { params }: Params) {
  const userId = await resolveUserId(req);
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { roomId } = await params;

  const [roomRes, participantRes, reportRes] = await Promise.all([
    supabaseAdmin
      .from("study_rooms")
      .select("id, title, mission, created_by")
      .eq("id", roomId)
      .single(),
    supabaseAdmin
      .from("study_room_participants")
      .select("user_id")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("study_room_reports")
      .select("*")
      .eq("room_id", roomId)
      .maybeSingle(),
  ]);

  if (roomRes.error || !roomRes.data) {
    return new Response("Room not found", { status: 404 });
  }

  if (roomRes.data.created_by !== userId && !participantRes.data) {
    return new Response("Forbidden", { status: 403 });
  }

  if (reportRes.error || !reportRes.data) {
    return new Response("Report not found", { status: 404 });
  }

  const html = buildRoomReportHtml({
    roomName: roomRes.data.title,
    mission: roomRes.data.mission,
    report: reportRes.data as StudyRoomReport,
    autoPrint: req.nextUrl.searchParams.get("print") === "1",
  });

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename=\"room-report-${roomId}.html\"`,
      "Cache-Control": "no-store",
    },
  });
}
