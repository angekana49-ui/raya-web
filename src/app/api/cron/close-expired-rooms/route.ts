import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { callAnalyzeSession } from '@/services/supabase-chat.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Only allow Vercel Cron or local development authorized calls
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Find all active rooms whose timer has expired
    const { data: expiredRooms, error: fetchError } = await supabaseAdmin
      .from('study_rooms')
      .select('id, conversation_id, created_by')
      .eq('is_active', true)
      .lte('timer_ends_at', new Date().toISOString());

    if (fetchError) throw fetchError;

    if (!expiredRooms || expiredRooms.length === 0) {
      return NextResponse.json({ success: true, message: 'No expired rooms found' });
    }

    const results = [];

    // 2. Loop through and close them + Generate Report
    for (const room of expiredRooms) {
      // Deactivate the room
      const { error: updateError } = await supabaseAdmin
        .from('study_rooms')
        .update({ is_active: false, timer_status: 'finished' })
        .eq('id', room.id);

      if (updateError) {
        results.push({ room: room.id, status: 'failed_update', error: updateError.message });
        continue;
      }

      // Mark the conversation as inactive too
      if (room.conversation_id) {
        await supabaseAdmin
          .from('conversations')
          .update({ is_active: false })
          .eq('id', room.conversation_id);

        try {
          // 3. Trigger Report Generation (Edge Function)
          await callAnalyzeSession(room.conversation_id, room.created_by, null);
          results.push({ room: room.id, status: 'closed_and_analyzed' });
        } catch (analysisError: any) {
          results.push({ room: room.id, status: 'closed_analysis_failed', error: analysisError.message });
        }
      } else {
        results.push({ room: room.id, status: 'closed_no_conversation' });
      }
    }

    // 4. Cleanup stale anonymous accounts (inactive 60+ days)
    const { data: cleanedCount, error: cleanupError } = await supabaseAdmin.rpc('cleanup_stale_anonymous_accounts');
    
    if (cleanupError) {
      console.error('Cleanup Error:', cleanupError);
      results.push({ task: 'account_cleanup', status: 'failed', error: cleanupError.message });
    } else {
      results.push({ task: 'account_cleanup', status: 'success', cleaned: cleanedCount });
    }

    return NextResponse.json({ success: true, processed: expiredRooms.length, results });
  } catch (err: any) {
    console.error('Cron Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
