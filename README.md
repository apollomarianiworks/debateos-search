# DebateOS Search

A credibility-focused desktop search engine for competitive debate research. Built with Tauri v2, React, and TypeScript.

---

## Requirements

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| Rust / Cargo | 1.70+ |
| WebView2 | (pre-installed on Windows 10/11) |

---

## Development

```bash
npm install
npm run tauri dev       # desktop app with hot reload
npm run dev             # browser-only frontend (demo mode only)
npm run typecheck
npm run build           # tsc + vite production build
```

---

## Build (MSI installer)

```bash
npm run tauri build
# → src-tauri/target/release/bundle/msi/DebateOS Search_0.1.0_x64_en-US.msi
# → src-tauri/target/release/bundle/nsis/DebateOS Search_0.1.0_x64-setup.exe
```

### What installation gives the user

- **Start Menu entry**: "DebateOS Search" (per `productName` in `tauri.conf.json`).
- **Launches as a normal Windows app** — no terminal, no dev commands required after install.
- **Persists between launches**:
  - `%APPDATA%\com.debateos.search\settings.json` — API key, provider, mode, results-per-page
  - WebView2 IndexedDB / localStorage — search-result cache, source registry overrides, local document index, last query
- **Uninstall**: standard Windows Add/Remove Programs (MSI) or `Uninstall DebateOS Search.exe` (NSIS). The user's `settings.json` is preserved by default; cache/index live in the WebView2 user data dir and are cleared with the app.

### Automatic updates — wired, but needs hosting

The `tauri-plugin-updater` plugin **is fully integrated** as of this build:

- ✅ Plugin registered in `src-tauri/src/lib.rs`
- ✅ Signing keypair generated; public key embedded in `tauri.conf.json`; private key gitignored at `.tauri/signing.key`
- ✅ `bundle.createUpdaterArtifacts: true` — every build produces signed `.sig` files alongside the MSI/NSIS installers
- ✅ Settings → **About & Updates** shows the current version, a **Check for updates** button, progress UI, and clear error states
- ✅ No startup popups — checks are user-initiated
- ✅ Successful updates restart the app automatically (via `tauri-plugin-process`)

**Hosting target: GitHub Releases.** The endpoint is pre-configured in `tauri.conf.json`:

```
https://github.com/YOUR-ORG/debateos-search/releases/latest/download/latest.json
```

`releases/latest/download/` auto-resolves to the newest release, so the URL never has to change per release. The HTTP capability allowlist already includes `github.com`, `objects.githubusercontent.com`, and `api.github.com`.

**Per release** — bump version in three files, build signed installers, generate the manifest, and create the GitHub release:

```bash
# 1. Build signed MSI + NSIS (uses TAURI_SIGNING_PRIVATE_KEY from .tauri/signing.key)
npm run tauri build

# 2. Generate release/latest.json from the .sig file
npm run release:manifest -- --repo=YOUR-ORG/debateos-search --installer=nsis

# 3. Tag, push, create the GitHub release, upload installer + .sig + latest.json
```

Full step-by-step in [RELEASE.md](RELEASE.md).

Until `YOUR-ORG` is swapped for a real GitHub org/user and the first release is published, the **Check for updates** button shows a truthful "Update server isn't reachable from this build — see RELEASE.md" message instead of pretending the system works.

---

## In-app result viewer

Clicking a result title doesn't shell out to Chrome / Edge / your default browser. It navigates to `/viewer?url=...&title=...&domain=...` and renders the page **inside DebateOS Search** in a sandboxed iframe.

The viewer toolbar always shows three controls:

- **← Back** — returns to the results list
- **Open in window** — creates a real Tauri `WebviewWindow`. Use this when a site refuses iframe embedding (`X-Frame-Options: DENY` or a strict `frame-ancestors` CSP). The child window is a proper desktop window, not a new browser tab.
- **Open externally** — last-resort handoff to the system default browser (`@tauri-apps/plugin-shell`)

If the iframe hasn't reported a `load` event after 4 s, a gentle inline banner appears suggesting the user try "Open in window" or "Open externally" — without auto-redirecting them out of the embedded view.

Sandbox attributes on the iframe: `allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox`. Referrer policy: `no-referrer`.

