import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { mapStudyRoomRow } from "@/services/study-rooms.service";
import RoomInvitePreview from "@/components/rooms/RoomInvitePreview";

type PageProps = {
  params: Promise<{ roomId: string }>;
};

async function getRoomInvitePreview(roomId: string) {
  const { data, error } = await supabaseAdmin
    .from("study_rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapStudyRoomRow(data);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { roomId } = await params;
  const room = await getRoomInvitePreview(roomId);

  if (!room) {
    return {
      title: "Room Not Found",
      description: "This study room invitation is invalid or has expired.",
    };
  }

  return {
    title: `${room.title} Invite`,
    description: room.mission,
    openGraph: {
      title: `Join ${room.title} on RAYA`,
      description: room.mission,
      images: ["/raya-logo.jpeg"],
    },
  };
}

export default async function RoomInvitePage({ params }: PageProps) {
  const { roomId } = await params;
  const room = await getRoomInvitePreview(roomId);

  if (!room) {
    redirect("/?error=room_expired");
  }

  return (
    <RoomInvitePreview
      roomId={room.id}
      roomName={room.title}
      mission={room.mission}
      onlineCount={room.onlineCount}
      maxMembers={room.maxMembers}
      vibe={room.vibe}
      aiMode={room.aiMode}
      timerStatus={room.timerStatus}
    />
  );
}
