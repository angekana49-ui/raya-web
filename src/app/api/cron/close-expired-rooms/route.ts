export const dynamic = "force-dynamic";
export async function GET() {
  return new Response("This endpoint is deprecated. Use Supabase Edge Functions instead.", { status: 410 });
}
