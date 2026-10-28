export const config = { runtime: "nodejs" };

const MODEL = "@cf/black-forest-labs/flux-1-schnell";
const MAX_PROMPT_LENGTH = 2048;
const ALLOWED_ORIGIN = process.env.APP_ORIGIN;

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
  if (!description || description.length > MAX_PROMPT_LENGTH) {
    return Response.json({ error: `Prompt must be between 1 and ${MAX_PROMPT_LENGTH} characters.` }, { status: 400 });
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
    "Create one traditional police composite portrait sketch, a realistic hand-rendered graphite drawing on clean off-white paper, subtle visible pencil strokes, fine cross-hatching, natural facial proportions, gentle grayscale shading.",
    "Show one adult person from the shoulders up, front-facing and centered, looking forward with a neutral expression. Include the complete hair and head and a little shoulder area. Detailed and convincing hand-drawn sketch, not a cartoon, vector, painting, 3D render, or photograph. Plain light background; no text, labels, signature, badge, props, or dramatic shadows.",
    "Use the user's prompt as the source of the person's visible features. Clearly preserve every explicitly described trait and make the stated distinguishing features visually easy to see. Keep the described proportions and spacing of the eyes, nose, jaw, hair, and any witness-reported marks; do not replace them with a generic face. Do not invent marks or infer ethnicity, criminality, or identity. The result is an illustrative investigative aid, not proof of identity.",
    `User prompt: ${description}`,
    `Selected refinements: jaw ${features.jaw}; eyes ${features.eyes}; nose ${features.nose}; hair ${features.hair}.`,
  ].join("\n");

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
