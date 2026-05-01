// Tax workbench: Schedule C box totals, SE tax, state tax, quarterly payment log, 1099 payer tracker.

import { el, fmtMoney, fmtDate, todayISO, netFee } from "../utils.js";
import { Deals, Bills, Settings, TaxPayments, subscribe, downloadFile, toCSV } from "../store.js";
import { openModal, toast, confirmDialog } from "../ui.js";

// Map our bill categories to Schedule C box numbers (approximate, common-case).
const SCHED_C = {
  "Marketing": { box: 8, label: "Advertising (Box 8)" },
  "Contractors": { box: 11, label: "Contract labor (Box 11)" },
  "Equipment": { box: 13, label: "Depreciation (Box 13)" },
  "Software": { box: 18, label: "Office expense (Box 18)" },
  "Subscriptions": { box: 18, label: "Office expense (Box 18)" },
  "Office": { box: 18, label: "Office expense (Box 18)" },
  "Meals": { box: 24, label: "Meals — 50% deductible (Box 24b)" },
  "Travel": { box: 24, label: "Travel (Box 24a)" },
  "Education": { box: 27, label: "Other expenses (Box 27a)" },
  "Phone & Internet": { box: 25, label: "Utilities (Box 25)" },
  "Home Office": { box: 30, label: "Home office (Box 30)" },
  "Other": { box: 27, label: "Other expenses (Box 27a)" },
};

const Q_DUE = ["Apr 15", "Jun 15", "Sep 15", "Jan 15"];
const Q_PERIOD = ["Jan–Mar (Q1)", "Apr–May (Q2)", "Jun–Aug (Q3)", "Sep–Dec (Q4)"];

