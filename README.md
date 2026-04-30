# RodBooks

A QuickBooks-style accounting app built for influencers. Track brand deals, invoices, bills, and taxes — all in one place. Runs entirely in the browser, deploys to GitHub Pages, and works on desktop and mobile.

## Why

Most influencer "books" live in a sprawling spreadsheet: brand, fee, contract link, brief, draft due, post date, invoice, paid/unpaid, partner fee %, etc. RodBooks turns that workflow into a real app:

- **Brand Deals** — the heart of the app. Fields match what creators actually track (service vs. post date, draft due, contract/brief/draft URLs, partner-fee %, paid status).
- **Invoices** — auto-numbered, printable / saveable as PDF, generated from any deal.
- **Bills** — recurring software, equipment, travel, meals, home-office.
- **Contacts** — brands, agencies, vendors, partners.
- **Reports** — P&L, income by brand, expenses by category, monthly profit chart, tax reserve.
- **Dashboard** — month/YTD income, outstanding A/R, expenses, profit, top brands, recent activity, upcoming drafts.

## Features

- 100% local-first: data stays in `localStorage`. Export/import JSON for backups; CSV export for any table.
- Mobile + desktop responsive. Bottom tab bar on mobile, sidebar on desktop. Installable as a PWA.
- No build step. Vanilla JS ES modules + Chart.js (CDN). Deploys directly to GitHub Pages.
- Keyboard shortcuts: `n` quick-add; `g` then `d/b/i/e/c/r/s` to jump between sections.
- Sample data seeded on first run so you can poke around immediately.

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
