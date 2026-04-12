import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (token_hash && type === "signup") {
    const { data, error } = await supabaseAdmin.auth.verifyOtp({
      token_hash,
      type: "signup",
    });
    if (!error) {
      if (data.user) {
        await supabaseAdmin
          .from("users")
          .update({
            email: data.user.email ?? null,
            email_verified_at: data.user.email_confirmed_at ?? new Date().toISOString(),
            auth_method: data.user.email?.endsWith("@zkar.raya.local") ? "recovery_key" : "email",
          })
          .eq("auth_user_id", data.user.id);
      }
      return NextResponse.redirect(`${APP_URL}/?confirmed=1`);
    }
  }

  if (token_hash && type === "recovery") {
    const { data, error } = await supabaseAdmin.auth.verifyOtp({
      token_hash,
      type: "recovery",
    });
    if (!error && data.session) {
      // Redirect with access_token so client can set the new password
      const params = new URLSearchParams({
        reset_password: "1",
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      return NextResponse.redirect(`${APP_URL}/?${params.toString()}`);
    }
  }

  if (token_hash && type === "email_change") {
    const { data, error } = await supabaseAdmin.auth.verifyOtp({
      token_hash,
      type: "email_change",
    });
    if (!error && data.user) {
      await supabaseAdmin
        .from("users")
        .update({
          email: data.user.email ?? null,
          email_verified_at: data.user.email_confirmed_at ?? new Date().toISOString(),
          auth_method: data.user.email?.endsWith("@zkar.raya.local") ? "recovery_key" : "email",
          account_state: "active_verified",
        })
        .eq("auth_user_id", data.user.id);

      return NextResponse.redirect(`${APP_URL}/?email_upgraded=1`);
    }
  }

  // Invalid or expired link
  return NextResponse.redirect(`${APP_URL}/?error=confirmation_failed`);
}
