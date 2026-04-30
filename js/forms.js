// Reusable form builders for the main entities.

import { el } from "./utils.js";
import { Contacts, Deals, Bills, Settings } from "./store.js";
import { SERVICE_OPTIONS, todayISO, netFee, fmtMoney } from "./utils.js";
import { openModal, toast } from "./ui.js";

function field(label, control, opts = {}) {
  return el("div", { class: `field ${opts.full ? "full" : ""}` }, el("label", {}, label), control);
}

function input(value, type = "text", attrs = {}) {
  return el("input", { class: "input", type, value: value ?? "", ...attrs });
}
function selectEl(value, options, attrs = {}) {
  const s = el("select", { class: "select", ...attrs });
  for (const o of options) {
    const opt = el("option", { value: o.value }, o.label);
    if (String(o.value) === String(value ?? "")) opt.selected = true;
    s.append(opt);
  }
  return s;
}

function contactSelect(value, name = "contactId") {
  const list = Contacts.all();
  const opts = [{ value: "", label: "— Select brand / contact —" }].concat(
    list.map((c) => ({ value: c.id, label: c.name })),
  );
  opts.push({ value: "__new", label: "+ New contact…" });
  return selectEl(value, opts, { name });
}

export function openDealForm(deal) {
  const isNew = !deal?.id;
  const d = deal || {
    company: "", contactId: "", svc: "p", fee: 0, partnerFeePct: 0, paidAmount: 0,
    paid: false, paidDate: "", payMethod: "", serviceDate: todayISO(), postDate: "", draftDue: "",
    contractUrl: "", briefUrl: "", draftUrl: "", portalUrl: "", notesUrl: "",
    invoiceNumber: "", invoiceDate: "", invoiceUrl: "", invoiceTo: "",
    transactionId: "", year: new Date().getFullYear(), notes: "",
  };

  const company = input(d.company, "text", { placeholder: "e.g. Descript", required: true });
  const contact = contactSelect(d.contactId);
  contact.addEventListener("change", () => {
    if (contact.value === "__new") {
      const name = prompt("New contact name");
      if (name) {
        const c = Contacts.ensure(name);
        contact.replaceWith(contactSelect(c.id));
        company.value = company.value || name;
      } else {
        contact.value = d.contactId || "";
      }
    } else {
      const c = Contacts.get(contact.value);
      if (c && !company.value) company.value = c.name;
    }
  });

  const svc = selectEl(d.svc, SERVICE_OPTIONS.map((s) => ({ value: s.key, label: s.label })));
  const fee = input(d.fee, "number", { step: "0.01", min: "0" });
  const partnerFee = input(d.partnerFeePct, "number", { step: "0.01", min: "0", placeholder: "e.g. 3.5" });
  const paidAmount = input(d.paidAmount, "number", { step: "0.01", min: "0", placeholder: "auto" });
  const paid = input(null, "checkbox", { checked: d.paid });
  const paidDate = input(d.paidDate, "date");
  const payMethod = input(d.payMethod, "text", { placeholder: "Stripe, Brex, ACH, partnerstack…" });
  const serviceDate = input(d.serviceDate, "date");
  const postDate = input(d.postDate, "date");
  const draftDue = input(d.draftDue, "date");
  const invNumber = input(d.invoiceNumber, "text", { placeholder: "auto on first save" });
  const invDate = input(d.invoiceDate, "date");
  const invUrl = input(d.invoiceUrl, "url", { placeholder: "https://" });
  const invoiceTo = input(d.invoiceTo, "text", { placeholder: "Billing address / entity" });
  const contractUrl = input(d.contractUrl, "url", { placeholder: "https://" });
  const briefUrl = input(d.briefUrl, "url", { placeholder: "https://" });
  const draftUrl = input(d.draftUrl, "url", { placeholder: "https://" });
  const portalUrl = input(d.portalUrl, "url", { placeholder: "https://" });
  const notesUrl = input(d.notesUrl, "url", { placeholder: "https://" });
  const transactionId = input(d.transactionId, "text", { placeholder: "Bank/Stripe ref" });
  const notes = el("textarea", { class: "textarea", placeholder: "Notes" }, d.notes || "");

  const netHint = el("div", { class: "small muted" }, "");
  const recalcNet = () => {
    const n = netFee({ fee: +fee.value || 0, partnerFeePct: +partnerFee.value || 0, paidAmount: +paidAmount.value || 0 });
    netHint.textContent = `Net: ${fmtMoney(n)}`;
  };
  [fee, partnerFee, paidAmount].forEach((i) => i.addEventListener("input", recalcNet));
  recalcNet();

  const body = el("div", { class: "form-grid" },
    field("Brand / Company", company, { full: true }),
    field("Contact", contact),
    field("Service type", svc),
    field("Fee ($)", fee),
    field("Partner fee %", partnerFee),
    field("Paid amount (actual)", paidAmount),
    el("div", { class: "field full small muted" }, netHint),
    field("Service / Filming date", serviceDate),
    field("Post date", postDate),
    field("Draft due", draftDue),
    field("Pay method", payMethod),
    field("Paid date", paidDate),
    el("div", { class: "field" }, el("label", {}, "Paid?"), el("div", {}, paid)),
    field("Invoice #", invNumber),
    field("Invoice date", invDate),
    field("Invoice URL", invUrl, { full: true }),
    field("Invoice to (billing)", invoiceTo, { full: true }),
    field("Contract URL", contractUrl),
    field("Brief URL", briefUrl),
    field("Draft URL", draftUrl),
    field("Portal URL", portalUrl),
    field("Notes URL (GPT/Doc)", notesUrl),
    field("Transaction / Ref", transactionId),
    field("Notes", notes, { full: true }),
  );

  let modal;
  const save = () => {
    if (!company.value.trim()) { toast("Company is required", "warn"); return; }
    let cId = contact.value && contact.value !== "__new" ? contact.value : null;
    if (!cId) {
      const c = Contacts.ensure(company.value.trim());
      cId = c?.id;
    }
    let invNum = invNumber.value.trim();
    if (!invNum && (invDate.value || invUrl.value || paid.checked)) {
      const n = Settings.nextInvoiceNumber();
      invNum = `${Settings.get().invoicePrefix || "INV"}-${n}`;
    }
    const saved = Deals.save({
      id: d.id,
      contactId: cId,
      company: company.value.trim(),
      svc: svc.value,
      fee: +fee.value || 0,
      partnerFeePct: +partnerFee.value || 0,
      paidAmount: +paidAmount.value || 0,
      paid: paid.checked,
      paidDate: paidDate.value,
      payMethod: payMethod.value,
      serviceDate: serviceDate.value,
      postDate: postDate.value,
      draftDue: draftDue.value,
      contractUrl: contractUrl.value,
      briefUrl: briefUrl.value,
      draftUrl: draftUrl.value,
      portalUrl: portalUrl.value,
      notesUrl: notesUrl.value,
      invoiceNumber: invNum,
      invoiceDate: invDate.value,
      invoiceUrl: invUrl.value,
      invoiceTo: invoiceTo.value,
      transactionId: transactionId.value,
      notes: notes.value,
      year: serviceDate.value ? +serviceDate.value.slice(0, 4) : (d.year || new Date().getFullYear()),
    });
    toast(isNew ? "Deal created" : "Deal updated", "info");
    modal.close();
    return saved;
  };

  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    el("button", { class: "btn", onclick: () => modal.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: save }, isNew ? "Create deal" : "Save changes"),
  );

  modal = openModal({ title: isNew ? "New brand deal" : "Edit deal", body, footer, wide: true });
  setTimeout(() => company.focus(), 30);
  return modal;
}

