/**
 * RAYA transactional email templates.
 * These are sent via Resend for RAYA-specific auth flows,
 * independent of Supabase's built-in templates (used by BlueStift Schools).
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://thebluestift.com';
const LOGO_URL = `${BASE_URL}/raya-logo.jpeg`;
export function rayaConfirmSignupTemplate(confirmationUrl: string): string {
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#ffffff;padding:40px 32px;border-radius:16px;border:1px solid #e2e8f0">
  <div style="margin-bottom:32px;display:flex;align-items:center;gap:12px">
    <img src="${LOGO_URL}" alt="RAYA" width="48" height="48" style="border-radius:50%;object-fit:cover" />
    <div>
      <span style="font-size:1.5rem;font-weight:800;color:#6366f1">RAYA</span>
      <br/><span style="color:#94a3b8;font-size:0.85rem">AI Academic Coach</span>
    </div>
  </div>
  <h2 style="color:#0f172a;font-size:1.25rem;font-weight:700;margin:0 0 12px">Confirm your email</h2>
  <p style="color:#64748b;line-height:1.7;margin:0 0 28px;font-size:0.95rem">
    You're one step away from your personal AI tutor. Click below to activate your RAYA account.
  </p>
  <a href="${confirmationUrl}"
     style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;padding:13px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:0.95rem;letter-spacing:0.01em">
    Activate my account
  </a>
  <p style="margin-top:32px;font-size:0.75rem;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:20px">
    Didn't create a RAYA account? You can safely ignore this email.<br>Link expires in 24 hours.
  </p>
</div>`.trim();
}

export function rayaPasswordResetTemplate(resetUrl: string): string {
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#ffffff;padding:40px 32px;border-radius:16px;border:1px solid #e2e8f0">
  <div style="margin-bottom:32px;display:flex;align-items:center;gap:12px">
    <img src="${LOGO_URL}" alt="RAYA" width="48" height="48" style="border-radius:50%;object-fit:cover" />
    <div>
      <span style="font-size:1.5rem;font-weight:800;color:#6366f1">RAYA</span>
      <br/><span style="color:#94a3b8;font-size:0.85rem">AI Academic Coach</span>
    </div>
  </div>
  <h2 style="color:#0f172a;font-size:1.25rem;font-weight:700;margin:0 0 12px">Reset your password</h2>
  <p style="color:#64748b;line-height:1.7;margin:0 0 28px;font-size:0.95rem">
    Click below to set a new password for your RAYA account.
  </p>
  <a href="${resetUrl}"
     style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;padding:13px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:0.95rem;letter-spacing:0.01em">
    Reset my password
  </a>
  <p style="margin-top:32px;font-size:0.75rem;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:20px">
    Didn't request this? Your account is safe — ignore this email.<br>Expires in 1 hour.
  </p>
</div>`.trim();
}
