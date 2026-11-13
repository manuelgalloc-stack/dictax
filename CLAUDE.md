# Dictax

Voice-to-text web app (PWA) in Italian. The owner (non-technical) asks for changes in chat; Claude edits the code and pushes to `main`. Cloudflare Pages deploys `main` automatically. Write replies to the owner in Italian, plain language, no jargon.

## Stack
- `public/index.html`: the whole front end (single file: HTML, CSS, JS). No build step, no framework.
- `functions/api/*.js`: Cloudflare Pages Functions. `transcribe.js` (Workers AI Whisper, `env.AI`), `ai.js` (Claude via `@anthropic-ai/sdk`, key in secret `ANTHROPIC_API_KEY`), `health.js`.
- `lib/util.js`: shared helpers (JSON responses, optional `ACCESS_CODE` gate via `x-access-code` header).
- `wrangler.toml`: Pages config (source of truth for bindings and vars; secrets live in the Cloudflare dashboard).
- Data is in `localStorage` (prefix `dx1_main_`), synced to Supabase when signed in.
- Supabase project `dictax` (ref `kzrxedaahwgltzrbuctl`, eu-west-1): email sign-in (magic link or 6-digit code, no password) via supabase-js UMD loaded on demand; table `public.user_data(user_id,key,value jsonb,updated_at)` with RLS own-rows. The `raw.set` hook marks `SYNC` keys dirty and pushes; pull merges `main_notes`/`main_money` by id (newer `up` wins, tombstones in `main_dels`), other keys last-write-wins. Account button `#accBtn` top right, view `#v-account`.

## Product rules
- One app with a **Creator** switch: the base (Note) has the standard formats, styles and folders; turning Creator on adds social formats, extra styles, content folders and the brand-voice tab. Notes are shared (storage prefix `dx1_main_`).
- Keep the UI simple and large (big buttons and icons); advanced settings live under "Altre opzioni".
- Desktop (>=980px): two columns, recorder/composer on the left (sticky, `.homeLeft`), notes in a card grid on the right (`.homeRight`). Phone layout unchanged.
- First open shows `#welcome` ("Come userai Dictax?": Uso personale / Creator singolo / Creator con clienti), saved as `uso` and changeable from the profile; `setUso()` sets mode and `ckind`.
- Creator has two kinds (`ckind`, segment `#kindSeg` in the profile view `#v-account`, opened by the top-right button): **Creator singolo** (`solo`: body `.solo`, clients hidden, the Clienti tab becomes "Brand" with the creator's own positioning stored as profile `__me`, used via `ctxFor()` in every social prompt) and **Gestisco clienti** (`agency`, default). In Chiedi, agency mode shows `#qClient` to pick a client: context is limited to that client's notes plus its positioning, and content requests use the ManuLab voice.
- Clients are optional: toggle "Usa i clienti" in Altre opzioni (`dx1_useClients`, default on); off adds `body.noClients`, which hides every `.cliOpt`.
- **Conti** tab (both modes): income/expenses in `store` key `money` ([{id,k:in|out,v,c,t,d}]), month switcher, 6-month SVG bar chart, expenses by category, AI tips button.
- **Clienti** tab (Creator; the old Voce view, brand voice stays below): client profiles in `store` key `clients` ({name:{niche,target,offer,zone,avoid,pos,up}}); "Genera il posizionamento" builds a ManuLab positioning (north-star, pillars, tone, words, TOFU/MOFU/BOFU ideas); `clientCtx(cl)` injects it into social content prompts. "Trova le idee" extracts 6 TOFU/MOFU/BOFU ideas (saved in the profile `ideas`); "Crea il contenuto" makes a Contenuto note for that client with status In creazione.
- Content notes have a status `n.st` (idea/lavoro/fatto) and publish date `n.pub` (YYYY-MM-DD), set in the detail view; "Fatto" sets today if empty. `#v-cal` month calendar (button `#calOpen`, Creator only) shows them.
- Creation flow: record (or type) -> the "Che cos'è?" sheet asks the type: **Nota** (green, clean text), **To-do list** (internally `attivita`, blue, a real checklist: `n.tasks=[{t,done}]`, tick/add/delete; skips the level step), **Contenuto** (purple, social formats; Creator only). Second step "Come la scrivo?": **Semplice / Media / Elaborata** (rewrite level, remembered). Optional **Cliente** per note; the home list filters by type and by client (dropdown). No folders.
- **Creator Pro** (free for now, flag `CREATOR_PRO`): every social content (captions, scripts, carousels, ganci...) is written with the `MANULAB_VOICE` rules (Triplo Gancio method) by default, via `useML(k)`. The old "Riscrivi con la voce ManuLab" button is hidden (`if(false&&...)`); re-enable it if the voice becomes a paid extra.
- Each note shows its date and age ("3 giorni fa"); it turns red after N days (setting in "Altre opzioni", default 7).
- "Pro" features are free for now but marked with the `.planBadge` label so they can be gated later.
- Brand: white background, green accent `#1e9a55`, fonts Young Serif / Figtree / JetBrains Mono.
- Do not copy AudioPen's texts, illustrations or look; functional ideas only.

## Checks before pushing
- `node --check` on the page script (extract the `<script>` block) and `npx wrangler pages functions build --outdir=.build`.
- Test the page with Playwright at 390px width: no console errors, no horizontal scroll.
