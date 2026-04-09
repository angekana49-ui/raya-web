import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveUserId } from '@/lib/auth';
import { RayaAIService } from '@/services/raya-ai.service';
import { getMessages } from '@/services/supabase-chat.service';

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { roomId } = await req.json();
    if (!roomId) {
      return new Response(JSON.stringify({ error: 'Room ID is required' }), { status: 400 });
    }

    // 1. Verify user is creator or active participant
    const [roomRes, partRes] = await Promise.all([
      supabaseAdmin
        .from('study_rooms')
        .select('id, created_by, conversation_id, title, mission')
        .eq('id', roomId)
        .single(),
      supabaseAdmin
        .from('study_room_participants')
        .select('user_id')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .single()
    ]);

    const { data: room, error: roomError } = roomRes;
    const { data: participant } = partRes;

    if (roomError || !room) {
      return new Response(JSON.stringify({ error: 'Room not found' }), { status: 404 });
    }

    if (room.created_by !== userId && !participant) {
      return new Response(JSON.stringify({ error: 'Only the room host or active participants can generate the squad report' }), { status: 403 });
    }

    // 2. Fetch conversation history
    if (!room.conversation_id) {
       return new Response(JSON.stringify({ error: 'No conversation linked to this room' }), { status: 400 });
    }
    const messages = await getMessages(userId, room.conversation_id);
    
    // 3. Prepare AI Summation
    const transcript = messages
      .map((m: any) => `${m.sender.toUpperCase()}: ${m.text}`)
      .join('\n');

    const raya = new RayaAIService({
      apiKey: process.env.GEMINI_API_KEY!,
      model: 'gemini-3.1-flash-lite-preview',
      temperature: 0.4,
    });

    const summaryPrompt = `
      You are the RAYA Squad Moderator. The study session for "${room.title}" has just ended.
      Mission was: "${room.mission}"
      
      Below is the full transcript of the session:
      ---
      ${transcript}
      ---
      
      Generate a final "Squad Report" in the following JSON format:
      {
        "summary": "A 2-3 sentence overview of the session outcomes.",
        "squad_score": 0-100 (integer representing collaboration and focus),
        "key_learnings": "What the squad actually achieved or learned.",
        "highlights": ["Point 1", "Point 2"],
        "recommendations": "What the squad should do next to consolidate knowledge."
      }
      
      Return ONLY the JSON block. Do not include any other text.
    `;

    const response = await raya.chat(summaryPrompt);
    let reportData;
    try {
      reportData = JSON.parse(response.text.replace(/```json|```/g, '').trim());
    } catch (e) {
      console.error('Failed to parse AI report:', response.text);
      throw new Error('AI failed to generate a valid report format');
    }

    // 4. Save report and Close room
    const { data: report, error: reportError } = await supabaseAdmin
      .from('study_room_reports')
      .upsert({
        room_id: roomId,
        conversation_id: room.conversation_id,
        summary: reportData.summary,
        squad_score: reportData.squad_score,
        key_learnings: reportData.key_learnings,
        highlights: reportData.highlights,
        recommendations: reportData.recommendations
      }, { onConflict: 'room_id' })
      .select()
      .single();

    if (reportError) throw reportError;

    // Update room status
    await supabaseAdmin
      .from('study_rooms')
      .update({ is_active: false, timer_status: 'finished' })
      .eq('id', roomId);

    return new Response(JSON.stringify(report), { status: 200 });

  } catch (error: any) {
    console.error('Squad Report Generation Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
