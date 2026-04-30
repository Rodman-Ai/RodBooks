import { el, fmtMoney, fmtDate, fmtDateShort, netFee, dealStatus, serviceMeta, escHtml, debounce, todayISO, parseDate } from "../utils.js";
import { Deals, Contacts, subscribe, downloadFile, toCSV } from "../store.js";
import { go } from "../router.js";
import { openDealForm } from "../forms.js";
import { confirmDialog, toast } from "../ui.js";

const FILTER_KEY = "rodbooks:filters:deals";

function loadFilters() {
  try { return JSON.parse(localStorage.getItem(FILTER_KEY)) || {}; } catch { return {}; }
}
function saveFilters(f) { localStorage.setItem(FILTER_KEY, JSON.stringify(f)); }

export function dealsList() {
  const node = el("div", {});
  let filters = { search: "", status: "all", year: "all", svc: "all", sort: "serviceDate:desc", ...loadFilters() };

  const renderTable = () => {
    const all = Deals.all();
    const years = Array.from(new Set(all.map((d) => (d.serviceDate || d.invoiceDate || d.paidDate || "").slice(0, 4)).filter(Boolean))).sort().reverse();
    const services = Array.from(new Set(all.map((d) => d.svc).filter(Boolean)));

    const filtered = all.filter((d) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = `${d.company} ${d.notes} ${d.invoiceNumber} ${d.payMethod}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.status === "paid" && !d.paid) return false;
      if (filters.status === "unpaid" && d.paid) return false;
      if (filters.status === "invoiced" && !(d.invoiceDate || d.invoiceNumber)) return false;
      if (filters.status === "no_invoice" && (d.invoiceDate || d.invoiceNumber)) return false;
      if (filters.year !== "all" && (d.serviceDate || d.invoiceDate || d.paidDate || "").slice(0, 4) !== filters.year) return false;
      if (filters.svc !== "all" && (d.svc || "") !== filters.svc) return false;
      return true;
    });

    const [sortKey, sortDir] = filters.sort.split(":");
    filtered.sort((a, b) => {
      const av = sortKey === "fee" ? netFee(a) : a[sortKey] || "";
      const bv = sortKey === "fee" ? netFee(b) : b[sortKey] || "";
      const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "desc" ? -cmp : cmp;
    });

    const totalNet = filtered.reduce((s, d) => s + netFee(d), 0);
    const totalUnpaid = filtered.filter((d) => !d.paid).reduce((s, d) => s + netFee(d), 0);

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Brand Deals"),
          el("div", { class: "sub" }, `${filtered.length} of ${all.length} · Net total ${fmtMoney(totalNet)} · Unpaid ${fmtMoney(totalUnpaid)}`),
        ),
        el("div", { class: "row" },
          el("button", { class: "btn", onclick: exportCsv }, "Export CSV"),
          el("button", { class: "btn primary", onclick: () => openDealForm() }, "+ New deal"),
        ),
      ),
      el("div", { class: "table-wrap" },
        el("div", { class: "table-toolbar" },
          searchInput(filters.search, (v) => { filters.search = v; saveFilters(filters); renderTable(); }),
          select(filters.status, [
            { value: "all", label: "All status" },
            { value: "paid", label: "Paid only" },
            { value: "unpaid", label: "Unpaid" },
            { value: "invoiced", label: "Invoiced" },
            { value: "no_invoice", label: "No invoice" },
          ], (v) => { filters.status = v; saveFilters(filters); renderTable(); }),
          select(filters.year, [{ value: "all", label: "All years" }, ...years.map((y) => ({ value: y, label: y }))],
            (v) => { filters.year = v; saveFilters(filters); renderTable(); }),
          select(filters.svc, [{ value: "all", label: "All services" }, ...services.map((s) => ({ value: s, label: serviceMeta(s).label }))],
            (v) => { filters.svc = v; saveFilters(filters); renderTable(); }),
        ),
        el("div", { class: "table-scroll" }, table(filtered, sortKey, sortDir, (k) => {
          const dir = filters.sort === `${k}:asc` ? "desc" : "asc";
          filters.sort = `${k}:${dir}`; saveFilters(filters); renderTable();
        })),
      ),
    );
  };

  function exportCsv() {
    const all = Deals.all();
    const csv = toCSV(all, [
      { key: "company", label: "Company" },
      { key: "svc", label: "Service" },
      { key: "fee", label: "Fee" },
      { key: "partnerFeePct", label: "Partner Fee %" },
      { key: "paidAmount", label: "Paid Amount" },
      { key: "paid", label: "Paid", value: (d) => d.paid ? "yes" : "no" },
      { key: "paidDate", label: "Paid Date" },
      { key: "payMethod", label: "Pay Method" },
      { key: "serviceDate", label: "Service Date" },
      { key: "postDate", label: "Post Date" },
      { key: "draftDue", label: "Draft Due" },
      { key: "invoiceNumber", label: "Invoice #" },
      { key: "invoiceDate", label: "Invoice Date" },
      { key: "invoiceUrl", label: "Invoice URL" },
      { key: "invoiceTo", label: "Invoice To" },
      { key: "contractUrl", label: "Contract URL" },
      { key: "briefUrl", label: "Brief URL" },
      { key: "draftUrl", label: "Draft URL" },
      { key: "portalUrl", label: "Portal URL" },
      { key: "notesUrl", label: "Notes URL" },
      { key: "transactionId", label: "Transaction" },
      { key: "notes", label: "Notes" },
    ]);
    downloadFile(`rodbooks-deals-${todayISO()}.csv`, csv, "text/csv");
    toast("Exported deals CSV");
  }

  const unsub = subscribe(renderTable);
  renderTable();
  return { node, unmount: unsub };
}

function searchInput(value, onChange) {
  const i = el("input", { class: "input search", placeholder: "Search company, notes, invoice…", value });
  i.addEventListener("input", debounce((e) => onChange(e.target.value), 150));
  return i;
}
function select(value, options, onChange) {
  const s = el("select", { class: "select" });
  for (const o of options) {
    const opt = el("option", { value: o.value }, o.label);
    if (String(o.value) === String(value)) opt.selected = true;
    s.append(opt);
  }
  s.addEventListener("change", () => onChange(s.value));
  return s;
}

function table(rows, sortKey, sortDir, onSort) {
  if (!rows.length) {
    return el("div", { class: "empty" }, el("div", { class: "ico" }, "★"), "No deals match your filters.");
  }
  const arrow = (k) => sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  const headers = [
    { k: "company", l: "Brand" },
    { k: "svc", l: "Type" },
    { k: "serviceDate", l: "Service" },
    { k: "postDate", l: "Post" },
    { k: "draftDue", l: "Draft Due" },
    { k: "fee", l: "Net", num: true },
    { k: "paid", l: "Status" },
    { k: "paidDate", l: "Paid" },
    { k: "invoiceNumber", l: "Invoice" },
  ];
  const t = el("table", { class: "data" });
  const thead = el("thead", {}, el("tr", {}, ...headers.map((h) =>
    el("th", { onclick: () => onSort(h.k), class: h.num ? "num" : "" }, h.l + arrow(h.k)),
  )));
  const tbody = el("tbody", {});
  for (const d of rows) {
    const status = dealStatus(d);
    const sm = serviceMeta(d.svc);
    const tr = el("tr", { onclick: () => go(`/deals/${d.id}`) },
      el("td", {}, d.company || "—"),
      el("td", {}, el("span", { class: `pill ${sm.cls}` }, sm.label)),
      el("td", { class: "small muted" }, fmtDateShort(d.serviceDate)),
      el("td", { class: "small muted" }, fmtDateShort(d.postDate)),
      el("td", { class: "small muted" }, fmtDateShort(d.draftDue)),
      el("td", { class: "num" }, fmtMoney(netFee(d))),
      el("td", {}, el("span", { class: `pill ${status.cls}` }, status.label)),
      el("td", { class: "small muted" }, fmtDateShort(d.paidDate)),
      el("td", { class: "small muted" }, d.invoiceNumber || ""),
    );
    tbody.append(tr);
  }
  t.append(thead, tbody);
  return t;
}

// ---- Deal detail page ----
export function dealDetail({ id }) {
  const node = el("div", {});
  const render = () => {
    const d = Deals.get(id);
    if (!d) {
      node.innerHTML = "";
      node.append(el("div", { class: "empty" }, el("div", { class: "ico" }, "∅"), "Deal not found.",
        el("div", { style: { marginTop: 8 } }, el("a", { class: "btn", href: "#/deals" }, "← Back to deals"))));
      return;
    }
    const status = dealStatus(d);
    const sm = serviceMeta(d.svc);
    const link = (href) => href ? el("a", { href, target: "_blank", rel: "noreferrer" }, "Open ↗") : el("span", { class: "muted" }, "—");

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("a", { href: "#/deals", class: "small muted" }, "← All deals"),
          el("h1", { style: { marginTop: 4 } }, d.company),
          el("div", { class: "row sub" },
            el("span", { class: `pill ${sm.cls}` }, sm.label),
            el("span", { class: `pill ${status.cls}` }, status.label),
            d.invoiceNumber && el("span", { class: "muted" }, `Invoice ${d.invoiceNumber}`),
          ),
        ),
        el("div", { class: "row" },
          !d.paid && el("button", {
            class: "btn primary",
            onclick: () => {
              Deals.save({ id: d.id, paid: true, paidDate: d.paidDate || todayISO(), paidAmount: d.paidAmount || netFee(d) });
              toast("Marked paid");
            },
          }, "Mark paid"),
          el("button", { class: "btn", onclick: () => openDealForm(d) }, "Edit"),
          el("button", {
            class: "btn danger",
            onclick: async () => {
              const ok = await confirmDialog({ title: "Delete deal?", body: `This will remove the ${d.company} deal.`, danger: true, confirmLabel: "Delete" });
              if (ok) { Deals.remove(d.id); toast("Deleted"); go("/deals"); }
            },
          }, "Delete"),
        ),
      ),
      el("div", { class: "kpi-grid" },
        kv("Gross fee", fmtMoney(d.fee)),
        kv("Partner fee", d.partnerFeePct ? `${d.partnerFeePct}%` : "—"),
        kv("Net", fmtMoney(netFee(d))),
        kv("Paid", d.paid ? fmtMoney(d.paidAmount || netFee(d)) : "—"),
      ),
      el("div", { class: "card" },
        el("h3", {}, "Timeline"),
        el("div", { class: "detail-grid" },
          kv("Service date", fmtDate(d.serviceDate) || "—"),
          kv("Post date", fmtDate(d.postDate) || "—"),
          kv("Draft due", fmtDate(d.draftDue) || "—"),
          kv("Invoice date", fmtDate(d.invoiceDate) || "—"),
          kv("Paid date", fmtDate(d.paidDate) || "—"),
          kv("Pay method", d.payMethod || "—"),
        ),
      ),
      el("div", { class: "card" },
        el("h3", {}, "Links"),
        el("div", { class: "detail-grid" },
          kv("Contract", link(d.contractUrl)),
          kv("Brief", link(d.briefUrl)),
          kv("Draft", link(d.draftUrl)),
          kv("Portal", link(d.portalUrl)),
          kv("Notes / GPT", link(d.notesUrl)),
          kv("Invoice", link(d.invoiceUrl)),
        ),
      ),
      (d.invoiceTo || d.transactionId || d.notes) && el("div", { class: "card" },
        el("h3", {}, "Other"),
        el("div", { class: "detail-grid" },
          d.invoiceTo && kv("Invoice to", d.invoiceTo),
          d.transactionId && kv("Transaction ID", d.transactionId),
          d.notes && kv("Notes", d.notes),
        ),
      ),
    );
  };
  const unsub = subscribe(render);
  render();
  return { node, unmount: unsub };
}

function kv(k, v) {
  return el("div", { class: "kv" }, el("div", { class: "k" }, k), el("div", { class: "v" }, v ?? "—"));
}
