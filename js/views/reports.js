import { el, fmtMoney, fmtMoneyShort, monthKey, monthLabel, netFee, serviceMeta } from "../utils.js";
import { Deals, Bills, Settings, subscribe } from "../store.js";

export default function reports() {
  const node = el("div", {});
  let chart;
  let year = String(new Date().getFullYear());

  const render = () => {
    const deals = Deals.all();
    const bills = Bills.all();
    const settings = Settings.get();

    const yearsSet = new Set([year]);
    deals.forEach((d) => { const y = (d.serviceDate || d.paidDate || d.invoiceDate || "").slice(0, 4); if (y) yearsSet.add(y); });
    bills.forEach((b) => { const y = (b.date || "").slice(0, 4); if (y) yearsSet.add(y); });
    const years = Array.from(yearsSet).sort().reverse();

    const yDeals = deals.filter((d) => (d.serviceDate || d.paidDate || d.invoiceDate || "").startsWith(year));
    const yBills = bills.filter((b) => (b.date || "").startsWith(year));

    const grossIncome = yDeals.reduce((s, d) => s + (+d.fee || 0), 0);
    const partnerFees = yDeals.reduce((s, d) => s + (+d.fee || 0) * ((+d.partnerFeePct || 0) / 100), 0);
    const netIncome = yDeals.reduce((s, d) => s + netFee(d), 0);
    const collected = yDeals.filter((d) => d.paid).reduce((s, d) => s + (+d.paidAmount || netFee(d)), 0);
    const expenses = yBills.reduce((s, b) => s + (+b.amount || 0), 0);
    const profit = collected - expenses;
    const taxReserve = profit * (settings.taxRate || 0.3);

    // Income by brand
    const byBrand = {};
    yDeals.forEach((d) => { byBrand[d.company] = (byBrand[d.company] || 0) + netFee(d); });
    const brandRows = Object.entries(byBrand).sort((a, b) => b[1] - a[1]);

    // Expense by category
    const byCat = {};
    yBills.forEach((b) => { byCat[b.category || "Other"] = (byCat[b.category || "Other"] || 0) + (+b.amount || 0); });
    const catRows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

    // Monthly profit
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
    const incMonth = Object.fromEntries(months.map((m) => [m, 0]));
    const expMonth = Object.fromEntries(months.map((m) => [m, 0]));
    yDeals.forEach((d) => { const k = monthKey(d.paidDate || d.serviceDate || d.invoiceDate); if (k in incMonth) incMonth[k] += netFee(d); });
    yBills.forEach((b) => { const k = monthKey(b.date); if (k in expMonth) expMonth[k] += (+b.amount || 0); });

    // Quarterly cash collected & estimated tax
    const qData = quarterlyBreakdown(deals.filter((d) => d.paid && (d.paidDate || "").startsWith(year)), settings.taxRate || 0.3);
    // Margin by service
    const svcMargin = serviceMargin(yDeals, yBills);

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Reports"),
          el("div", { class: "sub" }, "Profit & loss, expense breakdown, and tax estimates."),
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
          el("button", { class: "btn", onclick: () => window.print() }, "Print"),
        ),
      ),

      el("div", { class: "kpi-grid" },
        kpi("Gross income", fmtMoney(grossIncome)),
        kpi("Partner fees", `−${fmtMoney(partnerFees)}`),
        kpi("Net income (booked)", fmtMoney(netIncome)),
        kpi("Cash collected", fmtMoney(collected)),
        kpi("Expenses", `−${fmtMoney(expenses)}`),
        kpi("Profit (cash − exp)", fmtMoney(profit), profit >= 0 ? "up" : "down"),
        kpi("Tax reserve", fmtMoney(taxReserve), null, `at ${Math.round((settings.taxRate || .3) * 100)}%`),
      ),

      el("div", { class: "card" },
        el("h3", {}, `Profit & Loss · ${year}`),
        el("table", { class: "data", style: { minWidth: "0" } },
          el("tbody", {},
            row2("Gross income", fmtMoney(grossIncome)),
            row2("Less: partner fees", `−${fmtMoney(partnerFees)}`, true),
            row2("Net revenue", fmtMoney(netIncome), true),
            row2("Operating expenses", `−${fmtMoney(expenses)}`),
            row2("Net profit (booked)", fmtMoney(netIncome - expenses), true, true),
            row2("Cash collected", fmtMoney(collected)),
            row2("Cash profit", fmtMoney(profit), true, true),
          ),
        ),
      ),

      el("div", { class: "dash-grid" },
        el("div", { class: "card" },
          el("h3", {}, "Income by brand"),
          brandRows.length === 0 ? el("div", { class: "empty small" }, "No income yet.")
            : el("table", { class: "data" },
                el("tbody", {}, ...brandRows.map(([k, v]) => el("tr", {},
                  el("td", {}, k || "—"),
                  el("td", { class: "num" }, fmtMoney(v)),
                  el("td", { class: "num small muted" }, `${Math.round((v / Math.max(1, netIncome)) * 100)}%`),
                ))),
              ),
        ),
        el("div", { class: "card" },
          el("h3", {}, "Expenses by category"),
          catRows.length === 0 ? el("div", { class: "empty small" }, "No expenses yet.")
            : el("table", { class: "data" },
                el("tbody", {}, ...catRows.map(([k, v]) => el("tr", {},
                  el("td", {}, k),
                  el("td", { class: "num" }, fmtMoney(v)),
                  el("td", { class: "num small muted" }, `${Math.round((v / Math.max(1, expenses)) * 100)}%`),
                ))),
              ),
        ),
      ),

      el("div", { class: "card" },
        el("h3", {}, `Monthly net · ${year}`),
        el("div", { class: "chart-wrap" }, el("canvas", { id: "monthly-chart" })),
      ),

      el("div", { class: "card" },
        el("h3", {}, `Quarterly estimated tax · ${year}`),
        el("div", { class: "small muted", style: { marginBottom: 8 } }, `Reserve rate ${Math.round((settings.taxRate || 0.3) * 100)}% of cash collected. US estimated-tax due dates shown for reference.`),
        el("table", { class: "data" },
          el("thead", {}, el("tr", {},
            el("th", {}, "Quarter"),
            el("th", {}, "Period"),
            el("th", {}, "Due"),
            el("th", { class: "num" }, "Cash collected"),
            el("th", { class: "num" }, "Reserve"),
          )),
          el("tbody", {}, ...qData.map((q) => el("tr", {},
            el("td", { style: { fontWeight: 600 } }, q.label),
            el("td", { class: "small muted" }, q.period),
            el("td", { class: "small muted" }, q.due),
            el("td", { class: "num" }, fmtMoney(q.collected)),
            el("td", { class: "num" }, fmtMoney(q.reserve)),
          ))),
        ),
      ),

      el("div", { class: "card" },
        el("h3", {}, "Margin by service type"),
        el("div", { class: "small muted", style: { marginBottom: 8 } }, "Allocates expenses pro-rata by income share. Use as a rough guide."),
        el("table", { class: "data" },
          el("thead", {}, el("tr", {},
            el("th", {}, "Service"),
            el("th", { class: "num" }, "Deals"),
            el("th", { class: "num" }, "Net income"),
            el("th", { class: "num" }, "Allocated cost"),
            el("th", { class: "num" }, "Profit"),
            el("th", { class: "num" }, "Margin"),
          )),
          el("tbody", {}, ...svcMargin.map((r) => el("tr", {},
            el("td", {}, r.label),
            el("td", { class: "num" }, r.count),
            el("td", { class: "num" }, fmtMoney(r.income)),
            el("td", { class: "num muted" }, fmtMoney(r.cost)),
            el("td", { class: "num" }, fmtMoney(r.profit)),
            el("td", { class: "num" }, `${r.margin.toFixed(0)}%`),
          ))),
        ),
      ),
    );

    requestAnimationFrame(() => {
      if (chart) chart.destroy();
      const ctx = node.querySelector("#monthly-chart");
      if (!ctx || !window.Chart) return;
      chart = new window.Chart(ctx, {
        type: "bar",
        data: {
          labels: months.map(monthLabel),
          datasets: [
            { label: "Income", data: months.map((m) => incMonth[m]), backgroundColor: "#22c55e", borderRadius: 4 },
            { label: "Expenses", data: months.map((m) => -expMonth[m]), backgroundColor: "#ef4444", borderRadius: 4 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: "#8a93a6" } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtMoney(Math.abs(c.parsed.y))}` } } },
          scales: {
            x: { grid: { color: "#232936" }, ticks: { color: "#8a93a6" } },
            y: { grid: { color: "#232936" }, ticks: { color: "#8a93a6", callback: (v) => fmtMoneyShort(v) } },
          },
        },
      });
    });
  };

  const unsub = subscribe(render);
  render();
  return { node, unmount: () => { unsub(); if (chart) chart.destroy(); } };
}

function kpi(label, value, dir, sub) {
  return el("div", { class: `card kpi ${dir || ""}` },
    el("div", { class: "kpi-sub" }, label),
    el("div", { class: "kpi-value" }, value),
    sub && el("div", { class: "kpi-sub" }, sub),
  );
}

function quarterlyBreakdown(paidDeals, rate) {
  const Q = [
    { label: "Q1", months: [0, 1, 2], period: "Jan–Mar", due: "Apr 15" },
    { label: "Q2", months: [3, 4], period: "Apr–May", due: "Jun 15" },
    { label: "Q3", months: [5, 6, 7], period: "Jun–Aug", due: "Sep 15" },
    { label: "Q4", months: [8, 9, 10, 11], period: "Sep–Dec", due: "Jan 15" },
  ];
  return Q.map((q) => {
    const collected = paidDeals.filter((d) => {
      const m = +(d.paidDate || "").slice(5, 7) - 1;
      return q.months.includes(m);
    }).reduce((s, d) => s + (+d.paidAmount || 0), 0);
    return { ...q, collected, reserve: collected * rate };
  });
}

function serviceMargin(deals, bills) {
  const groups = {};
  deals.forEach((d) => {
    const k = d.svc || "—";
    if (!groups[k]) groups[k] = { svc: k, count: 0, income: 0 };
    groups[k].count += 1;
    groups[k].income += netFee(d);
  });
  const totalIncome = Object.values(groups).reduce((s, g) => s + g.income, 0);
  const totalCost = bills.reduce((s, b) => s + (+b.amount || 0), 0);
  return Object.values(groups).map((g) => {
    const cost = totalIncome ? totalCost * (g.income / totalIncome) : 0;
    const profit = g.income - cost;
    return {
      label: serviceMeta(g.svc).label,
      count: g.count,
      income: g.income,
      cost,
      profit,
      margin: g.income ? (profit / g.income) * 100 : 0,
    };
  }).sort((a, b) => b.income - a.income);
}

function row2(k, v, bold, big) {
  return el("tr", { style: bold ? { borderTop: "1px solid #2c3342" } : null },
    el("td", { style: bold ? { fontWeight: 600 } : null }, k),
    el("td", { class: "num", style: { ...(bold ? { fontWeight: 700 } : {}), ...(big ? { fontSize: "16px" } : {}) } }, v),
  );
}
