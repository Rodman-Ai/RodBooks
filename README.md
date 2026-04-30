# RodBooks

A QuickBooks-style accounting app built for influencers. Track brand deals, invoices, bills, and taxes — all in one place. Runs entirely in the browser, deploys to GitHub Pages, and works on desktop and mobile.

## Why

Most influencer "books" live in a sprawling spreadsheet: brand, fee, contract link, brief, draft due, post date, invoice, paid/unpaid, partner fee %, etc. RodBooks turns that workflow into a real app:

- **Brand Deals** — the heart of the app. Fields match what creators actually track (service vs. post date, draft due, contract/brief/draft URLs, partner-fee %, paid status). Each deal has a visual lifecycle tracker: Contract → Brief → Draft due → Draft sent → Service → Posted → Invoiced → Paid.
- **Tableau-style Dashboard** — sticky filter bar (year / service / brand / status / month) cross-filters every chart. KPIs with year-over-year comparison, 24-month income vs. expenses (click a bar to drill into a month), pipeline funnel, brand-mix donut (click a slice to drill into the brand page), service mix, year×month heatmap, cycle-time histogram, top brands and top deals.
- **Brand pages** — drill-down for any brand: lifetime totals, 24-month trend, service mix, deal history.
- **Timeline** — calendar (month) and Gantt (year) views of every milestone — drafts due, service, post, invoice, paid.
- **Automations** — pattern-detection engine that proposes rules based on your data: flag overdue invoices, generate this month's recurring bills, tag repeat brands as Tier 1, draft reminders, backfill invoice numbers, dormant-brand outreach, normalize service codes, tax reserve.
- **Invoices** — auto-numbered, printable / saveable as PDF, generated from any deal.
- **Bills** — recurring software, equipment, travel, meals, home-office.
- **Contacts** — brands, agencies, vendors, partners.
- **Reports** — P&L, income by brand, expenses by category, monthly profit chart, tax reserve.

## Features

- 100% local-first: data stays in `localStorage`. Export/import JSON for backups; CSV export for any table.
- Mobile + desktop responsive. Bottom tab bar on mobile, sidebar on desktop. Installable as a PWA.
- No build step. Vanilla JS ES modules + Chart.js (CDN). Deploys directly to GitHub Pages.
- Keyboard shortcuts: `n` quick-add; `g` then `d/b/t/i/e/c/a/r/s` to jump (dashboard / deals / timeline / invoices / expenses / contacts / automations / reports / settings).
- Sample data seeded on first run: 6 years (2021 → today), 60 fictional brands, ~280 deals on a realistic growth curve, ~250 expenses across recurring software / equipment / travel / contractors. Seeded RNG so the demo is repeatable.

## Run locally

It's a static site — open `index.html` directly, or:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy to GitHub Pages

The included workflow (`.github/workflows/deploy.yml`) deploys `main` automatically. Once it has run successfully:

1. Repo → Settings → Pages
2. Source: **GitHub Actions**

The site will be available at `https://<owner>.github.io/<repo>/`.

You can also serve from any static host (Netlify, Vercel, S3, Cloudflare Pages) — there's nothing to build.

## Data model

All data is stored under the localStorage key `rodbooks:v1`. Top-level shape:

```json
{
  "schema": 1,
  "settings": { "businessName", "email", "address", "taxRate", "currency", "invoicePrefix", "nextInvoiceNumber" },
  "deals":    [ { "company", "svc", "fee", "partnerFeePct", "paidAmount", "paid", "paidDate", "payMethod",
                  "serviceDate", "postDate", "draftDue", "contractUrl", "briefUrl", "draftUrl",
                  "portalUrl", "notesUrl", "invoiceNumber", "invoiceDate", "invoiceUrl", "invoiceTo",
                  "transactionId", "notes", "contactId" } ],
  "bills":    [ { "vendor", "category", "amount", "date", "paid", "paidDate", "payMethod", "recurring", "receiptUrl", "notes" } ],
  "contacts": [ { "name", "company", "type", "email", "phone", "notes" } ],
  "invoices": []
}
```

Use **Settings → Export JSON** for a full backup. **Import JSON** restores it.

## Service-type codes

The deal `svc` field uses the same shorthand the spreadsheet did:

| Code | Meaning |
| ---- | ------- |
| `v` | Video |
| `p` | Post |
| `p prep` / `postp` | Pre/Post-post variant |
| `qrt` / `rt` / `qrt rt` | Quote / Repost / both |
| `c+L` | Comment + Like |
| `incentive` | Incentive only |
| `x` | Other / cancelled |

## Roadmap ideas

- Multi-currency conversion
- Recurring invoice generation
- Mileage tracker
- Bank-statement CSV ingestion
- Cloud sync option (optional, with E2E encryption)
