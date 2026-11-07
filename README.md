# Dictax

Dictax trasforma la voce in testi pronti: registri, l'app trascrive e poi riscrive il testo nel formato e nello stile che scegli.

- **Profilo Note**: testo pulito, email, attività, verbali, riassunti, diario, più i formati per mestiere (commerciale, avvocato, terapeuta, scrittore, memorie, agente immobiliare).
- **Profilo Creator**: post LinkedIn, caption Instagram e TikTok, caroselli, script per reel, ganci, newsletter, idee e piano settimanale, con la voce di brand.
- In entrambi: stili personalizzati, cartelle, tag, ricerca, super note, chat con le note, controllo di fedeltà ed export Markdown per Obsidian.

## Come è fatta

| Parte | Dove | Servizio |
|---|---|---|
| App (pagina installabile sul telefono) | `public/` | Cloudflare Pages |
| Trascrizione voce → testo | `functions/api/transcribe.js` | Cloudflare Workers AI (Whisper) |
| Riscrittura e funzioni AI | `functions/api/ai.js` | Claude API |
| Stato del server | `functions/api/health.js` | — |

Per ora note e impostazioni restano nel browser di chi usa l'app. Login e salvataggio online (Supabase) arrivano nel prossimo passo.

## Pubblicazione su Cloudflare (una volta sola)

1. Su [dash.cloudflare.com](https://dash.cloudflare.com): **Workers & Pages** → **Crea** → scheda **Pages** → **Collega a Git**.
2. Scegli l'archivio `dictax`.
3. Impostazioni di build:
   - Framework: **Nessuno**
   - Comando di build: `npm install`
   - Cartella di output: `public`
4. Premi **Salva e distribuisci**.
5. Nel progetto, vai in **Impostazioni** → **Variabili e segreti** e aggiungi come **Segreto**:
   - `ANTHROPIC_API_KEY`: la chiave di Claude (da console.anthropic.com), serve per la riscrittura.
   - `ACCESS_CODE` (consigliato durante la prova): un codice a tua scelta. Chi apre l'app deve inserirlo, così nessun estraneo consuma i tuoi crediti.
6. Fai una nuova distribuzione (Deployments → Riprova la distribuzione) perché i segreti abbiano effetto.

Da quel momento ogni modifica salvata nel ramo `main` viene pubblicata da sola.

## Impostazioni nel codice

In `wrangler.toml`:
- `CLAUDE_MODEL`: il modello di Claude usato per la riscrittura (`claude-opus-5-5`). Per spendere meno si può usare `claude-sonnet-5-5` o `claude-haiku-5-5`.
- La trascrizione usa `@cf/openai/whisper-large-v3-turbo`.

## Sviluppo in locale

```bash
npm install
npx wrangler pages dev
```

La trascrizione in locale richiede un token Cloudflare (`CLOUDFLARE_API_TOKEN`). I segreti locali vanno in un file `.dev.vars`, che non viene salvato su GitHub.
