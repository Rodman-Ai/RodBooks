import { el, fmtMoney, fmtMoneyShort, monthKey, monthLabel, netFee } from "../utils.js";
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

function row2(k, v, bold, big) {
  return el("tr", { style: bold ? { borderTop: "1px solid #2c3342" } : null },
    el("td", { style: bold ? { fontWeight: 600 } : null }, k),
    el("td", { class: "num", style: { ...(bold ? { fontWeight: 700 } : {}), ...(big ? { fontSize: "16px" } : {}) } }, v),
  );
}