export default function taxView() {
  const node = el("div", {});
  let year = String(new Date().getFullYear());

  const render = () => {
    const settings = Settings.get();
    const allDeals = Deals.all();
    const allBills = Bills.all();
    const allPayments = TaxPayments.all();

    const yearsSet = new Set([year]);
    allDeals.forEach((d) => { const y = (d.paidDate || d.serviceDate || d.invoiceDate || "").slice(0, 4); if (y) yearsSet.add(y); });
    allBills.forEach((b) => { const y = (b.date || "").slice(0, 4); if (y) yearsSet.add(y); });
    allPayments.forEach((p) => { if (p.year) yearsSet.add(String(p.year)); });
    const years = Array.from(yearsSet).sort().reverse();

    const yDeals = allDeals.filter((d) => d.paid && (d.paidDate || "").startsWith(year));
    const yBills = allBills.filter((b) => (b.date || "").startsWith(year));
    const yPayments = allPayments.filter((p) => String(p.year) === year);

    // Box-by-box totals (#32)
    const boxes = {};
    yBills.forEach((b) => {
      const meta = SCHED_C[b.category] || SCHED_C.Other;
      const amt = +b.amount || 0;
      // Meals are 50% deductible
      const deductible = b.category === "Meals" ? amt * 0.5 : amt;
      boxes[meta.label] = (boxes[meta.label] || 0) + deductible;
    });

    const grossIncome = yDeals.reduce((s, d) => s + (+d.paidAmount || netFee(d)), 0);
    const totalDeductions = Object.values(boxes).reduce((a, b) => a + b, 0);
    const netSE = Math.max(0, grossIncome - totalDeductions);

    // SE tax (#34): 92.35% × 15.3% on first $168,600 (2024 SS wage base; OK approx)
    const seBase = netSE * 0.9235;
    const ssWageBase = 168600;
    const ssTax = Math.min(seBase, ssWageBase) * 0.124;
    const medicareTax = seBase * 0.029;
    const additionalMedicare = Math.max(0, seBase - 200000) * 0.009;
    const seTax = ssTax + medicareTax + additionalMedicare;
    const seDeduction = seTax / 2;

    const stateTax = netSE * (settings.stateRate || 0.05);
    const federalIncomeApprox = Math.max(0, (netSE - seDeduction)) * (settings.taxRate || 0.3);
    const totalEstTax = seTax + federalIncomeApprox + stateTax;

    // 1099-NEC payer tracker (#31): brands you got paid >= $600 from this year.
    const byPayer = {};
    yDeals.forEach((d) => {
      const k = d.company || "—";
      byPayer[k] = (byPayer[k] || 0) + (+d.paidAmount || netFee(d));
    });
    const owedForms = Object.entries(byPayer).filter(([, v]) => v >= 600).sort((a, b) => b[1] - a[1]);

    // Quarterly: Q1=Jan-Mar, Q2=Apr-May, Q3=Jun-Aug, Q4=Sep-Dec
    const qBuckets = [0, 0, 0, 0];
    yDeals.forEach((d) => {
      const m = +(d.paidDate || "").slice(5, 7) - 1;
      const q = m <= 2 ? 0 : m <= 4 ? 1 : m <= 7 ? 2 : 3;
      if (m >= 0) qBuckets[q] += (+d.paidAmount || netFee(d));
    });
    const qBillBuckets = [0, 0, 0, 0];
    yBills.forEach((b) => {
      const m = +(b.date || "").slice(5, 7) - 1;
      const q = m <= 2 ? 0 : m <= 4 ? 1 : m <= 7 ? 2 : 3;
      if (m >= 0) qBillBuckets[q] += (+b.amount || 0);
    });
    const qNet = qBuckets.map((v, i) => v - qBillBuckets[i]);
    const reserveRate = settings.taxRate || 0.3;
    const qReserve = qNet.map((v) => Math.max(0, v) * reserveRate);
    const qPaid = [0, 0, 0, 0];
    yPayments.forEach((p) => { if (p.quarter >= 1 && p.quarter <= 4) qPaid[p.quarter - 1] += (+p.amount || 0); });

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Tax workbench"),
          el("div", { class: "sub" }, `Schedule C totals · SE tax · quarterly log · 1099 tracker — ${year}`),
        ),
        el("div", { class: "row" },
          (function () {
            const s = el("select", { class: "select" });
            for (const y of years) {
              const o = el("option", { value: y }, y);
              if (y === year) o.selected = true;
              s.append(o);
            }
            s.addEventListener("change", () => { year = s.value; render(); });
            return s;
          })(),
          el("button", { class: "btn", onclick: () => exportAuditPack(year) }, "Export audit pack"),
          el("button", { class: "btn primary", onclick: () => openTaxPaymentForm({ year: +year }) }, "+ Log estimated payment"),
        ),
      ),

      el("div", { class: "kpi-grid" },
        kpi("Gross income (cash)", fmtMoney(grossIncome)),
        kpi("Total deductions", fmtMoney(totalDeductions)),
        kpi("Net SE income", fmtMoney(netSE)),
        kpi("SE tax (15.3%)", fmtMoney(seTax), null, `Half deductible: ${fmtMoney(seDeduction)}`),
        kpi("Total est. federal+state", fmtMoney(totalEstTax)),
      ),

      el("div", { class: "card" },
        el("h3", {}, "Schedule C — box-by-box totals"),
        el("table", { class: "data" },
          el("thead", {}, el("tr", {},
            el("th", {}, "Schedule C box"),
            el("th", { class: "num" }, "Deductible"),
          )),
          el("tbody", {},
            ...Object.entries(boxes).sort((a, b) => b[1] - a[1]).map(([label, v]) => el("tr", {},
              el("td", {}, label),
              el("td", { class: "num" }, fmtMoney(v)),
            )),
            el("tr", { style: { borderTop: "2px solid var(--line-2)" } },
              el("td", { style: { fontWeight: 700 } }, "Total deductions"),
              el("td", { class: "num", style: { fontWeight: 700 } }, fmtMoney(totalDeductions)),
            ),
          ),
        ),
        el("div", { class: "small muted", style: { marginTop: 8 } }, "Approximate IRS box mappings. Verify with your CPA."),
      ),

      el("div", { class: "card" },
        el("h3", {}, "SE tax breakdown"),
        el("table", { class: "data" },
          el("tbody", {},
            tr2("Net SE income", fmtMoney(netSE)),
            tr2("× 92.35% (SE base)", fmtMoney(seBase)),
            tr2("Social Security 12.4% (capped)", fmtMoney(ssTax)),
            tr2("Medicare 2.9%", fmtMoney(medicareTax)),
            additionalMedicare > 0 ? tr2("Additional Medicare 0.9% (>$200k)", fmtMoney(additionalMedicare)) : null,
            tr2("Total SE tax", fmtMoney(seTax), true),
            tr2("Half deductible against income", fmtMoney(seDeduction)),
          ),
        ),
      ),

      el("div", { class: "card" },
        el("h3", {}, "Quarterly estimated payments"),
        el("table", { class: "data" },
          el("thead", {}, el("tr", {},
            el("th", {}, "Quarter"),
            el("th", {}, "Period"),
            el("th", {}, "Due"),
            el("th", { class: "num" }, "Net (cash)"),
            el("th", { class: "num" }, "Reserve"),
            el("th", { class: "num" }, "Paid"),
            el("th", { class: "num" }, "Balance"),
          )),
          el("tbody", {}, ...[0, 1, 2, 3].map((i) => {
            const balance = qReserve[i] - qPaid[i];
            return el("tr", {},
              el("td", { style: { fontWeight: 600 } }, `Q${i + 1}`),
              el("td", { class: "small muted" }, Q_PERIOD[i]),
              el("td", { class: "small muted" }, Q_DUE[i] + (i === 3 ? " (next yr)" : "")),
              el("td", { class: "num" }, fmtMoney(qNet[i])),
              el("td", { class: "num" }, fmtMoney(qReserve[i])),
              el("td", { class: "num" }, fmtMoney(qPaid[i])),
              el("td", { class: "num", style: { color: balance > 0 ? "var(--warn)" : "var(--accent)", fontWeight: 600 } }, fmtMoney(balance)),
            );
          })),
        ),
        yPayments.length > 0 && el("div", { style: { marginTop: 12 } },
          el("h4", { style: { fontSize: "12px", color: "var(--muted)", textTransform: "uppercase", margin: "8px 0" } }, "Logged payments"),
          el("table", { class: "data" },
            el("thead", {}, el("tr", {},
              el("th", {}, "Date"), el("th", {}, "Quarter"), el("th", {}, "Method"), el("th", { class: "num" }, "Amount"), el("th", {}, "Notes"), el("th", {}, ""),
            )),
            el("tbody", {}, ...yPayments.sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((p) => el("tr", {},
              el("td", { class: "small muted" }, fmtDate(p.date)),
              el("td", {}, `Q${p.quarter}`),
              el("td", { class: "small muted" }, p.method || "—"),
              el("td", { class: "num" }, fmtMoney(p.amount)),
              el("td", { class: "small muted truncate" }, p.notes || "—"),
              el("td", {}, el("button", { class: "btn sm", onclick: () => openTaxPaymentForm(p) }, "Edit")),
            ))),
          ),
        ),
      ),

      el("div", { class: "card" },
        el("h3", {}, `1099-NEC tracker · ${year}`),
        el("div", { class: "small muted", style: { marginBottom: 8 } }, `Brands that paid you ≥ $600 owe you a 1099-NEC by Jan 31, ${+year + 1}.`),
        owedForms.length === 0
          ? el("div", { class: "empty small" }, "No payers crossed the $600 threshold yet.")
          : el("table", { class: "data" },
              el("thead", {}, el("tr", {},
                el("th", {}, "Payer"),
                el("th", { class: "num" }, "Paid"),
                el("th", {}, "Status"),
              )),
              el("tbody", {}, ...owedForms.map(([name, total]) => el("tr", {},
                el("td", {}, name),
                el("td", { class: "num" }, fmtMoney(total)),
                el("td", {}, el("span", { class: "pill amber" }, "Form due")),
              ))),
            ),
      ),
    );
  };

  const unsub = subscribe(render);
  render();
  return { node, unmount: unsub };
}

