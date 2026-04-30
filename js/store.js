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
    taxRate: 0.30, // estimated set-aside, not actual tax
    currency: "USD",
    invoicePrefix: "INV",
    nextInvoiceNumber: 1001,
  },
  deals: [],
  bills: [],
  contacts: [],
  invoices: [], // standalone invoices (not tied to a deal)
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
  // ensure all keys exist
  const d = defaults();
  return {
    ...d,
    ...data,
    settings: { ...d.settings, ...(data.settings || {}) },
    deals: data.deals || [],
    bills: data.bills || [],
    contacts: data.contacts || [],
    invoices: data.invoices || [],
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
function upsertCollection(name, item) {
  const s = getState();
  const arr = s[name];
  const idx = item.id ? arr.findIndex((x) => x.id === item.id) : -1;
  if (idx >= 0) {
    arr[idx] = { ...arr[idx], ...item, updatedAt: Date.now() };
  } else {
    arr.push({ ...item, id: item.id || uid(), createdAt: Date.now(), updatedAt: Date.now() });
  }
  write();
  return item.id ? arr[idx >= 0 ? idx : arr.length - 1] : arr[arr.length - 1];
}

function removeFromCollection(name, id) {
  const s = getState();
  s[name] = s[name].filter((x) => x.id !== id);
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
