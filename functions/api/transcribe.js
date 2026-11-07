import { json, checkAccess } from "../../lib/util.js";

// Speech-to-text with Whisper on Cloudflare Workers AI (AI binding in wrangler.toml).
const MODEL = "@cf/openai/whisper-large-v3-turbo";
const MAX_BYTES = 25 * 1024 * 1024;

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

export async function onRequestPost({ request, env }) {
  const denied = checkAccess(request, env);
  if (denied) return denied;

  if (!env.AI) {
    return json({ code: "not_configured", error: "Trascrizione non configurata sul server." }, 503);
  }

  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BYTES) {
    return json({ code: "too_large", error: "File troppo grande (massimo 25 MB)." }, 413);
  }

  const audio = await request.arrayBuffer();
  if (!audio.byteLength) {
    return json({ code: "empty", error: "Nessun audio ricevuto." }, 400);
  }
  if (audio.byteLength > MAX_BYTES) {
    return json({ code: "too_large", error: "File troppo grande (massimo 25 MB)." }, 413);
  }

  const lang = (new URL(request.url).searchParams.get("lang") || "it").slice(0, 5);

  try {
    const result = await env.AI.run(MODEL, {
      audio: toBase64(audio),
      task: "transcribe",
      language: lang,
    });
    return json({ text: result?.text || "" });
  } catch (err) {
    console.error("transcribe failed", err);
    return json({ code: "upstream_error", error: "Trascrizione non riuscita." }, 502);
  }
}
