import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase/server";
import { rayaPasswordResetTemplate } from "@/lib/email-templates";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL ?? "RAYA <noreply@raya.app>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "Email required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${APP_URL}/auth/callback?type=recovery` },
  });

  // Always return success to avoid email enumeration
  if (error || !data?.properties?.action_link) {
    return NextResponse.json({ success: true });
  }

  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Reset your RAYA password",
    html: rayaPasswordResetTemplate(data.properties.action_link),
  });

  return NextResponse.json({ success: true });
}
