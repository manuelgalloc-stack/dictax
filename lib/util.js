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
