import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase/server";
import { rayaConfirmSignupTemplate } from "@/lib/email-templates";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL ?? "RAYA <noreply@raya.app>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password || password.length < 6) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  // Generate signup confirmation link — password is top-level param, no auto-email sent by Supabase
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: { redirectTo: `${APP_URL}/auth/callback` },
  });

  if (error || !data?.properties?.action_link) {
    return NextResponse.json(
      { error: error?.message ?? "Could not process signup." },
      { status: 400 }
    );
  }

  // Step 3: Send RAYA-branded confirmation email via Resend
  const { error: sendError } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Confirm your RAYA account",
    html: rayaConfirmSignupTemplate(data.properties.action_link),
  });

  if (sendError) {
    console.error("Resend error:", sendError);
    return NextResponse.json({ error: "Failed to send confirmation email." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
