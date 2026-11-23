import Anthropic from "@anthropic-ai/sdk";
import { json, checkUser, claudeKey } from "../../lib/util.js";

// Rewriting, titles, fidelity check, super notes and "chat with notes" all go
// through this one endpoint. The page sends the full prompt (or chat turns).

const SYSTEM =
  "Sei l'assistente di scrittura di Dictax, un'app che trasforma note vocali in testi. " +
  "Segui alla lettera le istruzioni del messaggio. Rispondi in italiano, salvo indicazione diversa.";

const MAX_CHARS = 400_000;

// Models that accept the server-side refusal fallback (fallbacks: "default").
const FALLBACK_MODELS = /^claude-(opus-5-5|opus-5|fable-5-1|sonnet-5-5)$/;

function cleanTurns(input) {
  const turns =
    typeof input === "string"
      ? [{ role: "user", content: input }]
      : Array.isArray(input)
        ? input
        : [];
  const out = [];
  for (const t of turns) {
    const role = t?.role === "assistant" ? "assistant" : "user";
    const content = String(t?.content ?? "");
    if (!content.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += "\n\n" + content;
    else out.push({ role, content });
  }
  return out;
}

async function runWorkersAI(env, messages, quick, warning) {
  const model = env.CF_TEXT_MODEL || "@cf/google/gemma-4-26b-a4b-it";
  try {
    const out = await env.AI.run(model, {
      messages: [{ role: "system", content: SYSTEM }, ...messages],
      max_tokens: quick ? 1000 : 4000,
      chat_template_kwargs: { enable_thinking: false },
    });
    const choice = out?.choices?.[0];
    const text = String(choice?.message?.content ?? out?.response ?? "").trim();
    if (!text) return json({ code: "empty_completion", error: "Nessuna risposta." }, 502);
    return json({ text, truncated: choice?.finish_reason === "length", engine: "cloudflare", warning: warning || undefined });
  } catch (err) {
    console.error("workers ai failed", err);
    return json({ code: "upstream_error", error: "Servizio AI non disponibile." }, 502);
  }
}

export async function onRequestPost({ request, env }) {
  const denied = await checkUser(request, env);
  if (denied) return denied;

  if (!claudeKey(env) && !env.AI) {
    return json({ code: "not_configured", error: "Nessun modello AI configurato sul server." }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ code: "invalid_request", error: "Richiesta non valida." }, 400);
  }

  const messages = cleanTurns(body?.input);
  const size = messages.reduce((n, m) => n + m.content.length, 0);
  if (!messages.length || messages[0].role !== "user" || messages[messages.length - 1].role !== "user") {
    return json({ code: "invalid_request", error: "Richiesta non valida." }, 400);
  }
  if (size > MAX_CHARS) {
    return json({ code: "too_large", error: "Testo troppo lungo." }, 413);
  }

  const quick = body?.tier === "quick";

  // Optional photos (document, screenshot, flyer, client photos for stories…) sent as data URLs: Claude reads them.
  const rawImgs = Array.isArray(body?.images) ? body.images : body?.image ? [body.image] : [];
  if (rawImgs.length) {
    if (rawImgs.length > 8) return json({ code: "too_many_images", error: "Al massimo 8 foto alla volta." }, 400);
    const blocks = [];
    let total = 0;
    for (const raw of rawImgs) {
      const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(raw));
      if (!m || m[2].length > 7_000_000) {
        return json({ code: "invalid_image", error: "Foto non valida o troppo grande." }, 400);
      }
      total += m[2].length;
      blocks.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
    }
    if (total > 24_000_000) return json({ code: "too_large", error: "Foto troppo grandi tutte insieme: mandane meno." }, 413);
    if (!claudeKey(env)) {
      return json({ code: "not_configured", error: "Per leggere le foto serve la chiave di Claude sul server." }, 503);
    }
    const last = messages[messages.length - 1];
    last.content = [...blocks, { type: "text", text: last.content }];
  }
  const image = rawImgs.length > 0;

  // Without a Claude key, use an open model on Cloudflare Workers AI (no extra key needed).
  if (!claudeKey(env)) {
    return runWorkersAI(env, messages, quick);
  }

  const model = env.CLAUDE_MODEL || "claude-opus-5-5";
  const client = new Anthropic({ apiKey: claudeKey(env) });

  const params = {
    model,
    max_tokens: quick ? 2000 : 16000,
    system: SYSTEM,
    output_config: { effort: quick ? "low" : "medium" },
    messages,
  };
  if (FALLBACK_MODELS.test(model)) {
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }

  try {
    const res = await client.beta.messages.create(params);
    if (res.stop_reason === "refusal") {
      return json({ code: "refused", error: "Richiesta rifiutata dall'AI." }, 422);
    }
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) return json({ code: "empty_completion", error: "Nessuna risposta." }, 502);
    return json({ text, truncated: res.stop_reason === "max_tokens" });
  } catch (err) {
    let reason;
    if (err instanceof Anthropic.RateLimitError) {
      reason = "Claude: troppe richieste, riprova tra poco.";
    } else if (err instanceof Anthropic.AuthenticationError) {
      reason = "Claude: la chiave non è valida.";
    } else if (err instanceof Anthropic.PermissionDeniedError) {
      reason = "Claude: la chiave non ha i permessi necessari.";
    } else if (err instanceof Anthropic.BadRequestError) {
      reason = /credit|balance|billing/i.test(err.message)
        ? "Claude: credito esaurito o non caricato sull'account Anthropic."
        : "Claude: richiesta rifiutata (" + String(err.message).slice(0, 160) + ").";
    } else if (err instanceof Anthropic.APIError) {
      reason = "Claude: servizio non disponibile (errore " + err.status + ").";
    } else {
      reason = "Claude: errore di connessione.";
    }
    console.error("claude failed", reason, err?.message);
    // Keep the app working: write the note with Cloudflare's model and say why.
    if (env.AI && !image) return runWorkersAI(env, messages, quick, reason);
    return json({ code: "upstream_error", error: reason }, 502);
  }
}
