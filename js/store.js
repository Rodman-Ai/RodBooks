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

export function loadSampleData() {
  // Sample data based on the user's spreadsheet (anonymized & approximated).
  cache = defaults();
  const c = (name, t = "brand", extra = {}) => Contacts.ensure(name, { type: t, ...extra });
  c("Zen Media", "brand");
  c("Anything AI", "brand");
  c("Runable", "brand");
  c("Airwallex", "brand", { email: "kevin.sloan@airwallex.com" });
  c("Descript", "brand", { email: "kevin.sloan@descript.com" });
  c("Beforesunset", "brand");
  c("WisprFlow", "brand");
  c("Linq", "brand", { email: "nathanael@linq.com" });
  c("Climaty AI", "brand");
  c("Player Zero", "brand", { email: "vijay@playerzero.ai" });
  c("Alson AI", "brand");
  c("Visimore", "brand");
  c("SurveyMonkey", "brand");
  c("Coderabbit", "brand", { email: "mayur.jain@coderabbit.ai" });
  c("Delve", "brand");
  c("Pythagora", "brand");
  c("Moxt", "brand");
  c("Datacouch", "brand");
  c("Orcanets", "brand");
  c("Redactiq", "brand");
  c("Sentra", "brand");
  c("Powtoon", "brand");

  const sample = [
    { company: "Zen Media", svc: "v", fee: 1100, paidAmount: 1100, paid: true, paidDate: "2026-01-20", payMethod: "limelight", year: 2026, serviceDate: "2026-01-26" },
    { company: "Anything AI", svc: "p", fee: 900, paid: false, year: 2026, serviceDate: "2026-01-12", postDate: "2026-01-19" },
    { company: "Runable", svc: "p", fee: 700, paid: false, paidDate: "2026-02-11", year: 2026, serviceDate: "2026-01-19", postDate: "2026-02-11" },
    { company: "Airwallex", svc: "p", fee: 900, partnerFeePct: 3.5, paidAmount: 868, paid: false, year: 2026, serviceDate: "2026-03-09" },
    { company: "Descript", svc: "p", fee: 1100, partnerFeePct: 3.5, paidAmount: 1096.5, paid: true, paidDate: "2026-04-23", payMethod: "partnerstack", year: 2026, serviceDate: "2026-01-30", postDate: "2026-03-02" },
    { company: "Descript", svc: "p", fee: 900, paid: false, year: 2026, serviceDate: "2026-01-30", postDate: "2026-04-28" },
    { company: "Descript", svc: "v", fee: 1300, paid: false, year: 2026, serviceDate: "2026-01-30" },
    { company: "Beforesunset", svc: "p", fee: 850, paid: false, year: 2026 },
    { company: "Beforesunset", svc: "p", fee: 850, paid: false, year: 2026 },
    { company: "WisprFlow", svc: "p", fee: 900, partnerFeePct: 2.93, paidAmount: 873.6, paid: true, paidDate: "2026-02-26", payMethod: "Woo", year: 2026, serviceDate: "2026-02-25" },
    { company: "Linq", svc: "", fee: 1000, paid: false, payMethod: "limelight", year: 2026, serviceDate: "2026-02-11" },
    { company: "Climaty AI", svc: "", fee: 0, paid: false, year: 2026 },
    { company: "Sales flow", svc: "", fee: 1000, paid: false, year: 2026, notes: "may end" },
    { company: "Player Zero", svc: "p", fee: 900, paidAmount: 900, paid: true, paidDate: "2026-03-31", payMethod: "Brex eft", year: 2026, serviceDate: "2026-02-16", postDate: "2026-03-16" },
    { company: "Alson AI", svc: "", fee: 0, paid: false, year: 2026, notes: "april" },
    { company: "Visimore", svc: "p", fee: 900, paid: false, year: 2026, notes: "delay" },
    { company: "Runable", svc: "p prep", fee: 350, paid: false, paidDate: "2026-03-19", year: 2026, serviceDate: "2026-03-03" },
    { company: "Runable", svc: "postp", fee: 350, paid: false, paidDate: "2026-03-19", year: 2026, serviceDate: "2026-03-03" },
    { company: "SurveyMonkey", svc: "v", fee: 1500, paidAmount: 1500, paid: true, paidDate: "2026-04-16", payMethod: "limelight", year: 2026, serviceDate: "2026-03-12", postDate: "2026-04-27" },
    { company: "Coderabbit", svc: "qrt", fee: 300, paid: false, year: 2026, serviceDate: "2026-03-17" },
    { company: "Delve", svc: "p", fee: 1000, paid: false, year: 2026 },
    { company: "Pythagora", svc: "x", fee: 0, paid: false, year: 2026, serviceDate: "2026-03-31" },
    { company: "Moxt", svc: "x", fee: 0, paid: false, year: 2026 },
    { company: "Orcanets", svc: "incentive", fee: 50, paid: false, year: 2026, serviceDate: "2026-04-07" },
    { company: "Redactiq", svc: "c+l", fee: 100, paid: false, year: 2026, serviceDate: "2026-04-08" },
    { company: "Sentra", svc: "qrt rt", fee: 400, partnerFeePct: 15, paid: false, year: 2026, serviceDate: "2026-04-09" },
    { company: "Powtoon", svc: "v", fee: 1100, paid: false, year: 2026, serviceDate: "2026-05-02" },
  ];

  for (const d of sample) {
    const contact = c(d.company);
    Deals.save({
      contactId: contact?.id,
      company: d.company,
      svc: d.svc || "",
      fee: d.fee || 0,
      partnerFeePct: d.partnerFeePct || 0,
      paidAmount: d.paidAmount || 0,
      paid: !!d.paid,
      paidDate: d.paidDate || "",
      payMethod: d.payMethod || "",
      serviceDate: d.serviceDate || "",
      postDate: d.postDate || "",
      draftDue: d.draftDue || "",
      year: d.year || new Date().getFullYear(),
      contractUrl: "",
      briefUrl: "",
      draftUrl: "",
      portalUrl: "",
      notesUrl: "",
      invoiceUrl: "",
      invoiceNumber: "",
      invoiceDate: "",
      transactionId: "",
      invoiceTo: "",
      notes: d.notes || "",
    });
  }

  // Sample expenses
  const exp = [
    { vendor: "Adobe Creative Cloud", category: "Software", amount: 59.99, date: "2026-01-05", paid: true, payMethod: "Brex card", recurring: "monthly" },
    { vendor: "Final Cut Pro", category: "Software", amount: 299, date: "2026-01-12", paid: true, payMethod: "Brex card" },
    { vendor: "Notion", category: "Software", amount: 10, date: "2026-02-01", paid: true, payMethod: "Brex card", recurring: "monthly" },
    { vendor: "Riverside.fm", category: "Software", amount: 24, date: "2026-02-08", paid: true, payMethod: "Brex card", recurring: "monthly" },
    { vendor: "B&H Photo - Lens", category: "Equipment", amount: 1299, date: "2026-02-20", paid: true, payMethod: "Brex card" },
    { vendor: "Backblaze", category: "Software", amount: 9, date: "2026-03-01", paid: true, payMethod: "Brex card", recurring: "monthly" },
    { vendor: "Travel - NYC creator summit", category: "Travel", amount: 612.40, date: "2026-03-14", paid: true, payMethod: "Brex card" },
    { vendor: "Coffee meetings", category: "Meals", amount: 87.50, date: "2026-03-22", paid: true, payMethod: "Brex card" },
    { vendor: "Internet (home office %)", category: "Office", amount: 45, date: "2026-04-01", paid: true, payMethod: "ACH", recurring: "monthly" },
  ];
  for (const e of exp) {
    Bills.save({
      vendor: e.vendor,
      category: e.category,
      amount: e.amount,
      date: e.date,
      paid: e.paid,
      paidDate: e.paid ? e.date : "",
      payMethod: e.payMethod || "",
      recurring: e.recurring || "",
      notes: "",
      receiptUrl: "",
    });
  }

  Settings.update({
    businessName: "Your Creator LLC",
    email: "you@yourdomain.com",
    invoicePrefix: "RB",
    nextInvoiceNumber: 1024,
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
