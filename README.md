# SketchSense AI — Vercel prototype

A responsive static website with a Vercel serverless image-generation endpoint. Deploy this folder as the Vercel project root. Vercel serves `index.html` and creates `/api/generate` from `api/generate.js`. Opening `index.html` directly with a `file://` URL only previews the interface; image generation requires the deployed Vercel site (or a configured Vercel local development server).

## Use Cloudflare Workers AI for image generation
1. Create a Cloudflare account and enable Workers AI.
2. Find your Cloudflare Account ID in the dashboard.
3. Create an API token with **Workers AI Read** permission.
4. In Vercel, open **Project → Settings → Environment Variables**.
5. Add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Add them for Preview and Production as needed. Do not add public prefixes.
6. Redeploy after saving the variables.

The browser sends the prompt and selected face features to `/api/generate`. That Vercel function calls Cloudflare's `@cf/black-forest-labs/flux-1-schnell` model and returns the generated image to the preview. The Cloudflare token stays server-side and is never included in the page JavaScript. The free Workers AI allocation is limited to 10,000 Neurons per day; on the Free plan requests stop after the daily allowance is used.

## Included
- Sign-in and create-account screens with officer and administrator role selection
- Overview, case history, audit log, and settings pages
- Light/dark theme switch and optional animated ambient background
- Prompt input and adjustable jaw, eyes, nose, and hair controls
- Cloudflare FLUX image generation with a graphite witness-sketch style with clearer emphasis on user-described features
- Officer review gate before PNG export
- Session activity log and investigative-aid disclaimer

## Prototype boundary
Accounts and activity are stored only in browser state; login is not real authentication. The generation endpoint checks origin when `APP_ORIGIN` is set and limits prompt length, but has no durable rate limiter or user authentication. Prompts are sent to Cloudflare Workers AI. Use invented hackathon demo details only, not real case or witness data. Before sharing publicly, add real authentication, persistent case storage, server-side audit records, access controls, and rate limiting.