export function openBillForm(bill) {
  const isNew = !bill?.id;
  const b = bill || {
    vendor: "", category: "Software", amount: 0, date: todayISO(),
    paid: true, paidDate: todayISO(), payMethod: "", recurring: "", notes: "", receiptUrl: "",
  };
  const vendor = input(b.vendor, "text", { required: true, placeholder: "Vendor name" });
  const category = selectEl(b.category, [
    "Software", "Equipment", "Office", "Travel", "Meals", "Marketing", "Contractors", "Education", "Subscriptions", "Phone & Internet", "Home Office", "Other",
  ].map((v) => ({ value: v, label: v })));
  const amount = input(b.amount, "number", { step: "0.01", min: "0", required: true });
  const date = input(b.date, "date");
  const paid = input(null, "checkbox", { checked: b.paid });
  const paidDate = input(b.paidDate, "date");
  const payMethod = input(b.payMethod, "text", { placeholder: "Brex card, ACH, etc." });
  const recurring = selectEl(b.recurring, [
    { value: "", label: "One-time" },
    { value: "monthly", label: "Monthly" },
    { value: "yearly", label: "Yearly" },
    { value: "weekly", label: "Weekly" },
  ]);
  const receipt = input(b.receiptUrl, "url", { placeholder: "https://" });
  const notes = el("textarea", { class: "textarea" }, b.notes || "");

  const body = el("div", { class: "form-grid" },
    field("Vendor", vendor, { full: true }),
    field("Category", category),
    field("Amount", amount),
    field("Date", date),
    el("div", { class: "field" }, el("label", {}, "Paid?"), el("div", {}, paid)),
    field("Paid date", paidDate),
    field("Pay method", payMethod),
    field("Recurring", recurring),
    field("Receipt URL", receipt, { full: true }),
    field("Notes", notes, { full: true }),
  );

  let modal;
  const save = () => {
    if (!vendor.value.trim()) { toast("Vendor required", "warn"); return; }
    Bills.save({
      id: b.id,
      vendor: vendor.value.trim(),
      category: category.value,
      amount: +amount.value || 0,
      date: date.value,
      paid: paid.checked,
      paidDate: paidDate.value,
      payMethod: payMethod.value,
      recurring: recurring.value,
      receiptUrl: receipt.value,
      notes: notes.value,
    });
    toast(isNew ? "Bill added" : "Bill updated");
    modal.close();
  };
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    el("button", { class: "btn", onclick: () => modal.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: save }, isNew ? "Add bill" : "Save"),
  );
  modal = openModal({ title: isNew ? "New bill / expense" : "Edit bill", body, footer });
  setTimeout(() => vendor.focus(), 30);
}

