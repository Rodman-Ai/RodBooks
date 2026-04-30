import { el, fmtMoney, fmtMoneyShort, fmtDate, monthKey, monthLabel, netFee, dealStatus, initials, parseDate } from "../utils.js";
import { Deals, Bills, Settings, subscribe } from "../store.js";
import { go } from "../router.js";

export default function dashboard() {
  const node = el("div", {});
  let chart;
  const render = () => {
    node.innerHTML = "";
    const deals = Deals.all();
    const bills = Bills.all();
    const settings = Settings.get();

    const now = new Date();
    const ym = now.toISOString().slice(0, 7);
    const yyyy = now.getFullYear();

    const earned = (d) => netFee(d);
    const monthDeals = deals.filter((d) => monthKey(d.serviceDate || d.postDate || d.invoiceDate || d.paidDate) === ym);
    const yearDeals = deals.filter((d) => {
      const k = (d.serviceDate || d.postDate || d.invoiceDate || d.paidDate || "").slice(0, 4);
      return k === String(yyyy);
    });

    const incomeMonth = monthDeals.reduce((s, d) => s + earned(d), 0);
    const incomeYear = yearDeals.reduce((s, d) => s + earned(d), 0);
    const outstanding = deals.filter((d) => !d.paid).reduce((s, d) => s + earned(d), 0);
    const paidYTD = yearDeals.filter((d) => d.paid).reduce((s, d) => s + (Number(d.paidAmount) || earned(d)), 0);
    const expensesYTD = bills.filter((b) => (b.date || "").startsWith(String(yyyy))).reduce((s, b) => s + (+b.amount || 0), 0);
    const expensesMonth = bills.filter((b) => (b.date || "").startsWith(ym)).reduce((s, b) => s + (+b.amount || 0), 0);
    const profitYTD = paidYTD - expensesYTD;
    const taxReserve = profitYTD * (settings.taxRate || 0.3);

    // KPI grid
    const kpis = el("div", { class: "kpi-grid" },
      kpiCard("Income · This month", fmtMoney(incomeMonth), `${monthDeals.length} deal${monthDeals.length === 1 ? "" : "s"}`, "up"),
      kpiCard("Outstanding", fmtMoney(outstanding), "Unpaid invoices"),
      kpiCard("Paid YTD", fmtMoney(paidYTD), `${yyyy}`),
      kpiCard("Expenses YTD", fmtMoney(expensesYTD), `${fmtMoney(expensesMonth)} this month`),
      kpiCard("Profit YTD", fmtMoney(profitYTD), `Tax reserve ~${fmtMoney(taxReserve)}`, profitYTD >= 0 ? "up" : "down"),
    );
    node.append(kpis);

    // 12-month trend
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(d.toISOString().slice(0, 7));
    }
    const incomeByMonth = Object.fromEntries(months.map((m) => [m, 0]));
    const expByMonth = Object.fromEntries(months.map((m) => [m, 0]));
    deals.forEach((d) => {
      const k = monthKey(d.paidDate || d.serviceDate || d.postDate || d.invoiceDate);
      if (k in incomeByMonth) incomeByMonth[k] += earned(d);
    });
    bills.forEach((b) => {
      const k = monthKey(b.date);
      if (k in expByMonth) expByMonth[k] += +b.amount || 0;
    });

    const chartCard = el("div", { class: "card" },
      el("div", { class: "spread" },
        el("h3", {}, "12-month trend"),
        el("div", { class: "row small muted" },
          el("span", {}, "● Income"),
          el("span", { style: { marginLeft: "10px" } }, "● Expenses"),
        ),
      ),
      el("div", { class: "chart-wrap" }, el("canvas", { id: "trend-chart" })),
    );

    // Top brands
    const brandTotals = {};
    yearDeals.forEach((d) => {
      const k = d.company || "—";
      brandTotals[k] = (brandTotals[k] || 0) + earned(d);
    });
    const top = Object.entries(brandTotals).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const topCard = el("div", { class: "card" },
      el("h3", {}, "Top brands · YTD"),
      el("div", { class: "list" },
        top.length === 0 ? el("div", { class: "empty small" }, "No deals this year yet.")
          : top.map(([brand, total]) => el("div", { class: "list-row" },
              el("div", { class: "avatar" }, initials(brand)),
              el("div", { style: { flex: 1 } },
                el("div", {}, brand),
                el("div", { class: "small muted" }, `${yearDeals.filter((d) => d.company === brand).length} deals`),
              ),
              el("div", { style: { fontVariantNumeric: "tabular-nums", fontWeight: 600 } }, fmtMoney(total)),
            )),
      ),
    );

    // Recent activity
    const recent = [...deals]
      .map((d) => ({
        d,
        date: d.paidDate || d.invoiceDate || d.postDate || d.serviceDate || "",
      }))
      .filter((r) => r.date)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 8);
    const recentCard = el("div", { class: "card" },
      el("div", { class: "spread" },
        el("h3", {}, "Recent activity"),
        el("a", { class: "small muted", href: "#/deals" }, "View all →"),
      ),
      el("div", { class: "list" },
        recent.length === 0 ? el("div", { class: "empty small" }, "Nothing yet.")
          : recent.map(({ d, date }) => {
              const status = dealStatus(d);
              return el("div", { class: "list-row", onclick: () => go(`/deals/${d.id}`), style: { cursor: "pointer" } },
                el("div", { class: "avatar" }, initials(d.company)),
                el("div", { style: { flex: 1, minWidth: 0 } },
                  el("div", { class: "truncate" }, d.company || "Untitled"),
                  el("div", { class: "small muted" }, fmtDate(date)),
                ),
                el("div", { class: "row" },
                  el("span", { class: `pill ${status.cls}` }, status.label),
                  el("div", { style: { fontVariantNumeric: "tabular-nums", fontWeight: 600, marginLeft: "8px" } }, fmtMoneyShort(earned(d))),
                ),
              );
            }),
      ),
    );

    const grid = el("div", { class: "dash-grid" },
      chartCard,
      el("div", { class: "stack" }, topCard, recentCard),
    );
    node.append(grid);

    // Upcoming due
    const upcoming = deals.filter((d) => !d.paid && d.draftDue).sort((a, b) => a.draftDue.localeCompare(b.draftDue)).slice(0, 5);
    if (upcoming.length) {
      const dueCard = el("div", { class: "card" },
        el("h3", {}, "Upcoming drafts"),
        el("div", { class: "list" },
          upcoming.map((d) => el("div", { class: "list-row", onclick: () => go(`/deals/${d.id}`) },
            el("div", { class: "avatar" }, initials(d.company)),
            el("div", { style: { flex: 1 } },
              el("div", {}, d.company),
              el("div", { class: "small muted" }, `Draft due ${fmtDate(d.draftDue)}`),
            ),
            el("div", {}, fmtMoney(earned(d))),
          )),
        ),
      );
      node.append(dueCard);
    }

    // Render chart after attach
    requestAnimationFrame(() => {
      if (chart) chart.destroy();
      const ctx = node.querySelector("#trend-chart");
      if (!ctx || !window.Chart) return;
      const grid = "#232936";
      const text = "#8a93a6";
      chart = new window.Chart(ctx, {
        type: "bar",
        data: {
          labels: months.map((m) => monthLabel(m)),
          datasets: [
            { label: "Income", data: months.map((m) => incomeByMonth[m]), backgroundColor: "#22c55e", borderRadius: 4 },
            { label: "Expenses", data: months.map((m) => expByMonth[m]), backgroundColor: "#ef4444", borderRadius: 4 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtMoney(c.parsed.y)}` } } },
          scales: {
            x: { grid: { color: grid }, ticks: { color: text } },
            y: { grid: { color: grid }, ticks: { color: text, callback: (v) => fmtMoneyShort(v) } },
          },
        },
      });
    });
  };

  const unsub = subscribe(render);
  render();
  return { node, unmount: () => { unsub(); if (chart) chart.destroy(); } };
}

function kpiCard(label, value, sub, dir) {
  return el("div", { class: `card kpi ${dir || ""}` },
    el("div", { class: "kpi-sub" }, label),
    el("div", { class: "kpi-value" }, value),
    sub && el("div", { class: "kpi-sub" }, sub),
  );
}
