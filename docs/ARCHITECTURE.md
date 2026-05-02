# RodBooks — Architecture & Code Review

This document is the canonical reference for the RodBooks codebase. It exists because the app grew from a one-shot static site into ~30 modules + 23 view files across seven shipped phases, and tracing intent from imports alone is now expensive.

> **Also see:** the original 100-feature backlog is at the top of `/root/.claude/plans/do-competitor-analysis-and-encapsulated-tide.md` (off-repo).

---

## 1. Overview

RodBooks is a **static, single-page, AI-first creator-business app**. Zero backend. Zero build step. Zero npm install. Everything runs from `localStorage` in the browser, deploys to GitHub Pages on every push to `main`, and works on desktop + mobile (PWA-installable).

```
            ┌─────────────────────────────────────┐
            │  index.html (shell)                 │
            │  ┌─────────┐  ┌────────────────────┐│
            │  │ sidebar │  │ topbar             ││
  user      │  │  + nav  │  │ ┌────────────────┐ ││
  click  ──▶│  │ groups  │  │ │ #view (outlet) │ ││
            │  └─────────┘  │ │  ← view render │ ││
            │  ┌─────────┐  │ └────────────────┘ ││
            │  │ tabbar  │  │                    ││
            │  │ (mobile)│  └────────────────────┘│
            │  └─────────┘                        │
            └─────────────────────────────────────┘
                          │
                          ▼
                  app.js (router + topbar wiring)
                          │
                          ▼
              router.js  →  view function (e.g. dashboard())
                          │
                          ▼
         store.js  ←──────┴────→  ui.js / utils.js / forms.js
       (in-memory cache         (modals, toasts, formatters,
        + localStorage)          DOM-builder helpers)
                ▲ subscribers
                │
        every save fans out to subscribers,
        which trigger re-render of the active view
```

### Data flow on a click

1. User clicks **+ New deal** → `forms.js: openDealForm()` mounts a modal.
2. Save → `Deals.save(item)` → `upsertCollection` in `store.js` → write to `localStorage` → `subscribers.forEach(fn => fn(state))`.
3. The dashboard / list view's `subscribe(render)` callback fires → re-renders with fresh data.
4. The `Activity` log captures the create automatically; snapshots can be taken anytime via Settings.

### Init sequence (`app.js` top-down)

1. Apply theme (CSS-variable swap).
2. Apply density mode.
3. If passcode lock is enabled, show lock screen.
4. If the localStorage blob starts with `enc:v1:`, show vault unlock screen.
5. Register service worker (`sw.js`).
6. Capture `beforeinstallprompt` → palette command "Install RodBooks".
7. Run scheduler — materialise any due deal-template instances.
8. Drain offline-capture queue if online.
9. Register all routes; start router.
10. Wire topbar + sidebar profile switcher + nav-badge updater.
11. Bind keyboard shortcuts.

---

## 2. File-by-file responsibilities

### Root

| File | Purpose |
|---|---|
| `index.html` | SPA shell: topbar, sidebar (grouped: AI / Books / Reports / System), `#view` outlet, mobile tabbar (12 items, 6×2 grid), modal + toast roots. |
| `styles.css` | All styling. CSS custom properties for theming; `[data-theme="light"]` overrides; `[data-density="compact"]` table tightening. |
| `manifest.webmanifest` | PWA install metadata. Description leads with AI features. |
| `sw.js` | Service worker. Cache-first shell, network-first same-origin JS, stale-while-revalidate for CDN. **Cache name is versioned** (`rodbooks-shell-vN`) — bump on shell changes. |
| `.nojekyll` | Stops GH Pages from running Jekyll on the repo. |

### Core (`js/`)

