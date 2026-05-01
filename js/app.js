import { register, start, go } from "./router.js";
import { getState, loadSampleData, Deals, Bills, Contacts, subscribe } from "./store.js";
import { openQuickAdd } from "./forms.js";
import { applyTheme } from "./theme.js";
import { isLockEnabled, isUnlocked, showLockScreen } from "./lock.js";
import { openPalette } from "./palette.js";
import { applyDensity, pushRecent } from "./prefs.js";
import { openHelp } from "./help.js";
import { generateProposals } from "./automations.js";

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
import kanban from "./views/kanban.js";
import mileageView from "./views/mileage.js";
import activityView from "./views/activity.js";
import taxView from "./views/tax.js";
import templatesView from "./views/templates.js";
import bankingView from "./views/banking.js";
import incomeView from "./views/income.js";
import { runScheduler } from "./scheduler.js";
import contractsView from "./views/contracts.js";
import { runScheduler } from "./scheduler.js";

// First-run: if there's no data at all, offer sample data automatically (once).
(async function firstRun() {
  const s = getState();
  const empty = !s.deals.length && !s.bills.length && !s.contacts.length;
  const seedKey = "rodbooks:seeded:v3";
  const seeded = localStorage.getItem(seedKey);
  if (empty && !seeded) {
    await loadSampleData();
    localStorage.setItem(seedKey, "1");
  }
})();

// Apply theme + density + lock gate before showing content
applyTheme();
applyDensity();
if (isLockEnabled() && !isUnlocked()) showLockScreen();

// Run recurring-deal scheduler on every load.
try { runScheduler(); } catch (e) { console.warn("scheduler:", e); }

// Routes
register("/", () => dashboard());
register("/dashboard", () => dashboard());
register("/deals", () => dealsList());
register("/deals/:id", (p) => dealDetail(p));
register("/brand/:name", (p) => brandPage(p));
register("/pipeline", () => kanban());
register("/invoices", () => invoices());
register("/bills", () => bills());
register("/mileage", () => mileageView());
register("/contacts", () => contacts());
register("/timeline", () => timelineView());
register("/automations", () => automationsView());
register("/activity", () => activityView());
register("/reports", () => reports());
register("/tax", () => taxView());
register("/templates", () => templatesView());
register("/contracts", () => contractsView());
register("/banking", () => bankingView());
register("/income", () => incomeView());
register("/settings", () => settingsView());

const TITLES = {
  "/": "Dashboard",
  "/dashboard": "Dashboard",
  "/deals": "Brand Deals",
  "/pipeline": "Pipeline",
  "/invoices": "Invoices",
  "/bills": "Bills & Expenses",
  "/mileage": "Mileage",
  "/contacts": "Contacts",
  "/timeline": "Timeline",
  "/automations": "Automations",
  "/activity": "Activity",
  "/reports": "Reports",
  "/tax": "Tax",
  "/templates": "Templates",
  "/contracts": "Contract scanner",
  "/banking": "Banking",
  "/income": "Other income",
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
    const title = TITLES[path] || (baseRoute === "deals" && "Deal") || (baseRoute === "brand" && "Brand") || "RodBooks";
    document.getElementById("pageTitle").textContent = title;
    // close mobile menu after nav
    document.body.classList.remove("menu-open");
    // track recently visited (skip dashboard root to avoid noise)
    if (path !== "/" && path !== "/dashboard") {
      pushRecent({ kind: "Page", label: title + (baseRoute === "deals" || baseRoute === "brand" ? " — " + decodeURIComponent(path.split("/")[2] || "") : ""), path });
    }
  },
});

// Sidebar nav badges: small counts next to each section.
function refreshNavBadges() {
  const counts = {
    deals: Deals.all().length,
    pipeline: Deals.all().filter((d) => !d.paid).length,
    invoices: Deals.all().filter((d) => d.invoiceNumber || d.invoiceDate || d.invoiceUrl).length,
    bills: Bills.all().length,
    contacts: Contacts.all().length,
    automations: generateProposals().length,
  };
  document.querySelectorAll("#primary-nav a[data-route]").forEach((a) => {
    const k = a.dataset.route;
    let badge = a.querySelector(".nav-badge");
    if (!(k in counts)) { badge?.remove(); return; }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "nav-badge";
      a.append(badge);
    }
    badge.textContent = counts[k] || "";
    badge.style.display = counts[k] ? "" : "none";
    badge.classList.toggle("alert", k === "automations" && counts[k] > 0);
  });
}
subscribe(refreshNavBadges);
refreshNavBadges();

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
// Topbar buttons
document.getElementById("searchBtn")?.addEventListener("click", () => openPalette());
document.getElementById("helpBtn")?.addEventListener("click", () => openHelp());
document.getElementById("densityBtn")?.addEventListener("click", async () => {
  const { toggleDensity } = await import("./prefs.js");
  toggleDensity();
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // Cmd/Ctrl+K opens command palette anywhere
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    openPalette();
    return;
  }
  if (e.target.matches("input, textarea, select, [contenteditable]")) return;
  if (e.key === "?" || (e.shiftKey && e.key === "/")) { e.preventDefault(); openHelp(); return; }
  if (e.key === "n" && !e.metaKey && !e.ctrlKey) { openQuickAdd(); }
  if (e.key === "/" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openPalette(); }
  if (e.key === "g") {
    const next = (ev) => {
      const map = { d: "/", b: "/deals", k: "/pipeline", i: "/invoices", e: "/bills", m: "/mileage", c: "/contacts", t: "/timeline", a: "/automations", l: "/activity", r: "/reports", x: "/tax", p: "/templates", n: "/banking", o: "/income", s: "/settings" };
      const r = map[ev.key];
      if (r) go(r);
      document.removeEventListener("keydown", next, true);
    };
    document.addEventListener("keydown", next, true);
  }
});
