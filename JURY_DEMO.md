# SketchSense AI — Jury Demo Notes

## 30-second explanation

SketchSense AI turns a written witness description into a graphite-style face sketch. The browser sends the prompt and selected facial features to a Vercel server function. That function calls Cloudflare Workers AI (FLUX.1 schnell), then returns the generated image for officer review and export.

## Demo sequence

1. Sign in with a demo email and password (the prototype accepts locally stored demo accounts).
2. Open **New sketch** and enter a fictional description.
3. Choose jawline, eyes, nose, and hair refinements.
4. Select **Generate draft** and wait for the generated image.
5. Mark the result reviewed, then export it.
6. Show the **Audit log** and explain that this prototype records activity only for the current browser session.

Use fictional examples during the demo. Do not enter real case or witness information.

## Architecture

```text
Browser UI
  ├─ description + feature selections
  ├─ POST /api/generate
  └─ displays returned image; officer reviews before export
            ↓
Vercel server function
  ├─ reads CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN
  ├─ sends prompt to FLUX.1 schnell
  └─ returns image data to browser
```

## Key backend code

The actual implementation is in `api/generate.js`. The Cloudflare credentials stay in Vercel environment variables, rather than in the browser source.

```js
const MODEL = "@cf/black-forest-labs/flux-1-schnell";
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;

const upstream = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prompt, width: 768, height: 1024, steps: 8 })
  }
);
```

## Key frontend flow

The browser sends the user's prompt and face controls to the Vercel endpoint, then uses the returned image data for the preview.

```js
const response = await fetch("/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ description, features })
});
const result = await response.json();
if (!response.ok) throw new Error(result.error);
imageElement.src = `data:${result.mimeType};base64,${result.image}`;
```

## Be clear about prototype limits

- The face is AI-generated from text; it may not match the described person exactly and should not be presented as proof of identity.
- Login is a browser-only demo, not real authentication.
- Cases and audit entries are not stored in a server database.
- Vercel must have `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` configured for image generation to work.
- Cloudflare's free Workers AI usage has a daily allowance; generation can stop after it is used.
