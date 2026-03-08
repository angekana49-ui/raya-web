import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

/** Resolve public.users.id from the Bearer JWT in the request */
export async function resolveUserId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null

  const { data } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  return data?.id ?? null
}
