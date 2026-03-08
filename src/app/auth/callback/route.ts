import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (token_hash && type === "signup") {
    const { error } = await supabaseAdmin.auth.verifyOtp({
      token_hash,
      type: "signup",
    });
    if (!error) {
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
      });
      return NextResponse.redirect(`${APP_URL}/?${params.toString()}`);
    }
  }

  // Invalid or expired link
  return NextResponse.redirect(`${APP_URL}/?error=confirmation_failed`);
}