export function openContactForm(contact) {
  const isNew = !contact?.id;
  const c = contact || { name: "", company: "", type: "brand", email: "", phone: "", notes: "" };
  const name = input(c.name, "text", { required: true });
  const company = input(c.company, "text");
  const type = selectEl(c.type, [
    { value: "brand", label: "Brand" },
    { value: "agency", label: "Agency" },
    { value: "vendor", label: "Vendor" },
    { value: "partner", label: "Partner" },
    { value: "personal", label: "Personal" },
  ]);
  const email = input(c.email, "email");
  const phone = input(c.phone, "tel");
  const notes = el("textarea", { class: "textarea" }, c.notes || "");

  const body = el("div", { class: "form-grid" },
    field("Name", name),
    field("Type", type),
    field("Company", company, { full: true }),
    field("Email", email),
    field("Phone", phone),
    field("Notes", notes, { full: true }),
  );

  let modal;
  const save = () => {
    if (!name.value.trim()) { toast("Name required", "warn"); return; }
    Contacts.save({
      id: c.id,
      name: name.value.trim(),
      company: company.value.trim(),
      type: type.value,
      email: email.value.trim(),
      phone: phone.value.trim(),
      notes: notes.value,
    });
    toast(isNew ? "Contact added" : "Contact updated");
    modal.close();
  };
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    el("button", { class: "btn", onclick: () => modal.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: save }, isNew ? "Add contact" : "Save"),
  );
  modal = openModal({ title: isNew ? "New contact" : "Edit contact", body, footer });
  setTimeout(() => name.focus(), 30);
}

export function openQuickAdd() {
  const body = el("div", { class: "stack" },
    el("button", { class: "btn primary", onclick: () => { close(); openDealForm(); } }, "★  New brand deal"),
    el("button", { class: "btn", onclick: () => { close(); openBillForm(); } }, "↧  New bill / expense"),
    el("button", { class: "btn", onclick: () => { close(); openContactForm(); } }, "☺  New contact"),
  );
  let modal;
  const close = () => modal?.close();
  modal = openModal({ title: "Quick add", body });
}