---

## Search verticals

Nine verticals across the top of the results page — each one runs a different mix of providers and surfaces different card types:

| Vertical | Providers used | Cards rendered |
|---|---|---|
| **All** | primary web + Wikipedia + Local Index | mix: web / person / stat / image |
| **Web** | primary web + Local Index | web |
| **Images** | Brave Images (if key supports it) + Wikipedia (thumbnails) + Mock | image (grid layout) |
| **People** | Wikipedia (person-hint) + primary web | person + web |
| **Stats** | primary web + Mock (stat data) + Local Index | stat / dataset / chart |
| **Academic** | arXiv + Wikipedia + primary web | web |
| **Government** | CourtListener + primary web | web (gov-tier sources first) |
| **News** | primary web | web (news variant) |
| **Fact Checks** | primary web + Local Index (factcheck sources) | web |

Switching vertical re-runs the search with that vertical's provider mix — results don't just get filtered client-side; we actually call different providers.

## Result types (discriminated union)

`SearchResult` is now a discriminated union keyed on `resultType`:

- `web` / `news` — standard SERP-style card with title, snippet, credibility badge, rank breakdown
- `image` — thumbnail + caption, rendered in a grid for the Images vertical
- `person` — avatar + name + occupation + lifespan + "known for"
- `stat` — large numeric value + metric label + unit/year/trend
- `dataset` — title + organization + available formats + last-updated date
- `chart` — chart-type glyph + title + data source

`RankedResult` is the union × the ranking enrichment, so narrowing on `result.resultType` still works through the entire pipeline.

## Free / no-key providers

These work out of the box, zero configuration:

- **Wikipedia** (en.wikipedia.org) — opensearch + summary endpoints. Top hit becomes a Person card for biographical queries, otherwise a Web card with an extract. Thumbnails surfaced in the Images vertical.
- **arXiv** — preprint search via the official `export.arxiv.org/api/query` endpoint (Atom XML, parsed with DOMParser). Active in the Academic vertical.
- **CourtListener** — case law opinions via the Free Law Project REST API. Active in the Government vertical.
- **Mock / Demo** — the built-in curated provider, now varies result types based on query intent so the demo experience feels broad.
- **Local Index** — your indexed documents (Sources page), always available if you've indexed anything.

## Optional / requires API key

- **Brave Search API** — primary web provider. Free tier 2k queries / month.
- **Brave Images Search** — same key, but the Images endpoint may require a paid plan. If your key is rejected (401/403) the app surfaces a clear message instead of silently failing.

## Query intent + automatic vertical hint

The intent detector recognizes:

- `who is X` / `biography of X` → **People** vertical
- `pictures of X` / `images of X` / `photos of X` → **Images** vertical
- `statistics on X` / `crime rate` / `unemployment` / `inflation` → **Stats**
- `chart` / `graph` / `bar chart` → **Stats**
- `study` / `research` / `peer reviewed` / `arxiv` → **Academic**
- `court case` / `v.` / `supreme court` / `constitution` → **Government**
- `fact check` / `debunk` / `is it true` → **Fact Checks**
- `breaking` / `latest` / `today` → **News**
- `what is` / `definition of` / `meaning of` → light freshness weight, normal vertical

This drives both the suggested-vertical hint and the freshness weighting inside ranking.

---

## Three search inputs, one pipeline

DebateOS Search blends results from three independent providers through a single ranking pipeline.

| Provider | Role | Configured by |
|---|---|---|
| **Brave Search** | Live web results | API key in Settings |
| **Demo** | Curated sample results | Always available (no setup) |
| **Local Index** | Pages you have indexed from trusted sources | Sources page |

The web provider (Brave or Demo) and the Local Index always run **in parallel** when you search — local matches are merged into the same ranked list. Failures in one provider never block the others.

---

## Sources & local indexing

The **Sources page** (`/sources`, or the bookmark icon on the homepage) is where you manage what gets indexed locally.

### What ships out of the box

A small curated default list of ~35 high-quality sources across:

