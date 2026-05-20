import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ roomId: string }>;
};

function getFileType(file: File): "image" | "pdf" | "document" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";
  return "document";
}

function getSafeExtension(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext ? `.${ext.slice(0, 12)}` : "";
}

export async function POST(req: NextRequest, { params }: Params) {
  const userId = await resolveUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roomId } = await params;
  const [roomRes, participantRes] = await Promise.all([
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

  if (roomRes.data.created_by !== userId && !participantRes.data) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const uploaded = [];
  for (const file of files.slice(0, 3)) {
    const filePath = `${roomId}/${crypto.randomUUID()}${getSafeExtension(file.name)}`;
    const bytes = await file.arrayBuffer();

    const { error: uploadError } = await supabaseAdmin.storage
      .from("room-files")
      .upload(filePath, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data, error: dbError } = await supabaseAdmin
      .from("room_files")
      .insert({
        room_id: roomId,
        file_name: file.name,
        file_path: filePath,
        file_url: filePath,
        file_type: getFileType(file),
        mime_type: file.type || null,
        file_size: file.size,
        uploader_id: userId,
      })
      .select()
      .single();

    if (dbError) {
      await supabaseAdmin.storage.from("room-files").remove([filePath]);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    uploaded.push(data);
  }

  return NextResponse.json({ data: uploaded });
}
