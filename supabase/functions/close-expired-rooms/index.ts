import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    console.log('Cron job started: Checking for expired rooms...')

    // 1. Find all active rooms whose timer has expired
    const { data: expiredRooms, error: fetchError } = await supabase
      .from('study_rooms')
      .select('id, conversation_id, created_by')
      .eq('is_active', true)
      .lte('timer_ends_at', new Date().toISOString());

    if (fetchError) throw fetchError;

    if (!expiredRooms || expiredRooms.length === 0) {
      console.log('No expired rooms found.')
      return new Response(
        JSON.stringify({ success: true, message: 'No expired rooms found' }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Found ${expiredRooms.length} expired rooms. Closing them...`)
    const results = [];

    // 2. Loop through and close them + Generate Report
    for (const room of expiredRooms) {
      // Deactivate the room with full state cleanup to match the system's "finished" state
      const { error: updateError } = await supabase
        .from('study_rooms')
        .update({ 
          is_active: false, 
          timer_status: 'finished',
          online_count: 0,
          alert_end_sent: true,
          ai_turn_status: 'idle',
          ai_turn_started_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', room.id);

      if (updateError) {
        results.push({ room: room.id, status: 'failed_update', error: updateError.message });
        continue;
      }

      // Mark the conversation as inactive too
      if (room.conversation_id) {
        await supabase
          .from('conversations')
          .update({ is_active: false })
          .eq('id', room.conversation_id);

        try {
          // 3. Trigger Report Generation (Invoke another Edge Function)
          // We use invoke because the logic is already in another function
          await supabase.functions.invoke('analyze-session', {
            body: { conversation_id: room.conversation_id },
          });
          results.push({ room: room.id, status: 'closed_and_analyzed' });
        } catch (analysisError: any) {
          results.push({ room: room.id, status: 'closed_analysis_failed', error: analysisError.message });
        }
      } else {
        results.push({ room: room.id, status: 'closed_no_conversation' });
      }
    }

    // 4. Cleanup stale anonymous accounts (inactive 60+ days)
    console.log('Running stale accounts cleanup...')
    const { data: cleanedCount, error: cleanupError } = await supabase.rpc('cleanup_stale_anonymous_accounts');

    if (cleanupError) {
      console.error('Cleanup Error:', cleanupError);
      results.push({ task: 'account_cleanup', status: 'failed', error: cleanupError.message });
    } else {
      results.push({ task: 'account_cleanup', status: 'success', cleaned: cleanedCount });
    }

    console.log('Cron job finished successfully.')
    return new Response(
      JSON.stringify({ success: true, processed: expiredRooms.length, results }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error('Cron Error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
