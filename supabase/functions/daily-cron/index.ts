import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'apikey, content-type',
}

// This edge function tries to run a server-side RPC called `run_daily_jobs`.
// If the RPC doesn't exist yet, it returns a helpful message. Add your
// maintenance/aggregation logic inside that RPC (preferred) or extend this
// function to inline SQL operations.

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Call RPC run_daily_jobs (create this via migration if you want SQL logic)
    const { data, error } = await supabase.rpc('run_daily_jobs')

    if (error) {
      // If RPC missing or other error, return a helpful payload
      return new Response(JSON.stringify({ success: false, error: error.message, hint: 'Create RPC run_daily_jobs or update this function to perform inline jobs.' }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } })
    }

    return new Response(JSON.stringify({ success: true, result: data }), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } })

  } catch (err) {
    console.error('daily-cron error', err)
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } })
  }
})
