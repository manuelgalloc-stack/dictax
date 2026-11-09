import { json, claudeKey } from "../../lib/util.js";

// Tells the app which features the server has configured. Contains no secrets.
export function onRequestGet({ env }) {
  return json({
    transcribe: Boolean(env.AI),
    rewrite: Boolean(claudeKey(env) || env.AI),
    rewriteEngine: claudeKey(env) ? "claude" : env.AI ? "cloudflare" : "none",
    locked: Boolean(env.ACCESS_CODE),
  });
}