function tr2(k, v, bold) {
  return el("tr", {},
    el("td", { style: bold ? { fontWeight: 700, borderTop: "1px solid var(--line-2)" } : null }, k),
    el("td", { class: "num", style: { ...(bold ? { fontWeight: 700, borderTop: "1px solid var(--line-2)" } : {}) } }, v),
  );
}

function kpi(label, value, dir, sub) {
  return el("div", { class: `card kpi ${dir || ""}` },
    el("div", { class: "kpi-sub" }, label),
    el("div", { class: "kpi-value" }, value),
    sub && el("div", { class: "kpi-sub" }, sub),
  );
}

function openTaxPaymentForm(payment) {
  const isNew = !payment?.id;
  const p = payment || { date: todayISO(), quarter: 1, year: new Date().getFullYear(), amount: 0, method: "EFTPS", notes: "" };
  const date = el("input", { class: "input", type: "date", value: p.date || todayISO() });
  const quarter = el("select", { class: "select" });
  [1, 2, 3, 4].forEach((q) => {
    const o = el("option", { value: String(q) }, `Q${q}`);
    if (+q === +p.quarter) o.selected = true;
    quarter.append(o);
  });
  const year = el("input", { class: "input", type: "number", value: p.year || new Date().getFullYear() });
  const amount = el("input", { class: "input", type: "number", step: "0.01", min: "0", value: p.amount || "" });
  const method = el("input", { class: "input", value: p.method || "EFTPS", placeholder: "EFTPS, IRS Direct Pay, state…" });
  const notes = el("textarea", { class: "textarea" }, p.notes || "");

  const body = el("div", { class: "form-grid" },
    field("Date", date),
    field("Quarter", quarter),
    field("Tax year", year),
    field("Amount", amount),
    field("Method", method),
    field("Notes", notes, true),
  );
  let m;
  const save = () => {
    if (!amount.value) { toast("Amount required", "warn"); return; }
    TaxPayments.save({
      id: p.id,
      date: date.value,
      quarter: +quarter.value,
      year: +year.value,
      amount: +amount.value || 0,
      method: method.value,
      notes: notes.value,
    });
    toast(isNew ? "Payment logged" : "Updated");
    m.close();
  };
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    !isNew && el("button", { class: "btn danger", onclick: async () => {
      const ok = await confirmDialog({ title: "Delete payment?", danger: true, confirmLabel: "Delete" });
      if (ok) { TaxPayments.remove(p.id); toast("Deleted"); m.close(); }
    } }, "Delete"),
    el("button", { class: "btn", onclick: () => m.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: save }, isNew ? "Log payment" : "Save"),
  );
  m = openModal({ title: isNew ? "Log estimated payment" : "Edit payment", body, footer });
  setTimeout(() => amount.focus(), 30);
}

