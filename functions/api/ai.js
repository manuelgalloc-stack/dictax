import Anthropic from "@anthropic-ai/sdk";
import { json, checkAccess } from "../../lib/util.js";

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

export async function onRequestPost({ request, env }) {
  const denied = checkAccess(request, env);
  if (denied) return denied;

  if (!env.ANTHROPIC_API_KEY) {
    return json({ code: "not_configured", error: "Manca la chiave di Claude sul server." }, 503);
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
  const model = env.CLAUDE_MODEL || "claude-opus-5-5";
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

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
    if (err instanceof Anthropic.RateLimitError) {
      return json({ code: "rate_limited", error: "Troppe richieste." }, 429);
    }
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("Claude authentication failed");
      return json({ code: "not_configured", error: "Chiave di Claude non valida." }, 503);
    }
    if (err instanceof Anthropic.BadRequestError) {
      console.error("Claude bad request", err.message);
      return json({ code: "invalid_request", error: "Richiesta non valida." }, 400);
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Claude API error", err.status, err.message);
      return json({ code: "upstream_error", error: "Servizio AI non disponibile." }, 502);
    }
    console.error("ai failed", err);
    return json({ code: "upstream_error", error: "Servizio AI non disponibile." }, 502);
  }
}
