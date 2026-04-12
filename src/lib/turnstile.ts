import { NextResponse } from "next/server";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstileToken(token?: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    return { ok: true as const };
  }

  if (!token) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Captcha token missing." }, { status: 400 }),
    };
  }

  const body = new URLSearchParams({
    secret,
    response: token,
  });

  const verifyRes = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!verifyRes.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Captcha verification failed." }, { status: 502 }),
    };
  }

  const verifyJson = await verifyRes.json() as { success?: boolean };
  if (!verifyJson.success) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Captcha challenge rejected." }, { status: 400 }),
    };
  }

  return { ok: true as const };
}