- **Government / Statistics** — BLS, Census, CDC, CBO, GAO, NIH, EPA, BJS, Federal Reserve
- **International** — IMF, World Bank, OECD, UN, WHO, IEA
- **Academic / Research** — Brookings, RAND, Pew, KFF, NBER, Urban Institute, Stanford HAI
- **Fact-check** — PolitiFact, FactCheck.org, Snopes, Full Fact
- **News (wire / quality)** — Reuters, AP, BBC, NPR, ProPublica
- **Legal** — Congress.gov, CourtListener, Justia
- **Economics / Data** — FRED, OpenSecrets

Defaults are **enabled but not indexed** on first install. Nothing crawls automatically.

### To index a source

1. Open the app → click the **bookmark icon** (top-right of homepage) or **Settings → Open sources manager**.
2. Find or add a source.
3. Click **Index** on the row.

The crawler will:
- Resolve and respect the site's `robots.txt` for the `DebateOSSearchBot` user-agent (falls back to `*`)
- Fetch the page through a Rust-side reqwest client (SSRF-protected, 15s timeout, 2 MB cap, follows up to 5 redirects)
- Extract `<title>`, meta description, canonical URL, published date, and the body text of `<main>` / `<article>` / `<body>`
- Save up to ~4 KB of search text + a polished snippet to the local index

The crawler is intentionally minimal. **One URL at a time. No link-following. No auto-runs. No scheduled crawls.** When you batch-index, requests are spaced 1.5s apart by default.

### To add a custom source

On the Sources page, click **+ Add source** and enter a URL. The source type is auto-detected from the domain (e.g. `.gov` → government, `politifact.com` → fact-check). Custom sources are tagged with a **Custom** badge and can be removed with one click (their documents are also removed).

### What the local index stores

Per indexed document:

```
id, url, canonicalUrl, domain, title, snippet (≤ 400 chars),
searchText (≤ 4 KB), sourceType, credibilityTier, sourceRegistryId,
indexedAt, publishedDate, tags
```

Storage: `localStorage` key `debateos:local-index-v1`, up to 500 documents with LRU eviction. The API surface is narrow specifically so this can move to SQLite/FTS later without touching call sites.

---

## Search modes

Near the category tabs there's a small toggle: **Standard | Research**.

- **Standard** — Balanced ranking. Used by default.
- **Research** — Adds an `+18` bonus to results with sourceType ∈ {government, statistics, academic, legal, factcheck} and a `-8` penalty to general web. Same ranking formula, different weights.

The mode is saved in Settings and persisted across sessions.

---

## Hybrid search flow

```
User query
    │
    ▼
useSearch hook (runHybridSearch)
    │
    ├─ Web provider:   Brave OR Demo  ─┐
    │                                  │
    └─ Local Index    (always if has docs) ─┐
                                            ▼
                              Each result set → search-engine
                                  (normalize → intent → rank →
                                   credibility → freshness → mode bonus)
                                            │
                                            ▼
                                  mergeRankedResults
                                  (dedupe by URL + (domain,title))
                                            │
                                            ▼
                                  cache + render
```

A failure in the web provider doesn't break the Local Index path, and vice versa (`Promise.allSettled`). Stale-while-revalidate and stale-if-error semantics from Pass 2 still apply.

---

## How to add a Brave API key

1. Settings → paste the key into **Brave Search API key**.
2. Click **Test key** to verify.
3. Switch **Active provider** to `Brave Search API` → **Save**.

If the key is missing/invalid/rate-limited, the app automatically falls back to demo mode with a friendly inline notice. Keys live in `%APPDATA%\com.debateos.search\settings.json` and are sent only to `api.search.brave.com`.

---

## Layered architecture