function field(label, control, full) {
  return el("div", { class: `field ${full ? "full" : ""}` }, el("label", {}, label), control);
}

// Audit pack export (#40): bundle CSVs of deals/bills/mileage/payments + a summary as JSON download.
function exportAuditPack(year) {
  const deals = Deals.all().filter((d) => (d.paidDate || d.serviceDate || "").startsWith(year));
  const bills = Bills.all().filter((b) => (b.date || "").startsWith(year));
  const payments = TaxPayments.all().filter((p) => String(p.year) === year);

  const dealsCsv = toCSV(deals, [
    { key: "company", label: "Brand" },
    { key: "svc", label: "Service" },
    { key: "fee", label: "Fee" },
    { key: "paidAmount", label: "Paid" },
    { key: "paidDate", label: "Paid Date" },
    { key: "invoiceNumber", label: "Invoice #" },
    { key: "invoiceDate", label: "Invoice Date" },
    { key: "transactionId", label: "Transaction" },
    { key: "contractUrl", label: "Contract" },
    { key: "invoiceUrl", label: "Invoice URL" },
  ]);
  const billsCsv = toCSV(bills, [
    { key: "date", label: "Date" }, { key: "vendor", label: "Vendor" }, { key: "category", label: "Category" },
    { key: "amount", label: "Amount" }, { key: "payMethod", label: "Method" }, { key: "receiptUrl", label: "Receipt" },
  ]);
  const paymentsCsv = toCSV(payments, [
    { key: "date", label: "Date" }, { key: "quarter", label: "Quarter" }, { key: "amount", label: "Amount" },
    { key: "method", label: "Method" }, { key: "notes", label: "Notes" },
  ]);

  const bundle = `RodBooks audit pack · ${year}\n` +
    `Generated: ${new Date().toISOString()}\n` +
    `\n=== DEALS (${deals.length}) ===\n` + dealsCsv +
    `\n\n=== BILLS (${bills.length}) ===\n` + billsCsv +
    `\n\n=== ESTIMATED TAX PAYMENTS (${payments.length}) ===\n` + paymentsCsv;

  downloadFile(`rodbooks-audit-pack-${year}.txt`, bundle, "text/plain");
  toast(`Audit pack ${year} exported`);
}
