// Formatters and helpers

import { Settings } from "./store.js";

export function fmtMoney(n, opts = {}) {
  const v = Number(n) || 0;
  const cur = (Settings.get().currency) || "USD";
  return v.toLocaleString(undefined, {
    style: "currency",
    currency: cur,
    minimumFractionDigits: opts.cents ?? (Math.abs(v - Math.round(v)) > 0 ? 2 : 0),
    maximumFractionDigits: 2,
  });
}

export function fmtMoneyShort(n) {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

export function fmtDate(s) {
  if (!s) return "";
  const d = typeof s === "string" ? parseDate(s) : s;
  if (!d || isNaN(d)) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateShort(s) {
  if (!s) return "";
  const d = typeof s === "string" ? parseDate(s) : s;
  if (!d || isNaN(d)) return "";
  return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}

export function parseDate(s) {
  if (!s) return null;
  // ISO yyyy-mm-dd preferred
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function monthKey(d) {
  const dt = typeof d === "string" ? parseDate(d) : d;
  if (!dt || isNaN(dt)) return "";
  return dt.toISOString().slice(0, 7); // YYYY-MM
}

export function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

// Service-type labeling/coloring matched loosely to the user's spreadsheet conventions.
const SERVICE_COLORS = {
  v: { label: "Video", cls: "blue" },
  p: { label: "Post", cls: "purple" },
  "p prep": { label: "Pre-post", cls: "purple" },
  postp: { label: "Post-post", cls: "purple" },
  qrt: { label: "Quote / RT", cls: "amber" },
  rt: { label: "Repost", cls: "amber" },
  "qrt rt": { label: "Quote+Repost", cls: "amber" },
  "c+l": { label: "Comment+Like", cls: "teal" },
  incentive: { label: "Incentive", cls: "pink" },
  x: { label: "Other", cls: "gray" },
};
export function serviceMeta(svc) {
  const k = (svc || "").toLowerCase().trim();
  return SERVICE_COLORS[k] || { label: svc || "—", cls: "gray" };
}
export const SERVICE_OPTIONS = Object.entries(SERVICE_COLORS).map(([key, v]) => ({ key, ...v }));

export function dealStatus(d) {
  if (d.paid) return { label: "Paid", cls: "green" };
  if (d.invoiceDate || d.invoiceUrl || d.invoiceNumber) return { label: "Invoiced", cls: "blue" };
  if (d.draftUrl) return { label: "Draft sent", cls: "purple" };
  if (d.briefUrl) return { label: "In progress", cls: "amber" };
  if (d.contractUrl) return { label: "Signed", cls: "teal" };
  return { label: "Pending", cls: "gray" };
}

export function netFee(d) {
  const fee = Number(d.fee) || 0;
  const pct = Number(d.partnerFeePct) || 0;
  if (d.paidAmount) return Number(d.paidAmount);
  if (pct > 0) return fee * (1 - pct / 100);
  return fee;
}

export function csvFromString(text) {
  // simple CSV parser supporting quoted fields
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* ignore */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function debounce(fn, ms = 200) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(c));
  }
  return e;
}

export function initials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join("").toUpperCase();
}
