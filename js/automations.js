// Automation engine: detect patterns in user's data and propose rules.
// Rules can be enabled and applied; applied changes write back via the store.

import { Deals, Bills, Contacts, Settings } from "./store.js";

const RULES_KEY = "rodbooks:rules";

export function getRules() {
  try { return JSON.parse(localStorage.getItem(RULES_KEY)) || {}; } catch { return {}; }
}
export function setRule(id, value) {
  const rules = getRules();
  rules[id] = value;
  localStorage.setItem(RULES_KEY, JSON.stringify(rules));
}

// --- Proposal generators ---
// Each returns { id, title, description, severity, count, apply, preview }.

export function generateProposals() {
  const proposals = [];
  const today = new Date();
  const todayMs = today.getTime();

  const deals = Deals.all();
  const bills = Bills.all();
  const contacts = Contacts.all();
  const rules = getRules();

  // 1. Overdue invoices (>30 days unpaid, has invoiceDate or serviceDate)
  const overdue = deals.filter((d) => {
    if (d.paid) return false;
    const ref = d.invoiceDate || d.serviceDate;
    if (!ref) return false;
    return (todayMs - new Date(ref).getTime()) / 86400000 > 30;
  });
  if (overdue.length) {
    proposals.push({
      id: "overdue-flag",
      title: `Flag ${overdue.length} overdue invoice${overdue.length === 1 ? "" : "s"}`,
      description: "Mark invoices unpaid >30 days as overdue and add a reminder note.",
      severity: "high",
      count: overdue.length,
      preview: overdue.slice(0, 5).map((d) => `${d.company} · ${d.invoiceNumber || "—"}`),
      apply() {
        overdue.forEach((d) => {
          const note = (d.notes || "").includes("[overdue]") ? d.notes : `[overdue] ${d.notes || ""}`.trim();
          Deals.save({ id: d.id, notes: note });
        });
      },
    });
  }

  // 2. Recurring bills missing for current month
  const recurringTemplates = {};
  bills.filter((b) => b.recurring === "monthly").forEach((b) => {
    if (!recurringTemplates[b.vendor] || (b.date || "") > recurringTemplates[b.vendor].date) {
      recurringTemplates[b.vendor] = b;
    }
  });
  const ym = today.toISOString().slice(0, 7);
  const missing = Object.values(recurringTemplates).filter((b) => {
    return !bills.some((x) => x.vendor === b.vendor && (x.date || "").startsWith(ym));
  });
  if (missing.length) {
    proposals.push({
      id: "recurring-fill",
      title: `Create ${missing.length} recurring bill${missing.length === 1 ? "" : "s"} for ${today.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`,
      description: "Auto-generate this month's recurring software & subscription charges from prior months.",
      severity: "medium",
      count: missing.length,
      preview: missing.slice(0, 5).map((b) => `${b.vendor} · $${b.amount}`),
      apply() {
        missing.forEach((b) => {
          Bills.save({
            vendor: b.vendor, category: b.category, amount: b.amount,
            date: today.toISOString().slice(0, 10),
            paid: false, paidDate: "", payMethod: b.payMethod, recurring: "monthly", notes: "auto-generated",
          });
        });
      },
    });
  }

  // 3. Repeat brands (3+ paid deals) → suggest "Tier 1" tag
  const byBrand = {};
  deals.forEach((d) => { byBrand[d.company] = (byBrand[d.company] || 0) + (d.paid ? 1 : 0); });
  const tierOne = Object.entries(byBrand).filter(([_, c]) => c >= 3).map(([b]) => b);
  if (tierOne.length) {
    proposals.push({
      id: "tier-one",
      title: `Tag ${tierOne.length} repeat brand${tierOne.length === 1 ? "" : "s"} as Tier 1`,
      description: "Brands with 3+ paid deals get an internal Tier 1 tag for prioritization.",
      severity: "info",
      count: tierOne.length,
      preview: tierOne.slice(0, 6),
      apply() {
        tierOne.forEach((name) => {
          const c = contacts.find((x) => (x.name || "").toLowerCase() === name.toLowerCase() || x.company === name);
          if (c) Contacts.save({ id: c.id, notes: ((c.notes || "") + " #tier1").trim() });
        });
      },
    });
  }

  // 4. Drafts due in next 7 days — surface reminders
  const upcoming = deals.filter((d) => {
    if (d.paid || !d.draftDue) return false;
    const dt = new Date(d.draftDue);
    const days = (dt - today) / 86400000;
    return days >= 0 && days <= 7;
  });
  if (upcoming.length) {
    proposals.push({
      id: "draft-reminder",
      title: `Set reminders for ${upcoming.length} upcoming draft${upcoming.length === 1 ? "" : "s"}`,
      description: "Drafts due within the next 7 days. (Reminders surface in the dashboard.)",
      severity: "high",
      count: upcoming.length,
      preview: upcoming.slice(0, 6).map((d) => `${d.company} · due ${d.draftDue}`),
      apply() { /* no-op — drafts are surfaced on the dashboard already */ },
    });
  }

  // 5. Paid deals missing invoice numbers
  const paidNoInv = deals.filter((d) => d.paid && !d.invoiceNumber);
  if (paidNoInv.length) {
    proposals.push({
      id: "backfill-invoice-numbers",
      title: `Backfill invoice numbers on ${paidNoInv.length} paid deal${paidNoInv.length === 1 ? "" : "s"}`,
      description: "Auto-assign sequential invoice numbers using your prefix.",
      severity: "medium",
      count: paidNoInv.length,
      preview: paidNoInv.slice(0, 5).map((d) => `${d.company} · ${d.paidDate || "—"}`),
      apply() {
        const prefix = (Settings.get().invoicePrefix) || "INV";
        paidNoInv.forEach((d) => {
          const n = Settings.nextInvoiceNumber();
          Deals.save({ id: d.id, invoiceNumber: `${prefix}-${n}`, invoiceDate: d.invoiceDate || d.paidDate });
        });
      },
    });
  }

  // 6. Suggest renewal: brand with last deal >90d ago and lifetime > $X
  const ninety = todayMs - 90 * 86400000;
  const renewals = [];
  Object.entries(byBrand).forEach(([brand]) => {
    const ds = deals.filter((d) => d.company === brand);
    const last = ds.map((d) => d.serviceDate || d.paidDate || "").sort().slice(-1)[0];
    const lifetime = ds.reduce((s, d) => s + (Number(d.fee) || 0), 0);
    if (last && new Date(last).getTime() < ninety && lifetime >= 1500 && ds.length >= 2) {
      renewals.push({ brand, last, lifetime });
    }
  });
  if (renewals.length) {
    proposals.push({
      id: "renewal-outreach",
      title: `Re-engage ${renewals.length} dormant brand${renewals.length === 1 ? "" : "s"}`,
      description: "Brands with $1.5k+ lifetime that haven't booked in 90+ days. Add a follow-up note to each.",
      severity: "info",
      count: renewals.length,
      preview: renewals.slice(0, 6).map((r) => `${r.brand} · last ${r.last}`),
      apply() {
        renewals.forEach((r) => {
          const c = contacts.find((x) => x.company === r.brand || x.name === r.brand);
          if (c) Contacts.save({ id: c.id, notes: ((c.notes || "") + " · renewal-outreach").trim() });
        });
      },
    });
  }

  // 7. Standardize service codes (lowercase, trimmed)
  const malformed = deals.filter((d) => d.svc && d.svc !== d.svc.toLowerCase().trim());
  if (malformed.length) {
    proposals.push({
      id: "normalize-svc",
      title: `Normalize ${malformed.length} service code${malformed.length === 1 ? "" : "s"}`,
      description: "Lowercase and trim service-type codes for consistent grouping & filtering.",
      severity: "info",
      count: malformed.length,
      preview: malformed.slice(0, 5).map((d) => `${d.company} · "${d.svc}"`),
      apply() { malformed.forEach((d) => Deals.save({ id: d.id, svc: d.svc.toLowerCase().trim() })); },
    });
  }

  // 8. Tax reserve alert — if estimated tax > current cash collected * 30%
  const yyyy = today.getFullYear();
  const yDeals = deals.filter((d) => d.paid && (d.paidDate || "").startsWith(String(yyyy)));
  const collected = yDeals.reduce((s, d) => s + (d.paidAmount || 0), 0);
  const taxReserve = collected * (Settings.get().taxRate || 0.3);
  if (taxReserve > 1000 && !rules["tax-reserve-ack"]) {
    proposals.push({
      id: "tax-reserve",
      title: `Set aside ~${formatMoneyShort(taxReserve)} for taxes (${yyyy})`,
      description: `Based on ${formatMoneyShort(collected)} collected this year and a ${Math.round((Settings.get().taxRate || 0.3) * 100)}% reserve rate.`,
      severity: "high",
      count: 1,
      preview: [`Cash collected ${yyyy}: ${formatMoneyShort(collected)}`, `Reserve rate: ${Math.round((Settings.get().taxRate || 0.3) * 100)}%`],
      apply() { setRule("tax-reserve-ack", true); },
    });
  }

  return proposals;
}

function formatMoneyShort(n) {
  const v = Math.abs(n);
  if (v >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}
