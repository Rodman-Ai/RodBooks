import { register, start, go } from "./router.js";
import { getState, loadSampleData, Deals } from "./store.js";
import { openQuickAdd } from "./forms.js";

import dashboard from "./views/dashboard.js";
import { dealsList, dealDetail } from "./views/deals.js";
import invoices from "./views/invoices.js";
import bills from "./views/bills.js";
import contacts from "./views/contacts.js";
import reports from "./views/reports.js";
import settingsView from "./views/settings.js";
import brandPage from "./views/brand.js";
import timelineView from "./views/timeline.js";
import automationsView from "./views/automations.js";

// First-run: if there's no data at all, offer sample data automatically (once).
(async function firstRun() {
  const s = getState();
  const empty = !s.deals.length && !s.bills.length && !s.contacts.length;
  const seedKey = "rodbooks:seeded:v2";
  const seeded = localStorage.getItem(seedKey);
  if (empty && !seeded) {
    await loadSampleData();
    localStorage.setItem(seedKey, "1");
  }
})();

// Routes
register("/", () => dashboard());
register("/dashboard", () => dashboard());
register("/deals", () => dealsList());
register("/deals/:id", (p) => dealDetail(p));
register("/brand/:name", (p) => brandPage(p));
register("/invoices", () => invoices());
register("/bills", () => bills());
register("/contacts", () => contacts());
register("/timeline", () => timelineView());
register("/automations", () => automationsView());
register("/reports", () => reports());
register("/settings", () => settingsView());

const TITLES = {
  "/": "Dashboard",
  "/dashboard": "Dashboard",
  "/deals": "Brand Deals",
  "/invoices": "Invoices",
  "/bills": "Bills & Expenses",
  "/contacts": "Contacts",
  "/timeline": "Timeline",
  "/automations": "Automations",
  "/reports": "Reports",
  "/settings": "Settings",
};

const outlet = document.getElementById("view");
start({
  outlet,
  onChange: ({ path }) => {
    // active link state
    const baseRoute = path === "/" ? "dashboard" : path.split("/")[1];
    document.querySelectorAll("[data-route]").forEach((a) => {
      a.classList.toggle("active", a.dataset.route === baseRoute);
    });
    // page title
    const title = TITLES[path] || (baseRoute === "deals" && "Deal") || "RodBooks";
    document.getElementById("pageTitle").textContent = title;
    // close mobile menu after nav
    document.body.classList.remove("menu-open");
  },
});

// Mobile menu
const menuBtn = document.getElementById("menuBtn");
menuBtn.addEventListener("click", () => document.body.classList.toggle("menu-open"));
document.addEventListener("click", (e) => {
  if (!document.body.classList.contains("menu-open")) return;
  if (e.target.closest(".sidebar") || e.target.closest("#menuBtn")) return;
  document.body.classList.remove("menu-open");
});

// Quick add
document.getElementById("quickAddBtn").addEventListener("click", () => openQuickAdd());

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea, select, [contenteditable]")) return;
  if (e.key === "n" && !e.metaKey && !e.ctrlKey) { openQuickAdd(); }
  if (e.key === "g") {
    const next = (ev) => {
      const map = { d: "/", b: "/deals", i: "/invoices", e: "/bills", c: "/contacts", t: "/timeline", a: "/automations", r: "/reports", s: "/settings" };
      const r = map[ev.key];
      if (r) go(r);
      document.removeEventListener("keydown", next, true);
    };
    document.addEventListener("keydown", next, true);
  }
});