```
src/
├── providers/                # SearchProvider implementations
│   ├── types.ts              # raw SearchResult; no scoring lives here
│   ├── MockProvider.ts
│   ├── BraveProvider.ts
│   ├── providerFactory.ts
│   └── providerErrors.ts
│
├── search-engine/            # all scoring + ranking + caching
│   ├── types.ts              # RankedResult, CacheEntry, RankExplanation, SearchMode
│   ├── normalize.ts          # tokenize, detectIntent
│   ├── credibility.ts        # tiered domain map + TLD rules
│   ├── freshness.ts          # intent-aware scoring
│   ├── ranking.ts            # rankResults() — formula
│   ├── mergeResults.ts       # dedupe across providers
│   └── cache.ts              # localStorage, TTL, LRU
│
├── source-registry/          # NEW — curated + user-added sources
│   ├── types.ts
│   ├── defaultSources.ts     # ~35 curated entries
│   ├── sourceRegistry.ts     # CRUD + overrides for defaults
│   ├── sourceClassifier.ts   # domain → sourceType + tier guess
│   ├── indexSource.ts        # crawl → extract → upsertDocument
│   └── index.ts
│
├── local-index/              # NEW — searchable local doc store
│   ├── types.ts
│   ├── tokenizer.ts          # tokenize + stopwords
│   ├── localIndex.ts         # upsert/list/remove/stats, localStorage-backed
│   ├── searchLocalIndex.ts   # token-frequency search
│   ├── LocalIndexProvider.ts # SearchProvider adapter
│   └── index.ts
│
├── crawler/                  # NEW — controlled, manually-triggered
│   ├── types.ts              # ExtractedPage, CrawlError
│   ├── crawlerTransport.ts   # single chokepoint → Rust fetch_url
│   ├── robots.ts             # minimal robots.txt parser
│   ├── extractPage.ts        # DOMParser title/meta/canonical/body
│   ├── crawler.ts            # crawlOne + crawlBatch (rate-limited)
│   └── index.ts
│
├── hooks/
│   ├── useSearch.ts          # hybrid pipeline orchestrator
│   └── useSettings.ts
│
├── pages/
│   ├── Home.tsx
│   ├── Results.tsx           # + ResearchModeToggle in toolbar
│   ├── Settings.tsx          # + link to Sources page
│   └── Sources.tsx           # NEW — source manager UI
│
├── components/
│   ├── …existing…
│   └── ResearchModeToggle.tsx  # NEW
│
├── store/appStore.ts
└── styles/globals.css

src-tauri/
├── src/commands/
│   ├── settings.rs           # + search_mode field
│   ├── history.rs
│   └── crawler.rs            # NEW — fetch_url with SSRF protection
├── src/lib.rs                # registers fetch_url, plugins
└── capabilities/default.json # HTTP plugin scoped to api.search.brave.com only
```

---

## Safety / what we explicitly do NOT do

- ❌ No AI summaries, embeddings, or vector DB
- ❌ No Common Crawl, no cloud backend, no accounts
- ❌ No automatic / scheduled crawling
- ❌ No deep crawling — only the URL you explicitly approve, and only that URL
- ❌ No raw page dumps — we keep ≤4 KB of search text + a snippet per doc
- ❌ No fetches against `localhost`, `127.*`, `10.*`, `192.168.*`, `172.16-31.*`, `169.254.*`, `100.64.*` (Rust-side SSRF check)
- ❌ No non-HTML/XML content types accepted
- ❌ Crawler ignores responses larger than 2 MB
- ❌ Tauri HTTP allowlist for the frontend is scoped to `api.search.brave.com` only — all other HTTP must go through the Rust `fetch_url` command

---

## Pass roadmap

| Pass | Status | Scope |
|------|--------|-------|
| Pass 1 | ✅ | Desktop shell, mock provider, premium UI, store |
| Pass 2 | ✅ | Brave API, ranking, credibility, freshness, cache, onboarding |
| **Pass 3** | ✅ | Source registry, local index, controlled crawler, hybrid search, research mode |
| Opus review | Planned | Architecture / UX / consistency review |
| Codex review | Planned | Security, Tauri permissions, build reliability, MSI packaging |

---

## Persistence summary

| What | Where |
|---|---|
| Settings (API key, provider, search mode, etc.) | `%APPDATA%\com.debateos.search\settings.json` (Tauri command) |
| Search result cache | `localStorage` key `debateos:cache-v1` (50-entry LRU) |
| Source registry | `localStorage` key `debateos:source-registry-v1` |
| Local document index | `localStorage` key `debateos:local-index-v1` (500-doc LRU) |
| Last query (for "Continue from…") | `localStorage` key `debateos:last-query` |

A corrupted localStorage blob in any of those keys is treated as empty — the app never crashes on startup.
