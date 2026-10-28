# SketchSense AI

Deploy this folder as the Vercel project root. It contains a single-page frontend, two Vercel functions, and a Supabase database migration. Authentication, case records, generated sketch metadata and private image files, and audit activity are stored in Supabase.

## Connect Supabase

1. Create a Supabase project.
2. Open **SQL Editor**, paste and run `supabase/migrations/001_initial_schema.sql`.
3. In **Authentication → URL Configuration**, add your deployed Vercel URL to the site and redirect URL settings.
4. This project is preconfigured with your Project URL and publishable key. The publishable key is intended for browser use; it is protected by the database row-level security policies in the migration.
5. The Supabase publishable key is safe to use in the website. Never put a Supabase secret or service-role key in browser code.
6. New accounts are field officers. To grant an administrator after that user registers, run this in the Supabase SQL Editor, replacing the email:

   ```sql
   update public.profiles p
   set role = 'admin'
   from auth.users u
   where p.id = u.id and u.email = 'admin@example.com';
   ```

Email confirmation can be enabled in Supabase Auth. When enabled, new users should click the email link and then sign in.

## Deploy to Vercel

1. Import this project folder into Vercel, or connect the Git repository and set the project root to this folder.
2. Add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` under **Project → Settings → Environment Variables** for Production (and Preview if desired). Supabase is preconfigured in the app; those variables are only needed if you later change projects.
3. The Cloudflare token needs Workers AI permission. These credentials stay server-side; do not add `NEXT_PUBLIC_` prefixes.
4. Optionally set `APP_ORIGIN` to your deployed site origin.
5. Deploy or redeploy after setting environment variables.

The `/api/generate` function checks the signed-in Supabase access token, calls Cloudflare Workers AI FLUX.1 schnell, and returns the image. The browser uploads the generated file to the private `sketch-images` bucket and stores its prompt, selected features, case, and review metadata in Supabase. Row-level security limits records and files by owner and administrator role.

## Use

Create an account from the site, verify your email if requested, and sign in. The first sign-in creates a starter case. Generate a draft to save it to the private image bucket and database. Officer review and export actions appear in the audit log.

Use invented demo details for hackathon presentations. AI sketches are investigative aids, not evidence of identity. Verify every feature with the witness and review before export.

