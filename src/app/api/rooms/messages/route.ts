import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth";
import { getMessages } from "@/services/supabase-chat.service";

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationId } = await req.json();
    if (!conversationId) {
      return NextResponse.json({ error: "Conversation ID is required" }, { status: 400 });
    }

    const messages = await getMessages(userId, conversationId);
    return NextResponse.json({ data: messages });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load room messages" }, { status: 500 });
  }
}
