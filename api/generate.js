export const config = { runtime: "nodejs", maxDuration: 60 };

const MODEL = "@cf/black-forest-labs/flux-1-schnell";
const MAX_PROMPT_LENGTH = 2048;
const ALLOWED_ORIGIN = process.env.APP_ORIGIN;
const SUPABASE_URL = "https://irpyxhrwbugbbuksnzpg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_LtpsBpxiRSxzeCJYRzCYIw_XndwkSWG";

export async function POST(request) {
  if (ALLOWED_ORIGIN) {
    try {
      const origin = request.headers.get("origin");
      if (origin && new URL(origin).origin !== new URL(ALLOWED_ORIGIN).origin) {
        return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
      }
    } catch {
      return Response.json({ error: "Invalid request origin." }, { status: 403 });
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL || SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || SUPABASE_PUBLISHABLE_KEY;
  const authorization = request.headers.get("authorization") || "";
  if (!supabaseUrl || !supabaseKey || !authorization.startsWith("Bearer ")) {
    return Response.json({ error: "Sign in before generating a draft." }, { status: 401 });
  }

  let userResponse;
  try {
    userResponse = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { apikey: supabaseKey, Authorization: authorization },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return Response.json({ error: "Could not verify your Supabase session." }, { status: 502 });
  }
  if (!userResponse.ok) {
    return Response.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    return Response.json({ error: "Cloudflare image generation is not configured. Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in Vercel, then redeploy." }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a valid JSON request." }, { status: 400 });
  }

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description || description.length > 1000) {
    return Response.json({ error: "Keep the witness description between 1 and 1000 characters." }, { status: 400 });
  }
  const allowed = {
    jaw: ["square", "oval", "round", "narrow"],
    eyes: ["deep-set", "wide-set", "close-set", "hooded"],
    nose: ["broad", "narrow", "straight", "upturned"],
    hair: ["short dark", "short light", "curly", "receding"],
  };
  const features = {};
  for (const key of Object.keys(allowed)) {
    const value = String(body.features?.[key] || "").toLowerCase().trim();
    features[key] = allowed[key].includes(value) ? value : "as described in the prompt";
  }

  const prompt = [
    "Traditional police composite portrait, realistic hand-drawn graphite on off-white paper, grayscale pencil strokes and crosshatching. One adult, front-facing, neutral expression; full head and shoulders centered. No text, watermark, signature, props, photo, or cartoon style.",
    "Follow only the witness-described visible traits and preserve distinctive details. Do not invent features or infer identity. This is an illustrative investigative aid, not proof of identity.",
    `Witness description: ${description}`,
    `Refinements: jaw ${features.jaw}; eyes ${features.eyes}; nose ${features.nose}; hair ${features.hair}.`,
  ].join("\n");

  if (prompt.length > MAX_PROMPT_LENGTH || Buffer.byteLength(prompt, "utf8") > MAX_PROMPT_LENGTH) {
    return Response.json({ error: "The full request is too long. Please shorten the witness description and try again." }, { status: 400 });
  }
  let upstream;
  try {
    upstream = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${MODEL}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, width: 768, height: 1024, steps: 8 }),
      signal: AbortSignal.timeout(55000),
    });
  } catch {
    return Response.json({ error: "Could not reach Cloudflare Workers AI. Try again in a moment." }, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") || "";
  if (!upstream.ok) {
    const errorBody = await upstream.text().catch(() => "");
    console.error("Cloudflare image request failed", upstream.status, errorBody.slice(0, 1200));
    const message = upstream.status === 429
      ? "The free daily image allowance or request limit has been reached. Try again after it resets."
      : upstream.status === 401 || upstream.status === 403
        ? "Cloudflare rejected the request. Check the account ID and Workers AI token permissions in Vercel."
        : "Cloudflare could not generate this draft. Check the setup and try again.";
    return Response.json({ error: message }, { status: upstream.status === 429 ? 429 : 502 });
  }

  let imageData = "";
  let mimeType = "image/jpeg";
  if (contentType.startsWith("image/")) {
    mimeType = contentType.split(";")[0];
    imageData = Buffer.from(await upstream.arrayBuffer()).toString("base64");
  } else {
    const result = await upstream.json().catch(() => ({}));
    if (result.success === false) {
      console.error("Cloudflare returned an unsuccessful image response", JSON.stringify(result.errors || []).slice(0, 1200));
      return Response.json({ error: "Cloudflare could not generate this draft. Check the model access and try again." }, { status: 502 });
    }
    imageData = result.result?.image || result.image || "";
    mimeType = result.result?.mime_type || result.mime_type || "image/jpeg";
  }

  if (!imageData) {
    console.error("Cloudflare response did not include image data");
    return Response.json({ error: "The image service returned no image. Try again with a shorter prompt." }, { status: 502 });
  }

  return Response.json({ image: imageData, mimeType }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  return Response.json({ error: "Use POST to generate a draft." }, { status: 405, headers: { Allow: "POST" } });
}
