// Tableau-style dashboard: shared filter bar, cross-linked charts, drill-down.

import { el, fmtMoney, fmtMoneyShort, fmtDate, monthKey, monthLabel, netFee, dealStatus, serviceMeta, initials, brandWarmth } from "../utils.js";
import { Deals, Bills, Settings, subscribe } from "../store.js";
import { go } from "../router.js";
import { generateProposals } from "../automations.js";

const FILTER_KEY = "rodbooks:filters:dashboard";
const SERVICE_LABELS = {
  v: "Video", p: "Post", "p prep": "Pre-post", postp: "Post-post",
  qrt: "Quote/RT", rt: "Repost", "qrt rt": "Quote+Repost",
  "c+l": "Comment+Like", incentive: "Incentive", x: "Other",
};

function loadFilters() { try { return JSON.parse(localStorage.getItem(FILTER_KEY)) || {}; } catch { return {}; } }
function saveFilters(f) { localStorage.setItem(FILTER_KEY, JSON.stringify(f)); }

export default function dashboard() {
  const node = el("div", {});
  let charts = [];
  let filters = { year: "all", svc: "all", status: "all", brand: "all", month: "", ...loadFilters() };

  const apply = (patch) => { filters = { ...filters, ...patch }; saveFilters(filters); render(); };

  const render = () => {
    // Tear down charts before re-render
    charts.forEach((c) => { try { c.destroy(); } catch {} });
    charts = [];

    const allDeals = Deals.all();
    const allBills = Bills.all();
    const settings = Settings.get();

    const yearsSet = new Set();
    allDeals.forEach((d) => { const y = (d.serviceDate || d.paidDate || d.invoiceDate || "").slice(0, 4); if (y) yearsSet.add(y); });
    allBills.forEach((b) => { const y = (b.date || "").slice(0, 4); if (y) yearsSet.add(y); });
    const years = Array.from(yearsSet).sort().reverse();
    const services = Array.from(new Set(allDeals.map((d) => d.svc).filter(Boolean))).sort();
    const brands = Array.from(new Set(allDeals.map((d) => d.company).filter(Boolean))).sort();

    // Apply filters
    const matchesDeal = (d) => {
      const yr = (d.serviceDate || d.paidDate || d.invoiceDate || "").slice(0, 4);
      if (filters.year !== "all" && yr !== filters.year) return false;
      if (filters.svc !== "all" && (d.svc || "") !== filters.svc) return false;
      if (filters.status === "paid" && !d.paid) return false;
      if (filters.status === "unpaid" && d.paid) return false;
      if (filters.brand !== "all" && d.company !== filters.brand) return false;
      if (filters.month) {
        const k = monthKey(d.serviceDate || d.paidDate || d.invoiceDate || d.postDate);
        if (k !== filters.month) return false;
      }
      return true;
    };
    const matchesBill = (b) => {
      const yr = (b.date || "").slice(0, 4);
      if (filters.year !== "all" && yr !== filters.year) return false;
      if (filters.month && monthKey(b.date) !== filters.month) return false;
      return true;
    };
    const deals = allDeals.filter(matchesDeal);
    const bills = allBills.filter(matchesBill);

    // KPI calcs (filtered)
    const earned = (d) => netFee(d);
    const totalIncome = deals.reduce((s, d) => s + earned(d), 0);
    const collected = deals.filter((d) => d.paid).reduce((s, d) => s + (d.paidAmount || earned(d)), 0);
    const outstanding = deals.filter((d) => !d.paid).reduce((s, d) => s + earned(d), 0);
    const expenses = bills.reduce((s, b) => s + (+b.amount || 0), 0);
    const profit = collected - expenses;
    const taxReserve = profit * (settings.taxRate || 0.3);

    // YoY comparison (only meaningful if year selected or implicit current year)
    const yoy = computeYoY(allDeals, allBills, filters);

    // ---- Filter bar ----
    const filterBar = el("div", { class: "filter-bar" },
      pill("All time", filters.year === "all" && !filters.month, () => apply({ year: "all", month: "" })),
      ...years.map((y) => pill(y, filters.year === y && !filters.month, () => apply({ year: y, month: "" }))),
      el("div", { class: "vsep" }),
      select("All services", services.map((s) => ({ value: s, label: SERVICE_LABELS[s] || s })), filters.svc, (v) => apply({ svc: v })),
      select("All brands", brands.map((b) => ({ value: b, label: b })), filters.brand, (v) => apply({ brand: v })),
      select("All status", [{ value: "paid", label: "Paid" }, { value: "unpaid", label: "Outstanding" }], filters.status, (v) => apply({ status: v })),
      filters.month && pill(`Month: ${monthLabel(filters.month)} ✕`, true, () => apply({ month: "" })),
      el("div", { class: "spacer" }),
      el("button", { class: "btn ghost", onclick: () => apply({ year: "all", svc: "all", status: "all", brand: "all", month: "" }) }, "Reset"),
    );

    // ---- KPI row ----
    const kpis = el("div", { class: "kpi-grid" },
      kpiCard("Income (booked)", fmtMoney(totalIncome), yoyChip(yoy.income), "up"),
      kpiCard("Cash collected", fmtMoney(collected), yoyChip(yoy.collected)),
      kpiCard("Outstanding", fmtMoney(outstanding), `${deals.filter((d) => !d.paid).length} unpaid`),
      kpiCard("Expenses", fmtMoney(expenses), yoyChip(yoy.expenses, true)),
      kpiCard("Profit", fmtMoney(profit), `Tax reserve ${fmtMoney(taxReserve)}`, profit >= 0 ? "up" : "down"),
      kpiCard("Avg deal", fmtMoney(deals.length ? totalIncome / deals.length : 0), `${deals.length} deals`),
    );

    // ---- Proposals strip ----
    const proposals = generateProposals();
    const propStrip = proposals.length
      ? el("div", { class: "card", style: { borderLeft: "3px solid var(--accent)" } },
          el("div", { class: "spread" },
            el("div", {},
              el("strong", {}, `${proposals.length} automation${proposals.length === 1 ? "" : "s"} proposed`),
              el("div", { class: "small muted" },
                proposals.slice(0, 3).map((p) => p.title).join(" · ")),
            ),
            el("a", { class: "btn", href: "#/automations" }, "Review →"),
          ),
        )
      : null;

    // ---- Trend chart (24 months) with drill-down ----
    const trendCard = el("div", { class: "card" },
      el("div", { class: "spread" },
        el("h3", {}, "Income vs. expenses · last 24 months"),
        el("div", { class: "row small muted" },
          el("span", {}, "Click a bar to drill into that month"),
          el("button", { class: "btn sm ghost", title: "Download PNG", onclick: () => downloadChart("ch-trend", "income-vs-expenses") }, "↓ PNG"),
        ),
      ),
      el("div", { class: "chart-wrap" }, el("canvas", { id: "ch-trend" })),
    );

    // ---- Pipeline funnel ----
    const stages = ["Pending", "Brief", "Draft", "Posted", "Invoiced", "Paid"];
    const stageCounts = stages.map((s) => 0);
    deals.forEach((d) => {
      stageCounts[0]++;
      if (d.briefUrl) stageCounts[1]++;
      if (d.draftUrl) stageCounts[2]++;
      if (d.postDate) stageCounts[3]++;
      if (d.invoiceDate || d.invoiceNumber) stageCounts[4]++;
      if (d.paid) stageCounts[5]++;
    });
    const funnelCard = el("div", { class: "card" },
      el("h3", {}, "Pipeline funnel"),
      el("div", { class: "funnel" },
        ...stages.map((label, i) => {
          const pct = stageCounts[0] ? stageCounts[i] / stageCounts[0] : 0;
          return el("div", { class: "funnel-row" },
            el("div", { class: "funnel-label" }, label),
            el("div", { class: "funnel-bar-wrap" },
              el("div", { class: "funnel-bar", style: { width: `${pct * 100}%` } },
                el("span", { class: "funnel-num" }, `${stageCounts[i]} · ${(pct * 100).toFixed(0)}%`),
              ),
            ),
          );
        }),
      ),
    );

    // ---- Brand donut + Service mix ----
    const brandTotals = {};
    deals.forEach((d) => { brandTotals[d.company || "—"] = (brandTotals[d.company || "—"] || 0) + earned(d); });
    const brandSorted = Object.entries(brandTotals).sort((a, b) => b[1] - a[1]);
    const top10 = brandSorted.slice(0, 10);
    const otherSum = brandSorted.slice(10).reduce((s, [, v]) => s + v, 0);
    const donutLabels = top10.map(([k]) => k);
    const donutData = top10.map(([, v]) => v);
    if (otherSum > 0) { donutLabels.push("Others"); donutData.push(otherSum); }

    const brandCard = el("div", { class: "card" },
      el("div", { class: "spread" },
        el("h3", {}, "Brand mix"),
        el("div", { class: "small muted" }, "Click a slice"),
      ),
      el("div", { class: "chart-wrap", style: { height: "260px" } }, el("canvas", { id: "ch-brand" })),
    );

    const svcMix = {};
    deals.forEach((d) => { svcMix[d.svc || "—"] = (svcMix[d.svc || "—"] || 0) + 1; });
    const svcRows = Object.entries(svcMix).sort((a, b) => b[1] - a[1]);
    const svcTotal = svcRows.reduce((s, [, v]) => s + v, 0);
    const svcCard = el("div", { class: "card" },
      el("h3", {}, "Service mix"),
      el("div", { class: "list" },
        svcRows.length === 0 ? el("div", { class: "empty small" }, "No deals match.") :
        svcRows.map(([k, v]) => {
          const sm = serviceMeta(k);
          return el("div", { class: "list-row", style: { cursor: "pointer" }, onclick: () => apply({ svc: filters.svc === k ? "all" : k }) },
            el("span", { class: `pill ${sm.cls}`, style: { minWidth: "100px", justifyContent: "center" } }, sm.label),
            el("div", { style: { flex: 1, height: "8px", background: "var(--bg-3)", borderRadius: "4px", overflow: "hidden" } },
              el("div", { style: { width: `${(v / svcTotal) * 100}%`, height: "100%", background: "var(--accent)" } }),
            ),
            el("div", { style: { minWidth: "80px", textAlign: "right" } }, `${v} · ${Math.round((v / svcTotal) * 100)}%`),
          );
        }),
      ),
    );

    // ---- Heatmap (year × month) ----
    const heatYears = Array.from(yearsSet).sort();
    const heatGrid = {};
    heatYears.forEach((y) => { heatGrid[y] = Array.from({ length: 12 }, () => 0); });
    allDeals.forEach((d) => {
      const dt = d.serviceDate || d.paidDate || d.invoiceDate || "";
      if (!dt) return;
      const y = dt.slice(0, 4); const m = +dt.slice(5, 7) - 1;
      if (heatGrid[y]) heatGrid[y][m] += earned(d);
    });
    const maxCell = Math.max(1, ...Object.values(heatGrid).flat());
    const heatmapCard = el("div", { class: "card" },
      el("div", { class: "spread" },
        el("h3", {}, "Income heatmap · year × month"),
        el("div", { class: "small muted" }, "Click a cell to filter"),
      ),
      el("div", { class: "heatmap" },
        el("div", { class: "heat-corner" }),
        ...["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
          .map((m) => el("div", { class: "heat-h" }, m)),
        ...heatYears.flatMap((y) => [
          el("div", { class: "heat-y" }, y),
          ...Array.from({ length: 12 }, (_, i) => {
            const v = heatGrid[y][i];
            const opacity = v / maxCell;
            const ym = `${y}-${String(i + 1).padStart(2, "0")}`;
            const sel = filters.month === ym;
            return el("div", {
              class: `heat-cell ${sel ? "selected" : ""}`,
              style: { background: `rgba(34,197,94,${opacity * 0.85 + 0.05})` },
              title: `${ym}: ${fmtMoney(v)}`,
              onclick: () => apply({ month: sel ? "" : ym, year: y }),
            }, v ? fmtMoneyShort(v) : "");
          }),
        ]),
      ),
    );

    // ---- Cycle time histogram (days from service to paid) ----
    const cycleSamples = allDeals.filter((d) => d.paid && d.serviceDate && d.paidDate)
      .map((d) => Math.round((new Date(d.paidDate) - new Date(d.serviceDate)) / 86400000))
      .filter((n) => n >= 0 && n <= 200);
    const buckets = [0, 0, 0, 0, 0, 0]; // 0-15, 16-30, 31-45, 46-60, 61-90, 90+
    cycleSamples.forEach((n) => {
      if (n <= 15) buckets[0]++;
      else if (n <= 30) buckets[1]++;
      else if (n <= 45) buckets[2]++;
      else if (n <= 60) buckets[3]++;
      else if (n <= 90) buckets[4]++;
      else buckets[5]++;
    });
    const median = cycleSamples.sort((a, b) => a - b)[Math.floor(cycleSamples.length / 2)] || 0;
    const cycleCard = el("div", { class: "card" },
      el("div", { class: "spread" },
        el("h3", {}, "Days from service → paid"),
        el("div", { class: "small muted" }, `Median ${median}d · n=${cycleSamples.length}`),
      ),
      el("div", { class: "chart-wrap", style: { height: "200px" } }, el("canvas", { id: "ch-cycle" })),
    );

    // ---- Top brands table (drill into brand page) — with warmth ----
    const brandTable = el("div", { class: "card" },
      el("h3", {}, "Top brands"),
      el("div", { class: "table-scroll" },
        (function () {
          const t = el("table", { class: "data" });
          t.append(el("thead", {}, el("tr", {},
            el("th", {}, "Brand"),
            el("th", { class: "num" }, "Deals"),
            el("th", { class: "num" }, "Net"),
            el("th", { class: "num" }, "Outstanding"),
            el("th", {}, "Warmth"),
          )));
          const tb = el("tbody");
          brandSorted.slice(0, 12).forEach(([brand, total]) => {
            const ds = allDeals.filter((d) => d.company === brand);
            const ds2 = deals.filter((d) => d.company === brand);
            const out = ds2.filter((d) => !d.paid).reduce((s, d) => s + earned(d), 0);
            const w = brandWarmth(ds);
            const warmCls = w >= 70 ? "green" : w >= 40 ? "amber" : "gray";
            tb.append(el("tr", { onclick: () => go(`/brand/${encodeURIComponent(brand)}`) },
              el("td", {}, el("div", { class: "row" }, el("div", { class: "avatar" }, initials(brand)), el("span", {}, brand))),
              el("td", { class: "num" }, ds2.length),
              el("td", { class: "num" }, fmtMoney(total)),
              el("td", { class: "num", style: out ? { color: "var(--warn)" } : null }, fmtMoney(out)),
              el("td", {}, el("span", { class: `pill ${warmCls}` }, `${w}°`)),
            ));
          });
          t.append(tb);
          return t;
        })(),
      ),
    );

    // ---- Largest deals leaderboard ----
    const biggest = [...deals].sort((a, b) => earned(b) - earned(a)).slice(0, 8);
    const biggestCard = el("div", { class: "card" },
      el("h3", {}, "Top deals"),
      el("div", { class: "list" },
        biggest.length === 0 ? el("div", { class: "empty small" }, "No deals match.") :
        biggest.map((d) => {
          const status = dealStatus(d);
          return el("div", { class: "list-row", style: { cursor: "pointer" }, onclick: () => go(`/deals/${d.id}`) },
            el("div", { class: "avatar" }, initials(d.company)),
            el("div", { style: { flex: 1, minWidth: 0 } },
              el("div", { class: "truncate" }, d.company),
              el("div", { class: "small muted" }, fmtDate(d.serviceDate || d.paidDate) || "—"),
            ),
            el("span", { class: `pill ${status.cls}` }, status.label),
            el("div", { style: { minWidth: "80px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 } }, fmtMoney(earned(d))),
          );
        }),
      ),
    );

    // ---- Goal tracker ----
    const goalCard = goalProgress(allDeals, settings);
    // ---- 90-day forecast ----
    const forecastCard = forecastProgress(allDeals);

    // ---- Compose ----
    node.innerHTML = "";
    node.append(
      filterBar,
      kpis,
      propStrip,
      el("div", { class: "dash-grid" }, goalCard, forecastCard),
      trendCard,
      el("div", { class: "dash-grid" }, funnelCard, brandCard),
      el("div", { class: "dash-grid" }, heatmapCard, svcCard),
      el("div", { class: "dash-grid" }, brandTable, el("div", { class: "stack" }, biggestCard, cycleCard)),
    );

    requestAnimationFrame(() => buildCharts(deals, bills, donutLabels, donutData, buckets));
  };

  function buildCharts(deals, bills, donutLabels, donutData, cycleBuckets) {
    if (!window.Chart) return;
    const grid = "#232936", text = "#8a93a6";
    const now = new Date();
    const months = [];
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(d.toISOString().slice(0, 7));
    }
    const incBy = Object.fromEntries(months.map((m) => [m, 0]));
    const expBy = Object.fromEntries(months.map((m) => [m, 0]));
    deals.forEach((d) => { const k = monthKey(d.paidDate || d.serviceDate || d.invoiceDate); if (k in incBy) incBy[k] += netFee(d); });
    bills.forEach((b) => { const k = monthKey(b.date); if (k in expBy) expBy[k] += +b.amount || 0; });

    // Trend chart
    const trendCtx = node.querySelector("#ch-trend");
    if (trendCtx) {
      const ch = new window.Chart(trendCtx, {
        type: "bar",
        data: {
          labels: months.map(monthLabel),
          datasets: [
            { label: "Income", data: months.map((m) => incBy[m]), backgroundColor: "#22c55e", borderRadius: 4, stack: "0" },
            { label: "Expenses", data: months.map((m) => -expBy[m]), backgroundColor: "#ef4444", borderRadius: 4, stack: "1" },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          onClick: (_, els) => {
            if (!els.length) return;
            const i = els[0].index;
            const ym = months[i];
            apply({ month: filters.month === ym ? "" : ym });
          },
          plugins: {
            legend: { labels: { color: text } },
            tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtMoney(Math.abs(c.parsed.y))}` } },
          },
          scales: {
            x: { grid: { color: grid }, ticks: { color: text, maxRotation: 0, autoSkip: true } },
            y: { grid: { color: grid }, ticks: { color: text, callback: (v) => fmtMoneyShort(v) } },
          },
        },
      });
      charts.push(ch);
    }

    // Brand donut
    const brandCtx = node.querySelector("#ch-brand");
    if (brandCtx) {
      const palette = ["#22c55e", "#3b82f6", "#a78bfa", "#ec4899", "#f59e0b", "#14b8a6", "#ef4444", "#8b5cf6", "#0ea5e9", "#f97316", "#64748b"];
      const ch = new window.Chart(brandCtx, {
        type: "doughnut",
        data: { labels: donutLabels, datasets: [{ data: donutData, backgroundColor: palette, borderColor: "#11141a", borderWidth: 2 }] },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: "62%",
          onClick: (_, els) => {
            if (!els.length) return;
            const brand = donutLabels[els[0].index];
            if (brand && brand !== "Others") go(`/brand/${encodeURIComponent(brand)}`);
          },
          plugins: {
            legend: { position: "right", labels: { color: text, boxWidth: 10, font: { size: 11 } } },
            tooltip: { callbacks: { label: (c) => `${c.label}: ${fmtMoney(c.parsed)}` } },
          },
        },
      });
      charts.push(ch);
    }

    // Cycle histogram
    const cycCtx = node.querySelector("#ch-cycle");
    if (cycCtx) {
      const labels = ["0–15d", "16–30d", "31–45d", "46–60d", "61–90d", "90+d"];
      const ch = new window.Chart(cycCtx, {
        type: "bar",
        data: { labels, datasets: [{ data: cycleBuckets, backgroundColor: ["#22c55e", "#22c55e", "#a78bfa", "#f59e0b", "#f59e0b", "#ef4444"], borderRadius: 4 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.parsed.y} deals` } } },
          scales: {
            x: { grid: { color: grid }, ticks: { color: text } },
            y: { grid: { color: grid }, ticks: { color: text, precision: 0 } },
          },
        },
      });
      charts.push(ch);
    }
  }

  const unsub = subscribe(render);
  render();
  return { node, unmount: () => { unsub(); charts.forEach((c) => { try { c.destroy(); } catch {} }); } };
}

function downloadChart(canvasId, name) {
  const c = document.getElementById(canvasId);
  if (!c) return;
  const a = document.createElement("a");
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.png`;
  a.href = c.toDataURL("image/png");
  a.click();
}

function pill(label, active, onclick) {
  return el("button", { class: `chip ${active ? "active" : ""}`, onclick }, label);
}
function select(allLabel, options, value, onChange) {
  const s = el("select", { class: "select" });
  s.append(el("option", { value: "all" }, allLabel));
  options.forEach((o) => {
    const opt = el("option", { value: o.value }, o.label);
    if (o.value === value) opt.selected = true;
    s.append(opt);
  });
  s.addEventListener("change", () => onChange(s.value));
  return s;
}

function kpiCard(label, value, sub, dir) {
  return el("div", { class: `card kpi ${dir || ""}` },
    el("div", { class: "kpi-sub" }, label),
    el("div", { class: "kpi-value" }, value),
    sub ? (typeof sub === "string" ? el("div", { class: "kpi-sub" }, sub) : sub) : null,
  );
}

function yoyChip(delta, invert) {
  if (delta == null || !isFinite(delta)) return null;
  const up = delta >= 0;
  const positive = invert ? !up : up;
  const arrow = up ? "▲" : "▼";
  const color = positive ? "var(--accent)" : "var(--danger)";
  return el("div", { class: "kpi-sub", style: { color } }, `${arrow} ${Math.abs(delta * 100).toFixed(1)}% vs last yr`);
}

function goalProgress(allDeals, settings) {
  const monthly = +settings.monthlyGoal || 0;
  const annual = +settings.annualGoal || 0;
  const now = new Date();
  const ym = now.toISOString().slice(0, 7);
  const yyyy = String(now.getFullYear());
  const monthEarned = allDeals.filter((d) => monthKey(d.serviceDate || d.paidDate || d.invoiceDate) === ym).reduce((s, d) => s + netFee(d), 0);
  const yearEarned = allDeals.filter((d) => (d.serviceDate || d.paidDate || d.invoiceDate || "").startsWith(yyyy)).reduce((s, d) => s + netFee(d), 0);

  if (!monthly && !annual) {
    return el("div", { class: "card" },
      el("h3", {}, "Goals"),
      el("div", { class: "small muted" }, "Set a monthly or annual revenue goal in Settings to track progress here."),
      el("div", { style: { marginTop: 8 } }, el("a", { class: "btn", href: "#/settings" }, "Set goals →")),
    );
  }
  return el("div", { class: "card" },
    el("h3", {}, "Goals"),
    monthly > 0 && progressRow(`This month`, monthEarned, monthly),
    annual > 0 && progressRow(`This year`, yearEarned, annual),
    el("div", { class: "small muted", style: { marginTop: 6 } },
      monthly > 0 && annual > 0 && yearEarned >= annual ? "🎉 Annual goal hit!" :
      monthly > 0 && monthEarned >= monthly ? "🎉 Monthly goal hit!" :
      "Pace based on booked income (net of partner fees)."),
  );
}

function progressRow(label, value, goal) {
  const pct = Math.max(0, Math.min(1, value / goal));
  const color = pct >= 1 ? "var(--accent)" : pct >= 0.7 ? "var(--accent)" : pct >= 0.4 ? "var(--warn)" : "var(--danger)";
  return el("div", { style: { marginBottom: 10 } },
    el("div", { class: "spread" },
      el("div", { class: "small muted" }, label),
      el("div", { class: "small" }, `${fmtMoney(value)} / ${fmtMoney(goal)} · ${(pct * 100).toFixed(0)}%`),
    ),
    el("div", { style: { height: "10px", background: "var(--bg-3)", borderRadius: "5px", overflow: "hidden", marginTop: 4 } },
      el("div", { style: { width: `${pct * 100}%`, height: "100%", background: color, transition: "width .3s ease" } }),
    ),
  );
}

function forecastProgress(allDeals) {
  // Simple: sum scheduled (unpaid) deals with serviceDate or postDate in the next 90 days,
  // plus 90-day rolling avg paid run-rate.
  const now = Date.now();
  const horizon = 90 * 86400000;
  const upcoming = allDeals.filter((d) => {
    if (d.paid) return false;
    const ref = d.serviceDate || d.postDate || d.draftDue;
    if (!ref) return false;
    const ms = new Date(ref).getTime();
    return ms >= now - 7 * 86400000 && ms <= now + horizon;
  });
  const upcomingTotal = upcoming.reduce((s, d) => s + netFee(d), 0);

  // Run-rate: average per-month over last 6 months of paid net.
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const dt = new Date(); dt.setMonth(dt.getMonth() - i, 1);
    months.push(dt.toISOString().slice(0, 7));
  }
  const monthly = months.map((m) => allDeals.filter((d) => (d.paidDate || "").slice(0, 7) === m).reduce((s, d) => s + (d.paidAmount || netFee(d)), 0));
  const avg = monthly.reduce((a, b) => a + b, 0) / Math.max(1, monthly.length);
  const run90 = avg * 3;

  return el("div", { class: "card" },
    el("h3", {}, "90-day forecast"),
    el("div", { class: "row", style: { gap: "16px", flexWrap: "wrap" } },
      el("div", {},
        el("div", { class: "kpi-sub" }, "Booked (scheduled)"),
        el("div", { class: "kpi-value" }, fmtMoney(upcomingTotal)),
        el("div", { class: "small muted" }, `${upcoming.length} upcoming deals`),
      ),
      el("div", {},
        el("div", { class: "kpi-sub" }, "Run-rate (6mo avg)"),
        el("div", { class: "kpi-value" }, fmtMoney(run90)),
        el("div", { class: "small muted" }, `${fmtMoney(avg)}/mo`),
      ),
      el("div", {},
        el("div", { class: "kpi-sub" }, "Combined estimate"),
        el("div", { class: "kpi-value", style: { color: "var(--accent)" } }, fmtMoney(upcomingTotal + run90)),
        el("div", { class: "small muted" }, "Booked + run-rate"),
      ),
    ),
  );
}

function computeYoY(allDeals, allBills, filters) {
  // Compare current selected period vs the equivalent period last year.
  const targetYear = filters.year !== "all" ? +filters.year : new Date().getFullYear();
  const prevYear = targetYear - 1;
  const ymThis = filters.month;
  const ymPrev = filters.month ? `${prevYear}-${filters.month.slice(5)}` : "";

  const inYear = (dt, year, ym) => {
    if (!dt) return false;
    if (ym) return dt.slice(0, 7) === ym;
    return dt.slice(0, 4) === String(year);
  };
  const sumDeals = (arr, year, ym) => arr.filter((d) => inYear(d.serviceDate || d.paidDate || d.invoiceDate, year, ym))
                                          .reduce((s, d) => s + netFee(d), 0);
  const sumCollected = (arr, year, ym) => arr.filter((d) => d.paid && inYear(d.paidDate, year, ym))
                                              .reduce((s, d) => s + (d.paidAmount || netFee(d)), 0);
  const sumBills = (arr, year, ym) => arr.filter((b) => inYear(b.date, year, ym)).reduce((s, b) => s + (+b.amount || 0), 0);

  const c = (cur, prev) => prev > 0 ? (cur - prev) / prev : null;
  return {
    income: c(sumDeals(allDeals, targetYear, ymThis), sumDeals(allDeals, prevYear, ymPrev)),
    collected: c(sumCollected(allDeals, targetYear, ymThis), sumCollected(allDeals, prevYear, ymPrev)),
    expenses: c(sumBills(allBills, targetYear, ymThis), sumBills(allBills, prevYear, ymPrev)),
  };
}
