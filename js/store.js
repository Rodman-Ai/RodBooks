// LocalStorage-backed store. Single source of truth.
// All data stays on-device. Export/Import via JSON or CSV.

const KEY = "rodbooks:v1";
const SCHEMA_VERSION = 1;

const defaults = () => ({
  schema: SCHEMA_VERSION,
  settings: {
    businessName: "",
    legalName: "",
    email: "",
    address: "",
    taxRate: 0.30,
    currency: "USD",
    invoicePrefix: "INV",
    nextInvoiceNumber: 1001,
    theme: "auto", // auto | dark | light
    monthlyGoal: 0,
    annualGoal: 0,
    mileageRate: 0.67, // IRS standard 2024
    lockHash: "", // sha-256 of passcode (empty = no lock)
    state: "", // optional state code for tax estimator
    stateRate: 0.05, // approx state effective rate
    defaultTerms: 30, // net days
    lateFeePct: 0, // 0 = off; e.g. 1.5 for 1.5% / month
  },
  deals: [],
  bills: [],
  contacts: [],
  invoices: [],
  mileage: [], // { id, date, miles, purpose, fromTo, deductible, notes }
  activity: [], // { id, ts, type, entity, entityId, label, detail }
  snapshots: [], // { id, ts, label, payload }
  taxPayments: [], // { id, year, quarter, date, amount, method, notes }
  contractTemplates: [], // { id, name, body, kind }
  outreachTemplates: [], // { id, name, subject, body, kind }
  vendorRules: [], // { id, match, category } — rule for auto-categorize
});

let cache = null;
const subscribers = new Set();

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch (e) {
    console.warn("Failed to parse store, resetting:", e);
    return defaults();
  }
}

function migrate(data) {
  if (!data.schema) data.schema = SCHEMA_VERSION;
  const d = defaults();
  return {
    ...d,
    ...data,
    settings: { ...d.settings, ...(data.settings || {}) },
    deals: data.deals || [],
    bills: data.bills || [],
    contacts: data.contacts || [],
    invoices: data.invoices || [],
    mileage: data.mileage || [],
    activity: data.activity || [],
    snapshots: data.snapshots || [],
    taxPayments: data.taxPayments || [],
    contractTemplates: data.contractTemplates || [],
    outreachTemplates: data.outreachTemplates || [],
    vendorRules: data.vendorRules || [],
  };
}

function write() {
  localStorage.setItem(KEY, JSON.stringify(cache));
  subscribers.forEach((fn) => {
    try { fn(cache); } catch (e) { console.error(e); }
  });
}