| File | Purpose |
|---|---|
| `app.js` | Entry point. Imports every view, registers routes, wires topbar buttons (palette / density / help / quick-add), profile switcher, nav badges, keyboard shortcuts (`?`, `Cmd+K`, `n`, `g`-chords), PWA + offline-queue init. |
| `router.js` | Hash router. Routes can be `/path` or `/path/:param`. Supports `?key=value` query strings via `getQuery()` / `setQuery()`. Exports `register`, `start`, `go`. |
| `store.js` | Single source of truth. Manages 25 collections + Settings. `upsertCollection` → activity log + subscriber broadcast. Encryption-at-rest support via `cryptoVault.js`. Multi-profile via `profiles.js`. |
| `ui.js` | Reusable modals (`openModal`), toast (`toast`), confirm dialog (`confirmDialog`). |
| `utils.js` | Format helpers (`fmtMoney`, `fmtDate`, `fmtMoneyShort`, `fmtDateShort`), DOM DSL (`el`), date math (`addDays`, `parseDate`, `quarterOf`), business helpers (`netFee`, `dealStatus`, `serviceMeta`, `dealStageAge`, `brandWarmth`, `brandHealth`, `lastTouchedAt`, `dueDate`, `daysPastDue`, `lateFee`, `agingBucket`, `dsoOf`), `parseSearchOperators`, `csvFromString`, `escHtml`/`escapeHtml`. |
| `forms.js` | Form builders for Deal / Bill / Contact / quick-add. Owns the largest forms in the app. Plugs into camera/OCR (`ocr.js`), NL parser (`nl.js`), vendor-rule learning (`store.js`). |

### UX & preferences

| File | Purpose |
|---|---|
| `theme.js` | dark / light / auto theme toggle. Listens to `prefers-color-scheme`. |
| `prefs.js` | Density + recently-viewed list. |
| `lock.js` | UI-only passcode gate (SHA-256, NOT encryption — see `cryptoVault.js` for the real thing). |
| `palette.js` | `Cmd+K` palette. Searches deals + brands + contacts + bills + pages + commands + recently-viewed. AI commands kind:"AI". |
| `help.js` | `?` shortcut overlay listing every keyboard binding. |

### Data, integration, AI

