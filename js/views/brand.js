import { el, fmtMoney, fmtMoneyShort, fmtDate, fmtDateShort, monthKey, monthLabel, netFee, dealStatus, serviceMeta, initials } from "../utils.js";
import { Deals, Contacts, subscribe } from "../store.js";
import { go } from "../router.js";
import { openContactForm, openDealForm } from "../forms.js";

export default function brandPage({ name }) {
  const node = el("div", {});
  let chart;

  const render = () => {
    const decoded = decodeURIComponent(name);
    const all = Deals.all();
    const deals = all.filter((d) => (d.company || "").toLowerCase() === decoded.toLowerCase())
                     .sort((a, b) => (b.serviceDate || "").localeCompare(a.serviceDate || ""));
    if (!deals.length) {
      node.innerHTML = "";
      node.append(el("div", { class: "empty" },
        el("div", { class: "ico" }, "?"),
        `No deals found for "${decoded}".`,
        el("div", { style: { marginTop: 8 } }, el("a", { class: "btn", href: "#/deals" }, "← Back to deals"))));
      return;
    }
    const contact = Contacts.all().find((c) => c.id === deals[0].contactId)
                  || Contacts.all().find((c) => (c.name || "").toLowerCase() === decoded.toLowerCase());

    const total = deals.reduce((s, d) => s + netFee(d), 0);
    const collected = deals.filter((d) => d.paid).reduce((s, d) => s + (d.paidAmount || netFee(d)), 0);
    const outstanding = deals.filter((d) => !d.paid).reduce((s, d) => s + netFee(d), 0);
    const avg = total / deals.length;

    // Months active
    const months = new Set();
    deals.forEach((d) => { const k = monthKey(d.serviceDate || d.postDate || d.paidDate); if (k) months.add(k); });
    const firstDate = deals.map((d) => d.serviceDate).filter(Boolean).sort()[0];
    const lastDate = deals.map((d) => d.serviceDate).filter(Boolean).sort().slice(-1)[0];

    // Service mix
    const svcMix = {};
    deals.forEach((d) => { svcMix[d.svc || "—"] = (svcMix[d.svc || "—"] || 0) + 1; });

    // Monthly income series: 24 months ending now
    const now = new Date();
    const labels = [];
    const series = [];
    for (let i = 23; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = dt.toISOString().slice(0, 7);
      labels.push(monthLabel(k));
      series.push(deals.filter((d) => monthKey(d.serviceDate || d.paidDate || d.postDate) === k).reduce((s, d) => s + netFee(d), 0));
    }

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("a", { href: "#/contacts", class: "small muted" }, "← Contacts"),
          el("h1", { style: { marginTop: 4 } },
            el("div", { class: "row" },
              el("div", { class: "avatar", style: { width: "40px", height: "40px", fontSize: "15px" } }, initials(decoded)),
              el("span", {}, decoded),
            ),
          ),
          contact && el("div", { class: "sub" }, `${contact.name || ""} ${contact.email ? "· " + contact.email : ""}`.trim()),
        ),
        el("div", { class: "row" },
          contact && el("button", { class: "btn", onclick: () => openContactForm(contact) }, "Edit contact"),
          el("button", { class: "btn primary", onclick: () => openDealForm({ company: decoded, contactId: contact?.id }) }, "+ New deal"),
        ),
      ),

      el("div", { class: "kpi-grid" },
        kpi("Lifetime net", fmtMoney(total)),
        kpi("Collected", fmtMoney(collected)),
        kpi("Outstanding", fmtMoney(outstanding), outstanding ? "down" : ""),
        kpi("Deals", deals.length, null, `Avg ${fmtMoney(avg)}`),
        kpi("Active since", firstDate ? fmtDate(firstDate) : "—", null, lastDate ? `Last ${fmtDate(lastDate)}` : ""),
      ),

      el("div", { class: "dash-grid" },
        el("div", { class: "card" },
          el("h3", {}, "Income · last 24 months"),
          el("div", { class: "chart-wrap" }, el("canvas", { id: "brand-trend" })),
        ),
        el("div", { class: "card" },
          el("h3", {}, "Service mix"),
          el("div", { class: "list" },
            ...Object.entries(svcMix).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
              const sm = serviceMeta(k);
              return el("div", { class: "list-row" },
                el("span", { class: `pill ${sm.cls}`, style: { minWidth: "92px", justifyContent: "center" } }, sm.label),
                el("div", { style: { flex: 1, height: "8px", background: "var(--bg-3)", borderRadius: "4px", overflow: "hidden" } },
                  el("div", { style: { width: `${(v / deals.length) * 100}%`, height: "100%", background: "var(--accent)" } }),
                ),
                el("div", { style: { minWidth: "32px", textAlign: "right" } }, String(v)),
              );
            }),
          ),
        ),
      ),

      el("div", { class: "card" },
        el("h3", {}, "All deals with this brand"),
        el("div", { class: "table-scroll" },
          (function () {
            const t = el("table", { class: "data" });
            t.append(el("thead", {}, el("tr", {},
              el("th", {}, "Service date"),
              el("th", {}, "Type"),
              el("th", { class: "num" }, "Net"),
              el("th", {}, "Status"),
              el("th", {}, "Paid"),
              el("th", {}, "Method"),
            )));
            const tb = el("tbody");
            deals.forEach((d) => {
              const sm = serviceMeta(d.svc);
              const st = dealStatus(d);
              tb.append(el("tr", { onclick: () => go(`/deals/${d.id}`) },
                el("td", {}, fmtDateShort(d.serviceDate) || "—"),
                el("td", {}, el("span", { class: `pill ${sm.cls}` }, sm.label)),
                el("td", { class: "num" }, fmtMoney(netFee(d))),
                el("td", {}, el("span", { class: `pill ${st.cls}` }, st.label)),
                el("td", { class: "small muted" }, fmtDateShort(d.paidDate) || "—"),
                el("td", { class: "small muted" }, d.payMethod || "—"),
              ));
            });
            t.append(tb);
            return t;
          })(),
        ),
      ),
    );

    requestAnimationFrame(() => {
      if (chart) chart.destroy();
      const ctx = node.querySelector("#brand-trend");
      if (!ctx || !window.Chart) return;
      chart = new window.Chart(ctx, {
        type: "bar",
        data: { labels, datasets: [{ label: "Income", data: series, backgroundColor: "#22c55e", borderRadius: 4 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmtMoney(c.parsed.y) } } },
          scales: {
            x: { grid: { color: "#232936" }, ticks: { color: "#8a93a6", maxRotation: 0, autoSkip: true } },
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
