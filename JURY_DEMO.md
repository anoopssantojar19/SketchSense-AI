# SketchSense AI — jury demo

## 30-second explanation

SketchSense AI turns a written witness description into a graphite-style face sketch. Supabase manages sign-in and stores cases, sketch records, review details, and audit activity. Vercel hosts the website and its server endpoint. That endpoint verifies the signed-in user and calls Cloudflare Workers AI (FLUX.1 schnell) to generate the draft.

## Demo sequence

1. Create an account or sign in. If email confirmation is enabled, verify the account first.
2. Open **New sketch** and enter a fictional description.
3. Choose jawline, eyes, nose, and hair refinements.
4. Select **Generate draft**. The image and its prompt/features are saved to the private Supabase Storage bucket and database.
5. Mark the result reviewed, then export it.
6. Show **Case history** and **Audit log** to demonstrate persistent database records.

Use fictional examples during the demo. Do not enter real case or witness information.

## Architecture

```text
Browser → Supabase Auth and database/storage
   │             └─ row-level security by account and role
   └─ POST /api/generate with Supabase access token
                     ↓
              Vercel serverless function
                     ↓
              Cloudflare FLUX.1 schnell
```

## Setup checklist

- Run `supabase/migrations/001_initial_schema.sql` in the Supabase SQL Editor.
- Supabase Project URL and publishable key are preconfigured in the app.
- Add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` to Vercel.
- Add the deployed site URL to Supabase Authentication URL settings.
- Redeploy after adding environment variables.

For production setup and administrator role assignment, see `README.md`.

## Responsible use

AI sketches are investigative aids, not proof of identity. Confirm every feature with the witness and have an officer review before export. Cloudflare Workers AI has usage limits; generation can stop when the account's allowance is exhausted.