| File | Purpose |
|---|---|
| `synth.js` | Deterministic 6-year fictional dataset for first-run / demo. |
| `profiles.js` | Multi-entity vault scaffolding. Each profile keys its own localStorage blob via `dataKeyFor(id)`. |
| `cryptoVault.js` | AES-GCM 256 encryption-at-rest. PBKDF2-SHA256 (200k iterations). |
| `offlineQueue.js` | IndexedDB queue for receipt photos taken offline; drained on `online` event. |
| `ics.js` | Build `.ics` calendar exports of deal milestones. |
| `ofx.js` | Parser for OFX 1.x (SGML) and 2.x (XML) bank statements. |
| `ocr.js` | Lazy-loads `tesseract.js` and parses receipt images → `{vendor, amount, date}`. |
| `share.js` | Build accountant share-bundle (HTML report + CSVs + JSON ZIP via JSZip). |
| `digest.js` | Render the weekly digest as printable HTML / PDF. |
| `automations.js` | Generates 11 kinds of automation proposals from data (overdue, recurring fill, repeat-brand tier, draft reminders, invoice-# backfill, dormant outreach, code normalization, tax reserve, subscription price-change, anomalies, paid-date inference). |
| `scheduler.js` | One-shot scheduler invoked at app boot. Materialises new deals from active `dealTemplates`. |
| `aiActions.js` | LLM-backed surfaces: brief summarizer (#85), deal grader (#86), coach mode (#89). All gracefully degrade if no LLM key. |
| `llm.js` | Provider-agnostic LLM client (Anthropic / OpenAI / Google / Ollama). Reads from `Settings.connect.llm`. |
| `nl.js` | Natural-language deal-text parser. |

### Views (`js/views/`)

23 views, each export a default function returning `{ node, unmount }`. Pattern: subscribe on render, unsubscribe on unmount.

| Route | View | Purpose |
|---|---|---|
| `/` `/dashboard` | `dashboard.js` | KPIs, AI co-pilot strip, Tableau-style cross-filters, charts. |
| `/deals` `/deals/:id` | `deals.js` | List + detail. Smart-fee suggestion, deliverables, partial-payments, disputes. |
| `/brand/:name` | `brand.js` | Brand drill-down: lifetime KPIs, 24-mo chart, audience snapshots, testimonials. |
| `/pipeline` | `kanban.js` | Drag-to-advance deal-stage board. |
| `/timeline` | `timeline.js` | Month calendar + year Gantt of deal milestones. Also exports `dealStageTracker`. |
| `/booking` | `booking.js` | Per-day availability heatmap; manual block / unblock. |
| `/invoices` | `invoices.js` | Invoice list, batch retainer generator, PDF / ICS / Print, mailto reminder. |
| `/bills` | `bills.js` | Expense list + receipt gallery modal. |
| `/banking` | `banking.js` | Accounts / ledger / vendor rules / matcher / reconciliation. |
| `/income` | `income.js` | Affiliates, tips, AdSense importer, UTM link generator. |
| `/mileage` | `mileage.js` | Trip log with Maps deep links. |
| `/contacts` | `contacts.js` | Contact list with last-touched + brand-health pills. |
| `/automations` | `automations.js` | Proposal cards. |
| `/templates` | `templates.js` | Contract + outreach template library. |
| `/contracts` | `contracts.js` | Risk-clause flagger + AI redline ("Ask AI"). |
| `/inbox` | `inbox.js` | Sponsorship request paste-import. |
| `/mediakit` | `mediakit.js` | Public-ready media-kit HTML/PDF generator. |
| `/connect` | `connect.js` | Plaid / Stripe / Dropbox-Sign / LLM API keys. |
| `/activity` | `activity.js` | Audit log feed. |
| `/reports` | `reports.js` | P&L, quarterly tax, margin-by-service, cohort, DSO, aging, profit attribution. |
| `/reports/custom` | `custom-report.js` | Pivot table builder. |
| `/tax` | `tax.js` | Tax workbench: Schedule C, SE, state, sales tax, depreciation, 1099. |
| `/settings` | `settings.js` | Business profile, profiles, lock, encryption, snapshots, CSV import, theme. |

---

## 3. Data model

### Core collections

| Collection | Key fields |
|---|---|
| `deals` | `id`, `contactId`, `company`, `svc`, `fee`, `quotedFee`, `partnerFeePct`, `paidAmount`, `paid`, `paidDate`, `payMethod`, `serviceDate`, `postDate`, `draftDue`, `contractUrl`/`briefUrl`/`draftUrl`/`portalUrl`/`notesUrl`, `invoiceNumber`, `invoiceDate`, `invoiceUrl`, `invoiceTo`, `transactionId`, `terms`, `creditNoteOf`, `currency`, `fxRate`, `hoursWorked`, `perfPlatform`/`perfViews`/`perfEngagements`, `wireFee`, `withholdingPct`, `withholdingTreaty`, `approvalStatus`, `approvalNote`, `disputes[]`, `agentId`, `agentPct`, `exclusivityFrom`/`exclusivityTo`, `usageRightsUntil`, `lineItems[]`, `deliverables[]`, `partials[]`, `draftLead`, `notes`, `createdAt`, `updatedAt`. |
| `bills` | `id`, `vendor`, `category`, `amount`, `date`, `paid`, `paidDate`, `payMethod`, `recurring`, `receiptUrl`, `notes`, `dealId` (COGS link), `taxStatus` (deductible / preTax / personal), timestamps. |
| `contacts` | `id`, `name`, `company`, `type` (brand / agency / vendor / partner / personal), `email`, `phone`, `notes`, `tags[]`, `wikiMd`, `defaultRates: {svc → fee}`, `audience[]`, `testimonials[]`, `emailLog[]`, `confidential`, timestamps. |
| `invoices` | (Reserved for standalone invoices — current usage embeds invoice fields directly on deals.) |
| `mileage` | `id`, `date`, `miles`, `purpose`, `fromAddr`, `toAddr`, `fromTo`, `notes`, timestamps. |
| `activity` | `id`, `ts`, `type` (create/update/delete), `entity`, `entityId`, `label`, `detail`. Capped at 500 entries. |
| `snapshots` | `id`, `ts`, `label`, `payload` (full state JSON). Capped at 20. |
| `taxPayments` | `id`, `year`, `quarter`, `date`, `amount`, `method`, `notes`. |
| `contractTemplates` / `outreachTemplates` | `id`, `name`, `kind`, `body`, (optional `subject`). |
| `vendorRules` | `id`, `match` (substring), `category`. Auto-learns from saved bills. |
| `dealTemplates` | `id`, `name`, `contactId`, `company`, `svc`, `fee`, `partnerFeePct`, `terms`, `deliverables`, `cadence` (weekly/monthly/yearly), `dayOfMonth`, `lastRunAt`, `active`. |
| `agents` | `id`, `name`, `email`, `defaultPct`. |
| `accounts` | `id`, `name`, `kind` (checking/savings/credit), `last4`, `currency`, `statementBalance`. |
| `transactions` | `id`, `accountId`, `date`, `vendor`, `amount`, `type` (debit/credit), `category`, `dealId`, `billId`, `cleared`, `source` (csv/ofx). |
| `affiliates` / `affiliateEntries` | `affiliates`: brand, platform, code, tiered commission table. `affiliateEntries`: month, revenue, commission, paid status. |
| `tips` | Platform / period / amount / supporters (Patreon, AdSense imports, etc.). |
| `assets` | `name`, `category`, `purchaseDate`, `cost`, `life` (MACRS-5 / Section179). |
| `csvMappings` | Saved column maps for the bank-import wizard. |
| `salesTax` | Per-state nexus entries with rate, taxable sales, tax collected. |
| `reportPresets` | Saved custom-report dimension/measure configs. |

### Settings shape

```js
{
  businessName, legalName, email, address, taxRate, currency,
  invoicePrefix, nextInvoiceNumber, theme ("auto"|"dark"|"light"),
  monthlyGoal, annualGoal, mileageRate, lockHash, state, stateRate,
  defaultTerms, lateFeePct, cashOnHand,
  invoiceTemplate: { logo, primary, footer, taxId },
  homeOffice: { sqft, totalSqft, monthlyUtilities },
  connect: {
    plaid: { clientId, secret, env },
    stripe: { publishableKey, secretKey },
    dropboxSign: { apiKey },
    llm: { provider, apiKey, model }
  }
}
```

---

## 4. Routing map

All routes are hash-based (`#/path`). Source: `js/app.js` `register()` calls.

| Path | View handler | File |
|---|---|---|
| `/` `/dashboard` | `dashboard()` | `views/dashboard.js` |
| `/deals` | `dealsList()` | `views/deals.js` |
| `/deals/:id` | `dealDetail()` | `views/deals.js` |
| `/brand/:name` | `brandPage()` | `views/brand.js` |
| `/pipeline` | `kanban()` | `views/kanban.js` |
| `/invoices` | `invoices()` | `views/invoices.js` |
| `/bills` | `bills()` | `views/bills.js` |
| `/mileage` | `mileageView()` | `views/mileage.js` |
| `/contacts` | `contacts()` | `views/contacts.js` |
| `/timeline` | `timelineView()` | `views/timeline.js` |
| `/automations` | `automationsView()` | `views/automations.js` |
| `/activity` | `activityView()` | `views/activity.js` |
| `/reports` | `reports()` | `views/reports.js` |
| `/reports/custom` | `customReportView()` | `views/custom-report.js` |
| `/tax` | `taxView()` | `views/tax.js` |
| `/templates` | `templatesView()` | `views/templates.js` |
| `/contracts` | `contractsView()` | `views/contracts.js` |
| `/banking` | `bankingView()` | `views/banking.js` |
| `/income` | `incomeView()` | `views/income.js` |
| `/booking` | `bookingView()` | `views/booking.js` |
| `/inbox` | `inboxView()` | `views/inbox.js` |
| `/mediakit` | `mediaKitView()` | `views/mediakit.js` |
| `/connect` | `connectView()` | `views/connect.js` |
| `/settings` | `settingsView()` | `views/settings.js` |

### Keyboard shortcuts

| Key(s) | Action |
|---|---|
| `Cmd/Ctrl+K` or `/` | Command palette |
| `?` (or `Shift+/`) | Help overlay |
| `n` | Quick add (NL deal parser) |
| `g d` | Dashboard |
| `g b` | Brand deals |
| `g k` | Pipeline (kanban) |
| `g t` | Timeline |
| `g i` | Invoices |
| `g e` | Bills / expenses |
| `g m` | Mileage |
| `g c` | Contacts |
| `g a` | Automations |
| `g l` | Activity |
| `g r` | Reports |
| `g x` | Tax |
| `g p` | Templates |
| `g n` | Banking |
| `g o` | Other income |
| `g s` | Settings |

---

## 5. Module dependency graph

**Static imports** (parsed at module-load):

- Every view imports: `../utils.js`, `../store.js`, `../router.js`, `../ui.js`, `../forms.js`.
- `app.js` imports every view + `router.js`, `store.js`, `forms.js`, `theme.js`, `lock.js`, `palette.js`, `help.js`, `automations.js`, `scheduler.js`, `prefs.js`, `profiles.js`.
- `forms.js` → `utils.js`, `store.js`, `ui.js`, `nl.js`.
- `palette.js` → `utils.js`, `store.js`, `router.js`, `forms.js`, `ui.js`, `prefs.js`, `help.js`.
- `automations.js` → `store.js`.
- `scheduler.js` → `store.js`, `utils.js`.
- `aiActions.js` → `utils.js`, `llm.js`, `store.js`, `ui.js`.
- `llm.js` → `store.js`.

**Dynamic (lazy) imports** — code-split points:

- `store.js` → `cryptoVault.js`, `synth.js`
- `app.js` → `utils.js` (vault unlock UI), `offlineQueue.js`, `ocr.js`, `profiles.js`, `prefs.js`
- `views/deals.js` → `aiActions.js` ("Summarize brief" / "Grade deal")
- `views/dashboard.js` → `aiActions.js` (AI co-pilot strip), `router.js`, `ui.js`
- `views/contracts.js` → `llm.js`, `ui.js` (Ask AI)
- `views/reports.js` → `aiActions.js` (coach mode), `digest.js`
- `views/forms.js` → `ocr.js`, `offlineQueue.js`
- `views/banking.js` → `ofx.js`
- `views/settings.js` → `share.js`
- `palette.js` → `theme.js`, `aiActions.js`, `store.js`, `ui.js`
- `views/connect.js` → no actual integrations loaded; key storage only.

**No cycles detected.**

---

## 6. Defects, smells, dead code

> Audit references the live tree as of `main` after PR #14. Severity tiers: **C** (critical: data loss / runtime crash / security), **M** (major: UX regression / partial feature), **m** (minor: cleanup / consistency).

| # | File:lines | Severity | Description | Suggested fix |
|---|---|---|---|---|
| 1 | `js/app.js` (duplicate import block near top) | m | `import { runScheduler } from "./scheduler.js"` listed twice. | Delete duplicate. |
| 2 | `js/forms.js`, `views/banking.js`, `views/mileage.js`, `views/income.js`, `views/settings.js`, `views/tax.js` | M | Each file declares its own local `field()` helper; same pattern. | Hoist a single `field()` into `utils.js` and import. |
| 3 | `views/dashboard.js` (`kpiCard`), `views/automations.js`, `views/banking.js`, `views/brand.js`, `views/booking.js`, `views/mileage.js`, `views/tax.js`, `views/reports.js` | M | Same KPI-card primitive redefined in many files. | Hoist `kpiCard()` into `utils.js`. |
| 4 | `js/digest.js`, `views/tax.js` | m | Each has its own `escapeHtml()`. | Move to `utils.js`. (**Done in this PR.**) |
| 5 | `js/ui.js: openModal` | M (a11y) | No focus trap; Tab can leave the modal. | Trap focus on dialog element; restore on close. |
| 6 | `sw.js: const CACHE = "rodbooks-shell-v1"` | C (deploys) | Cache key never bumps → old shell serves cached after deploy. | Bump on each shell-affecting change. (**Done — v2 in this PR.**) |
| 7 | `js/profiles.js` + `js/store.js` cryptoVault wiring | M (security) | Switching profiles via `setActiveProfile()` triggers `location.reload()` but doesn't first call `cryptoVault.disable()` / `resetCache()`. In rare race conditions, an in-flight encrypt could write to the wrong profile's storage. | Call `disable()` + `resetCache()` immediately before reload. |
| 8 | `index.html` mobile tabbar `<a>` elements | m (a11y) | No `aria-label` on icon-style tab links. | Add `aria-label` attributes. (**Done in this PR.**) |
| 9 | `js/store.js` `imports js/synth.js` lazy; OK. But `loadSampleData` is `async`; some old code paths still expect synchronous behaviour. | m | Verify all callers `await`. | Audit. |
| 10 | Schema fields collected by `forms.openDealForm` but **not displayed** in `views/deals.js` deal detail: `currency`, `fxRate`, `hoursWorked`, `perfPlatform`, `perfViews`, `perfEngagements`, `wireFee`, `withholdingPct`, `withholdingTreaty`, `approvalStatus`, `approvalNote`, `disputes`, `agentId`, `agentPct`, `lineItems`. | M | Re-opening a deal in the detail view + saving may discard fields not surfaced. | Either show all fields, or change save path to merge over existing record (currently does — verify). |
| 11 | `views/tax.js` defines `field()` AND `field2()` (legacy refactor leftover). | m | Pick one. |
| 12 | `views/dashboard.js: render()` | m | The arrow body declares ~55 top-level consts. After the duplicate-`runwayCard` regression we should add a static check (see §7). | Add CI smoke + duplicate-detector. |
| 13 | `js/forms.js` deal save: only validates `company` non-empty. | M | Fee, dates, currency code, FX rate not validated. | Add client-side guards + toast warnings. |
| 14 | `js/store.js` LLM API keys stored plaintext under `Settings.connect.llm.apiKey` unless vault is encrypted. | C (security) | If a curious local user opens DevTools, they see the key. | Either mandate encryption when keys are present, or warn prominently in `views/connect.js` header. |
| 15 | `js/store.js: importJSON` overwrites entire vault without confirmation. | M | One slip → wiped data. | Wrap call sites in `confirmDialog`. (Settings does, but the API itself is unguarded.) |
| 16 | `views/dashboard.js: cashRunwayCard` was duplicated previously (fixed in PR #14). | — | Watch for similar accidental copy/pastes. | Adopt smoke check #2 below. |
| 17 | `js/digest.js` PDF generation calls `window.html2pdf` lazily. If the `<script defer>` hasn't loaded when the user clicks **Download digest PDF**, fails silently. | m | Add a "still loading…" toast and retry. |
| 18 | `views/mileage.js` list rows show miles + purpose but not the per-row deductible $ amount. | m | Render `(miles × Settings.mileageRate)` per row. |
| 19 | `views/connect.js` form fields for Plaid `secret`, Stripe `secretKey`, Dropbox Sign `apiKey` are stored as input type `text` (or `password`?). Verify and clamp. | M (security) | All sensitive fields → `type="password"`. (Audit reports they already are; verify.) |
| 20 | Multiple modules redefine identical `escape*` helpers. | m | Single source of truth in `utils.js`. (**escapeHtml hoisted in this PR.**) |

### Out-of-scope (audit-flagged) follow-up PRs

- Hoist `field()` and `kpi()` into `utils.js` (#2, #3) — touches 8+ files.
- Display every form-collected field on the deal detail view (#10) — needs UI design pass.
- Encryption-gated API key storage with migration (#14, #19) — UX flow design.
- Modal focus-trap (#5) — small but should land with a11y testing.
- A real test runner — see §7.

---

## 7. Test recommendations

There is no test suite. These five smoke checks would have caught every blank-page or broken-route regression we've seen in prior phases.

### 7.1 Module-load smoke (CI)

```bash
# Spawn a headless browser, load index.html, assert no console errors and
# that the dashboard route renders content. Pseudocode:
playwright test --project=chromium <<'EOF'
test("dashboard renders", async ({ page }) => {
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("http://localhost:8765/");
  await page.waitForSelector("#view .card"); // any rendered card
  expect(errs).toEqual([]);
});
EOF
```

Catches: duplicate `const` parse errors, missing imports, broken dynamic imports, runtime exceptions in render.

### 7.2 Duplicate-const detector (CI)

```bash
python3 - <<'PY'
import re, sys, glob
bad = []
for f in glob.glob("js/views/*.js") + glob.glob("js/*.js"):
    src = open(f).read()
    for m in re.finditer(r"(?:const render\s*=\s*\(\)\s*=>\s*\{|^function\s+\w+\s*\([^)]*\)\s*\{)", src, re.M):
        # Slice from match end to matching brace; flag duplicate consts within.
        i, depth, start = m.end(), 1, m.end()
        while depth and i < len(src):
            if src[i] == "{": depth += 1
            elif src[i] == "}": depth -= 1
            i += 1
        body = src[start:i]
        names = []
        d = 0
        for line in body.split("\n"):
            t = line.strip()
            if d == 0 and t.startswith("const "):
                mm = re.match(r"const\s+(\w+)", t)
                if mm: names.append(mm.group(1))
            d += t.count("{") - t.count("}")
        from collections import Counter
        for k, v in Counter(names).items():
            if v > 1:
                bad.append(f"{f}: duplicate const '{k}' (×{v})")
sys.exit("\n".join(bad)) if bad else None
print("ok")
PY
```

### 7.3 Roundtrip persistence (manual or browser-test)

Open a deal form, set `currency: "EUR"`, `fxRate: 1.08`, `hoursWorked: 4`, save. Reload. Open the same deal — verify fields survive. Catches schema mismatches between `forms.js` (writes) and `views/deals.js` (reads) flagged as defect #10.

### 7.4 Profile-switch encryption isolation (manual)

Create profile A. Settings → Enable encryption with passphrase `pass-A`. Switch to profile B. Reload. Verify B is plaintext. Switch back to A. Reload. Verify the vault unlock screen prompts.

### 7.5 Offline drain (manual)

DevTools → Network → Offline. Open Bills → Capture receipt → save image. Re-enable network. Reload. Verify a Bill entry was created via the offline-queue drainer in `app.js`.

---

## 8. How to run, build, deploy

- **Run locally:** `python3 -m http.server 8765` from the repo root, then visit `http://localhost:8765/`.
- **Build:** there is no build. Edit a file → reload.
- **Deploy:** push to `main`. `.github/workflows/deploy.yml` publishes `main` to GitHub Pages.
- **Live:** `https://rodman-ai.github.io/RodBooks/` — Pages source must be set to **GitHub Actions** in repo Settings → Pages.

---

## 9. Conventions

- ES modules everywhere. **No** bundler. **No** `npm install`.
- Vendored deps are CDN-only via `<script defer>` in `index.html` (Chart.js, html2pdf, JSZip, Tesseract.js loaded on demand).
- `el(tag, attrs, ...children)` is the universal DOM builder. Pass `class` (string), `style` (object — values must be valid CSS strings, e.g. `"6px"` not `6`), `html` (raw innerHTML — assume caller pre-escaped), `on*` (handlers).
- All writes go through `store.js`'s typed APIs (`Deals.save`, `Bills.remove`, etc.) so the activity log + subscriber broadcast fires.
- All views return `{ node, unmount }` with `unmount` cleaning up subscribers + `Chart` instances.
- Theme via CSS custom properties; nothing should hard-code colour outside `styles.css` `:root` / `[data-theme="light"]` blocks.

---

*Last updated: rebrand-AI-first PR #13 + dashboard-fix PR #14.*
