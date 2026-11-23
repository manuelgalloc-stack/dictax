// Helpers shared by the API functions in functions/api/.

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

// While Dictax is in private testing, the ACCESS_CODE secret protects the
// paid endpoints (transcription and AI). Without the secret, they are open.
export function checkAccess(request, env) {
  const required = env.ACCESS_CODE;
  if (!required) return null;
  const given = request.headers.get("x-access-code") || "";
  if (given !== required) {
    return json({ code: "locked", error: "Codice di accesso mancante o errato." }, 401);
  }
  return null;
}

// Since 22 nov the paid endpoints need a signed-in Dictax user: the page sends the
// Supabase access token as "Authorization: Bearer …" and we check it with Supabase.
// A valid ACCESS_CODE still works (owner tests). If Supabase cannot be reached we let
// the request through rather than lock everybody out; a token Supabase rejects is refused.
const okTokens = new Map();
export async function checkUser(request, env) {
  if (env.REQUIRE_LOGIN === "off") return checkAccess(request, env);
  const code = request.headers.get("x-access-code") || "";
  if (env.ACCESS_CODE && code === env.ACCESS_CODE) return null;
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json({ code: "login", error: "Entra con la tua email per usare Dictax." }, 401);
  const now = Date.now(), hit = okTokens.get(token);
  if (hit && hit > now) return null;
  const url = env.SUPABASE_URL, key = env.SUPABASE_KEY;
  if (!url || !key) return null;
  try {
    const r = await fetch(url.replace(/\/$/, "") + "/auth/v1/user", { headers: { apikey: key, authorization: "Bearer " + token } });
    if (r.status === 401 || r.status === 403) return json({ code: "login", error: "Accesso scaduto: entra di nuovo con la tua email." }, 401);
    if (r.ok) { if (okTokens.size > 500) okTokens.clear(); okTokens.set(token, now + 5 * 60 * 1000); }
    return null;
  } catch { return null; }
}

// The Claude key secret. ANTHROPIC_API_KEY is the standard name; "claude key"
// is the name the owner used when saving it in the Cloudflare dashboard.
export function claudeKey(env) {
  return env.ANTHROPIC_API_KEY || env["claude key"] || "";
}
