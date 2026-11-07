import { json } from "../../lib/util.js";

// Tells the app which features the server has configured. Contains no secrets.
export function onRequestGet({ env }) {
  return json({
    transcribe: Boolean(env.AI),
    rewrite: Boolean(env.ANTHROPIC_API_KEY),
    locked: Boolean(env.ACCESS_CODE),
  });
}
