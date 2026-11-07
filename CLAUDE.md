# Dictax

Voice-to-text web app (PWA) in Italian. The owner (non-technical) asks for changes in chat; Claude edits the code and pushes to `main`. Cloudflare Pages deploys `main` automatically. Write replies to the owner in Italian, plain language, no jargon.

## Stack
- `public/index.html`: the whole front end (single file: HTML, CSS, JS). No build step, no framework.
- `functions/api/*.js`: Cloudflare Pages Functions. `transcribe.js` (Workers AI Whisper, `env.AI`), `ai.js` (Claude via `@anthropic-ai/sdk`, key in secret `ANTHROPIC_API_KEY`), `health.js`.
- `lib/util.js`: shared helpers (JSON responses, optional `ACCESS_CODE` gate via `x-access-code` header).
- `wrangler.toml`: Pages config (source of truth for bindings and vars; secrets live in the Cloudflare dashboard).
- Data is in `localStorage` (prefix `dx1_`, per profile `note_`/`creator_`). Supabase auth and DB are planned next.

## Product rules
- Two separate profiles: **Note** (AudioPen-like) and **Creator** (creators, social media managers). Each has its own notes, styles, folders and formats.
- "Pro" features are free for now but marked with the `.planBadge` label so they can be gated later.
- Brand: white background, green accent `#1e9a55`, fonts Young Serif / Figtree / JetBrains Mono.
- Do not copy AudioPen's texts, illustrations or look; functional ideas only.

## Checks before pushing
- `node --check` on the page script (extract the `<script>` block) and `npx wrangler pages functions build --outdir=.build`.
- Test the page with Playwright at 390px width: no console errors, no horizontal scroll.
