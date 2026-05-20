import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { deriveCredentials, isValidMasterKey, normalizeMasterKey } from '@/lib/zkar';

export async function POST(req: NextRequest) {
  try {
    const { masterKey } = await req.json();
    const normalizedMasterKey = typeof masterKey === 'string' ? normalizeMasterKey(masterKey) : '';

    if (!normalizedMasterKey) {
      return NextResponse.json({ error: 'Master Key is required' }, { status: 400 });
    }

    if (!isValidMasterKey(normalizedMasterKey)) {
      return NextResponse.json({ error: 'Invalid Master Key format' }, { status: 400 });
    }

    // Identify the user from the Authorization header
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    // Derive deterministic ZKAR credentials from the provided Master Key
    const { email, password } = await deriveCredentials(normalizedMasterKey);

    // Upgrade the current anonymous account in Supabase to a permanent email/password account
    // We set email_confirm to true to bypass email verification for these local deterministic emails.
    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      {
        email,
        password,
        email_confirm: true,
      }
    );

    if (updateError) {
      console.error('Failed to upgrade account via ZKAR:', updateError);
      
      // If the email is already taken, it means this Master Key is already attached to another account!
      if (updateError.message.includes('already registered')) {
        return NextResponse.json({ error: 'This Master Key is already in use by another account.' }, { status: 409 });
      }

      return NextResponse.json({ error: 'Failed to secure account. Please try again later.' }, { status: 500 });
    }

    await supabaseAdmin
      .from('users')
      .update({
        email,
        email_verified_at: updatedUser.user?.email_confirmed_at ?? new Date().toISOString(),
        auth_method: 'recovery_key',
        account_state: 'active_verified',
      })
      .eq('auth_user_id', user.id);

    return NextResponse.json({ success: true, message: 'Account secured via ZKAR successfully.' });

  } catch (err: any) {
    console.error('ZKAR upgrade exception:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