export function getState() {
  if (!cache) cache = read();
  return cache;
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// ---- CRUD helpers ----
function logActivity(type, entity, entityId, label, detail) {
  const s = getState();
  s.activity = s.activity || [];
  s.activity.unshift({ id: uid(), ts: Date.now(), type, entity, entityId, label, detail: detail || "" });
  // Keep last 500 entries to bound size
  if (s.activity.length > 500) s.activity.length = 500;
}

function upsertCollection(name, item) {
  const s = getState();
  const arr = s[name];
  const idx = item.id ? arr.findIndex((x) => x.id === item.id) : -1;
  let saved;
  if (idx >= 0) {
    arr[idx] = { ...arr[idx], ...item, updatedAt: Date.now() };
    saved = arr[idx];
    if (name !== "activity") logActivity("update", name, saved.id, labelFor(name, saved));
  } else {
    saved = { ...item, id: item.id || uid(), createdAt: Date.now(), updatedAt: Date.now() };
    arr.push(saved);
    if (name !== "activity") logActivity("create", name, saved.id, labelFor(name, saved));
  }
  write();
  return saved;
}

function labelFor(name, item) {
  if (name === "deals") return `${item.company || "Deal"}${item.fee ? " · $" + item.fee : ""}`;
  if (name === "bills") return `${item.vendor || "Bill"}${item.amount ? " · $" + item.amount : ""}`;
  if (name === "contacts") return item.name || "Contact";
  if (name === "mileage") return `${item.miles || 0} mi · ${item.purpose || "trip"}`;
  return name;
}

function removeFromCollection(name, id) {
  const s = getState();
  const item = s[name].find((x) => x.id === id);
  s[name] = s[name].filter((x) => x.id !== id);
  if (item && name !== "activity") logActivity("delete", name, id, labelFor(name, item));
  write();
}

export const Deals = {
  all: () => getState().deals,
  get: (id) => getState().deals.find((d) => d.id === id),
  save: (d) => upsertCollection("deals", d),
  remove: (id) => removeFromCollection("deals", id),
};
export const Bills = {
  all: () => getState().bills,
  get: (id) => getState().bills.find((b) => b.id === id),
  save: (b) => upsertCollection("bills", b),
  remove: (id) => removeFromCollection("bills", id),
};
export const Contacts = {
  all: () => getState().contacts,
  get: (id) => getState().contacts.find((c) => c.id === id),
  save: (c) => upsertCollection("contacts", c),
  remove: (id) => removeFromCollection("contacts", id),
  byName(name) {
    if (!name) return null;
    const n = name.trim().toLowerCase();
    return getState().contacts.find((c) => (c.name || "").toLowerCase() === n) || null;
  },
  ensure(name, extra = {}) {
    if (!name) return null;
    const existing = Contacts.byName(name);
    if (existing) return existing;
    const c = upsertCollection("contacts", { name: name.trim(), type: "brand", ...extra });
    return c;
  },
};
export const Invoices = {
  all: () => getState().invoices,
  get: (id) => getState().invoices.find((i) => i.id === id),
  save: (i) => upsertCollection("invoices", i),
  remove: (id) => removeFromCollection("invoices", id),
};

export const Mileage = {
  all: () => getState().mileage,
  get: (id) => getState().mileage.find((m) => m.id === id),
  save: (m) => upsertCollection("mileage", m),
  remove: (id) => removeFromCollection("mileage", id),
};

export const TaxPayments = {
  all: () => getState().taxPayments,
  get: (id) => getState().taxPayments.find((x) => x.id === id),
  save: (x) => upsertCollection("taxPayments", x),
  remove: (id) => removeFromCollection("taxPayments", id),
};

export const ContractTemplates = {
  all: () => getState().contractTemplates,
  get: (id) => getState().contractTemplates.find((x) => x.id === id),
  save: (x) => upsertCollection("contractTemplates", x),
  remove: (id) => removeFromCollection("contractTemplates", id),
};

export const OutreachTemplates = {
  all: () => getState().outreachTemplates,
  get: (id) => getState().outreachTemplates.find((x) => x.id === id),
  save: (x) => upsertCollection("outreachTemplates", x),
  remove: (id) => removeFromCollection("outreachTemplates", id),
};

export const VendorRules = {
  all: () => getState().vendorRules,
  save: (x) => upsertCollection("vendorRules", x),
  remove: (id) => removeFromCollection("vendorRules", id),
  // Resolve a category from a vendor name, picking the first matching rule.
  categoryFor(vendor) {
    if (!vendor) return null;
    const v = String(vendor).toLowerCase();
    const rule = getState().vendorRules.find((r) => v.includes((r.match || "").toLowerCase()));
    return rule?.category || null;
  },
  // Learn a vendor → category association (idempotent on `match`).
  learn(vendor, category) {
    if (!vendor || !category) return;
    const m = vendor.toLowerCase().slice(0, 32);
    const existing = getState().vendorRules.find((r) => r.match === m);
    if (existing) {
      if (existing.category !== category) upsertCollection("vendorRules", { id: existing.id, category });
      return;
    }
    upsertCollection("vendorRules", { match: m, category });
  },
};

export const Activity = {
  all: () => getState().activity,
  clear() { const s = getState(); s.activity = []; write(); },
};

export const Snapshots = {
  all: () => getState().snapshots,
  create(label) {
    const s = getState();
    const { snapshots, ...rest } = s;
    const snap = { id: uid(), ts: Date.now(), label: label || new Date().toLocaleString(), payload: JSON.stringify(rest) };
    s.snapshots = [snap, ...(s.snapshots || [])].slice(0, 20);
    write();
    return snap;
  },
  restore(id) {
    const s = getState();
    const snap = (s.snapshots || []).find((x) => x.id === id);
    if (!snap) throw new Error("Snapshot not found");
    const data = JSON.parse(snap.payload);
    cache = migrate({ ...data, snapshots: s.snapshots });
    write();
  },
  remove(id) {
    const s = getState();
    s.snapshots = (s.snapshots || []).filter((x) => x.id !== id);
    write();
  },
};

export const Settings = {
  get: () => getState().settings,
  update(patch) {
    const s = getState();
    s.settings = { ...s.settings, ...patch };
    write();
    return s.settings;
  },
  nextInvoiceNumber() {
    const s = getState();
    const n = s.settings.nextInvoiceNumber || 1001;
    s.settings.nextInvoiceNumber = n + 1;
    write();
    return n;
  },
};

// ---- Import / Export ----
export function exportJSON() {
  return JSON.stringify(getState(), null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  cache = migrate(parsed);
  write();
}

export function resetAll() {
  cache = defaults();
  write();
}

export async function loadSampleData() {
  // Generate a rich synthetic dataset (fictional brands, 6 yrs of growth).
  cache = defaults();
  const { buildSyntheticDataset } = await import("./synth.js");
  const { contacts, deals, bills } = buildSyntheticDataset();
  cache.contacts = contacts;
  cache.deals = deals;
  cache.bills = bills;

  Settings.update({
    businessName: "Your Creator LLC",
    email: "you@yourdomain.com",
    invoicePrefix: "RB",
    nextInvoiceNumber: 3000,
  });

  write();
}

// ---- CSV ----
export function toCSV(rows, columns) {
  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label || c.key)).join(",");
  const body = rows.map((r) => columns.map((c) => esc(typeof c.value === "function" ? c.value(r) : r[c.key])).join(",")).join("\n");
  return head + "\n" + body;
}

export function downloadFile(filename, content, mime = "application/octet-stream") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
}
