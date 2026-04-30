import { el, todayISO } from "../utils.js";
import { Settings, exportJSON, importJSON, resetAll, loadSampleData, downloadFile, subscribe, Deals, Bills, Contacts } from "../store.js";
import { confirmDialog, toast } from "../ui.js";

export default function settings() {
  const node = el("div", {});
  const render = () => {
    const s = Settings.get();
    const dealCount = Deals.all().length;
    const billCount = Bills.all().length;
    const contactCount = Contacts.all().length;

    const businessName = inp(s.businessName, "Your Creator LLC");
    const legalName = inp(s.legalName, "Legal entity name");
    const email = inp(s.email, "you@yourdomain.com", "email");
    const address = textarea(s.address, "Mailing / billing address");
    const taxRate = inp(Math.round((s.taxRate || .3) * 100), "30", "number");
    const currency = sel(s.currency, ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "INR"].map((c) => ({ value: c, label: c })));
    const invPrefix = inp(s.invoicePrefix, "INV");
    const invNext = inp(s.nextInvoiceNumber, "1001", "number");

    const save = () => {
      Settings.update({
        businessName: businessName.value,
        legalName: legalName.value,
        email: email.value,
        address: address.value,
        taxRate: (+taxRate.value || 30) / 100,
        currency: currency.value,
        invoicePrefix: invPrefix.value,
        nextInvoiceNumber: +invNext.value || 1001,
      });
      toast("Settings saved");
    };

    const onExport = () => {
      const text = exportJSON();
      downloadFile(`rodbooks-${todayISO()}.json`, text, "application/json");
      toast("Exported");
    };
    const onImport = () => {
      const file = el("input", { type: "file", accept: ".json,application/json" });
      file.addEventListener("change", async () => {
        const f = file.files?.[0]; if (!f) return;
        const text = await f.text();
        try {
          importJSON(text);
          toast("Imported");
        } catch (e) {
          toast("Import failed: " + e.message, "warn", 4000);
        }
      });
      file.click();
    };
    const onSample = async () => {
      const ok = await confirmDialog({
        title: "Load sample data?",
        body: "This replaces your current data with sample brand deals and expenses (handy for demos).",
        confirmLabel: "Load sample",
      });
      if (ok) { loadSampleData(); toast("Sample data loaded"); }
    };
    const onReset = async () => {
      const ok = await confirmDialog({
        title: "Erase all data?",
        body: "This wipes all deals, bills, contacts, and settings. Export first if you want a backup.",
        danger: true, confirmLabel: "Erase everything",
      });
      if (ok) { resetAll(); toast("Reset"); }
    };

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Settings"),
          el("div", { class: "sub" }, "Business profile, invoicing, and your data."),
        ),
      ),
      el("div", { class: "card" },
        el("h3", {}, "Business profile"),
        el("div", { class: "form-grid" },
          field("Business name", businessName),
          field("Legal name", legalName),
          field("Email", email),
          field("Currency", currency),
          field("Tax reserve %", taxRate),
          field("Address", address, true),
        ),
      ),
      el("div", { class: "card" },
        el("h3", {}, "Invoicing"),
        el("div", { class: "form-grid" },
          field("Invoice prefix", invPrefix),
          field("Next invoice #", invNext),
        ),
      ),
      el("div", { class: "row", style: { justifyContent: "flex-end" } }, el("button", { class: "btn primary", onclick: save }, "Save settings")),

      el("div", { class: "card" },
        el("h3", {}, "Your data"),
        el("div", { class: "small muted", style: { marginBottom: "8px" } },
          `${dealCount} deals · ${billCount} bills · ${contactCount} contacts. Stored locally on this device.`),
        el("div", { class: "row", style: { flexWrap: "wrap", gap: "8px" } },
          el("button", { class: "btn", onclick: onExport }, "Export JSON"),
          el("button", { class: "btn", onclick: onImport }, "Import JSON"),
          el("button", { class: "btn", onclick: onSample }, "Load sample data"),
          el("button", { class: "btn danger", onclick: onReset }, "Reset all"),
        ),
      ),
      el("div", { class: "card" },
        el("h3", {}, "About"),
        el("div", { class: "small muted" },
          "RodBooks is a local-first accounting clone built for influencers. Your data lives in your browser; export JSON regularly for backups. Use the Print action on any invoice to save as PDF.",
        ),
      ),
    );
  };

  const unsub = subscribe(render);
  render();
  return { node, unmount: unsub };
}

function inp(value, placeholder, type = "text") {
  return el("input", { class: "input", type, value: value ?? "", placeholder });
}
function textarea(value, placeholder) {
  return el("textarea", { class: "textarea", placeholder }, value || "");
}
function sel(value, options) {
  const s = el("select", { class: "select" });
  for (const o of options) {
    const opt = el("option", { value: o.value }, o.label);
    if (o.value === value) opt.selected = true;
    s.append(opt);
  }
  return s;
}
function field(label, control, full) {
  return el("div", { class: `field ${full ? "full" : ""}` }, el("label", {}, label), control);
}
