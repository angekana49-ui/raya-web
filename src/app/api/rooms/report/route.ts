import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveUserId } from '@/lib/auth';
import { RayaAIService } from '@/services/raya-ai.service';
import {
  buildFallbackStudyRoomReport,
  normalizeStudyRoomReport,
  type StudyRoomReport,
} from '@/lib/room-report';

const MAX_REPORT_TRANSCRIPT_CHARS = 12000;

function safeParseJsonReport(raw: string): Partial<StudyRoomReport> | null {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;

  try {
    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

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

    const { data: existingReport, error: existingReportError } = await supabaseAdmin
      .from('study_room_reports')
      .select('*')
      .eq('room_id', roomId)
      .maybeSingle();

    if (existingReportError) {
      throw existingReportError;
    }

    if (existingReport) {
      return new Response(JSON.stringify(existingReport), { status: 200 });
    }

    // 2. Fetch conversation history
    if (!room.conversation_id) {
       return new Response(JSON.stringify({ error: 'No conversation linked to this room' }), { status: 400 });
    }
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from('messages')
      .select('id, sender, text, timestamp')
      .eq('conversation_id', room.conversation_id)
      .order('timestamp', { ascending: true });

    if (messagesError) {
      throw messagesError;
    }
    
    // 3. Prepare AI Summation
    const transcriptLines = messages
      .map((m: any) => ({
        sender: String(m.sender || 'member'),
        text: String(m.text || '').trim(),
      }))
      .filter((line) => line.text.length > 0);

    let transcript = '';
    for (const line of transcriptLines) {
      const nextLine = `${line.sender.toUpperCase()}: ${line.text}\n`;
      if ((transcript + nextLine).length > MAX_REPORT_TRANSCRIPT_CHARS) break;
      transcript += nextLine;
    }

    const raya = new RayaAIService({
      apiKey: process.env.GEMINI_API_KEY!,
      model: 'gemini-3.1-flash-lite',
      temperature: 0.4,
    });

    const summaryPrompt = `
You are the RAYA Squad Moderator. The study session for "${room.title}" has just ended.
Mission: "${room.mission}"

Below is the room transcript excerpt:
---
${transcript.trim()}
---

Return a final squad report as strict JSON only:
{
  "summary": "2-3 sentence session overview",
  "squad_score": 0,
  "key_learnings": "What the squad actually understood or produced",
  "highlights": ["Short highlight 1", "Short highlight 2", "Short highlight 3"],
  "recommendations": "What to do next"
}

Rules:
- Keep it readable on mobile.
- Ground the report in the transcript.
- Do not include markdown fences.
- Keep highlights short.
`.trim();

    let reportPayload: StudyRoomReport;
    if (transcriptLines.length === 0) {
      reportPayload = buildFallbackStudyRoomReport({
        roomId,
        conversationId: room.conversation_id,
        mission: room.mission,
        transcriptLines,
      });
    } else {
      try {
        const response = await raya.chat(summaryPrompt);
        const parsedReport = safeParseJsonReport(response.text);
        if (!parsedReport) {
          console.error('Failed to parse AI report:', response.text);
          reportPayload = buildFallbackStudyRoomReport({
            roomId,
            conversationId: room.conversation_id,
            mission: room.mission,
            transcriptLines,
          });
        } else {
          reportPayload = normalizeStudyRoomReport({
            room_id: roomId,
            conversation_id: room.conversation_id,
            summary: parsedReport.summary,
            squad_score: parsedReport.squad_score,
            key_learnings: parsedReport.key_learnings,
            highlights: parsedReport.highlights,
            recommendations: parsedReport.recommendations,
          });
        }
      } catch (aiError) {
        console.error('AI room report generation failed, using fallback report:', aiError);
        reportPayload = buildFallbackStudyRoomReport({
          roomId,
          conversationId: room.conversation_id,
          mission: room.mission,
          transcriptLines,
        });
      }
    }

    const { data: reportStub } = await supabaseAdmin
      .from('study_room_reports')
      .select('id')
      .eq('room_id', roomId)
      .maybeSingle();

    const reportQuery = reportStub
      ? supabaseAdmin
          .from('study_room_reports')
          .update(reportPayload)
          .eq('id', reportStub.id)
      : supabaseAdmin
          .from('study_room_reports')
          .insert(reportPayload);

    const { data: report, error: reportError } = await reportQuery
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
