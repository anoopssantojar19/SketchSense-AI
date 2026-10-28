const DEFAULT_SUPABASE_URL = "https://irpyxhrwbugbbuksnzpg.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_LtpsBpxiRSxzeCJYRzCYIw_XndwkSWG";

export async function GET() {
  const url = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    return Response.json({ error: "Database setup is incomplete. Configure Supabase in Vercel." }, { status: 503 });
  }
  return Response.json({ supabaseUrl: url, supabasePublishableKey: publishableKey }, {
    headers: { "Cache-Control": "no-store" },
  });
}
