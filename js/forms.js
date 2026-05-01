// Reusable form builders for the main entities.

import { el } from "./utils.js";
import { Contacts, Deals, Bills, Settings, VendorRules } from "./store.js";
import { SERVICE_OPTIONS, todayISO, netFee, fmtMoney } from "./utils.js";
import { openModal, toast } from "./ui.js";
import { parseDealText } from "./nl.js";

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
  const settings = Settings.get();
  const d = deal || {
    company: "", contactId: "", svc: "p", fee: 0, partnerFeePct: 0, paidAmount: 0,
    paid: false, paidDate: "", payMethod: "", serviceDate: todayISO(), postDate: "", draftDue: "",
    contractUrl: "", briefUrl: "", draftUrl: "", portalUrl: "", notesUrl: "",
    invoiceNumber: "", invoiceDate: "", invoiceUrl: "", invoiceTo: "",
    transactionId: "", year: new Date().getFullYear(), notes: "",
    deliverables: [], partials: [], terms: settings.defaultTerms || 0,
    creditNoteOf: "", quotedFee: 0,
  };

  const company = input(d.company, "text", { placeholder: "e.g. Descript", required: true });
  const contact = contactSelect(d.contactId);
  // Auto-fill from brand defaults when picking a contact (#5).
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
      if (c) {
        if (!company.value) company.value = c.name;
        // Auto-fill defaults if deal is empty
        if (isNew && c.defaultRates) {
          const rate = c.defaultRates[svc.value];
          if (rate && !fee.value) { fee.value = rate; recalcNet(); }
        }
      }
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
  const terms = selectEl(d.terms ?? "", [
    { value: "", label: "Due on receipt" },
    { value: "15", label: "Net 15" },
    { value: "30", label: "Net 30" },
    { value: "45", label: "Net 45" },
    { value: "60", label: "Net 60" },
    { value: "90", label: "Net 90" },
  ]);
  const quotedFee = input(d.quotedFee || "", "number", { step: "0.01", min: "0", placeholder: "What you originally quoted" });
  const creditOptions = [{ value: "", label: "— None (regular deal) —" }].concat(
    Deals.all().filter((x) => x.id !== d.id && x.invoiceNumber).map((x) => ({ value: x.id, label: `${x.company} · ${x.invoiceNumber}` })),
  );
  const creditNoteOf = selectEl(d.creditNoteOf || "", creditOptions);

  // Deliverables checklist (#4)
  let deliverables = (d.deliverables || []).slice();
  const dlvList = el("div", { class: "deliverables" });
  const renderDeliverables = () => {
    dlvList.innerHTML = "";
    deliverables.forEach((dl, i) => {
      const checkbox = input(null, "checkbox", { checked: !!dl.done });
      checkbox.addEventListener("change", () => { deliverables[i].done = checkbox.checked; });
      const label = input(dl.label || "", "text", { placeholder: "Deliverable" });
      label.addEventListener("input", () => { deliverables[i].label = label.value; });
      const due = input(dl.due || "", "date");
      due.addEventListener("input", () => { deliverables[i].due = due.value; });
      const remove = el("button", { class: "btn sm danger", type: "button", onclick: () => { deliverables.splice(i, 1); renderDeliverables(); } }, "×");
      dlvList.append(el("div", { class: "deliverable-row" }, checkbox, label, due, remove));
    });
    const presets = ["Script", "B-roll", "Thumbnail", "Draft", "Post", "Repost"];
    const addRow = el("div", { class: "row", style: { marginTop: "6px", flexWrap: "wrap", gap: "4px" } },
      el("button", { class: "btn sm", type: "button", onclick: () => { deliverables.push({ label: "", done: false, due: "" }); renderDeliverables(); } }, "+ Add"),
      ...presets.map((p) => el("button", { class: "btn sm ghost", type: "button", onclick: () => {
        if (!deliverables.some((x) => (x.label || "").toLowerCase() === p.toLowerCase())) {
          deliverables.push({ label: p, done: false, due: "" });
          renderDeliverables();
        }
      } }, "+ " + p)),
    );
    dlvList.append(addRow);
  };
  renderDeliverables();

  // Partial payments ledger (#44)
  let partials = (d.partials || []).slice();
  const partialsBox = el("div", { class: "partials" });
  const renderPartials = () => {
    partialsBox.innerHTML = "";
    partials.forEach((p, i) => {
      const date = input(p.date || todayISO(), "date");
      date.addEventListener("input", () => { partials[i].date = date.value; });
      const amount = input(p.amount || 0, "number", { step: "0.01", min: "0" });
      amount.addEventListener("input", () => { partials[i].amount = +amount.value || 0; recalcPaidFromPartials(); });
      const note = input(p.note || "", "text", { placeholder: "Memo" });
      note.addEventListener("input", () => { partials[i].note = note.value; });
      const remove = el("button", { class: "btn sm danger", type: "button", onclick: () => { partials.splice(i, 1); renderPartials(); recalcPaidFromPartials(); } }, "×");
      partialsBox.append(el("div", { class: "partial-row" }, date, amount, note, remove));
    });
    const total = partials.reduce((s, p) => s + (+p.amount || 0), 0);
    partialsBox.append(el("div", { class: "row spread", style: { marginTop: "6px" } },
      el("button", { class: "btn sm", type: "button", onclick: () => { partials.push({ date: todayISO(), amount: 0, note: "" }); renderPartials(); } }, "+ Record payment"),
      el("div", { class: "small muted" }, `${partials.length} payment${partials.length === 1 ? "" : "s"} · ${fmtMoney(total)}`),
    ));
  };
  function recalcPaidFromPartials() {
    if (!partials.length) return;
    const total = partials.reduce((s, p) => s + (+p.amount || 0), 0);
    paidAmount.value = total.toFixed(2);
    if (total >= netFee({ fee: +fee.value || 0, partnerFeePct: +partnerFee.value || 0, paidAmount: 0 }) - 0.01) {
      paid.checked = true;
      const last = partials.slice().sort((a, b) => (a.date || "").localeCompare(b.date || "")).pop();
      if (last?.date && !paidDate.value) paidDate.value = last.date;
    }
    recalcNet();
  }
  renderPartials();

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
    field("Quoted fee ($)", quotedFee),
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
    field("Payment terms", terms),
    field("Credit-note for", creditNoteOf),
    field("Invoice URL", invUrl, { full: true }),
    field("Invoice to (billing)", invoiceTo, { full: true }),
    el("div", { class: "field full" }, el("label", {}, "Deliverables"), dlvList),
    el("div", { class: "field full" }, el("label", {}, "Payment ledger"), partialsBox),
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
      quotedFee: +quotedFee.value || 0,
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
      terms: terms.value ? +terms.value : 0,
      creditNoteOf: creditNoteOf.value || "",
      deliverables: deliverables.filter((x) => x.label?.trim()),
      partials: partials.filter((p) => p.amount > 0 || p.date),
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
  // Vendor → category memory (#81): suggest category from learned rules.
  vendor.addEventListener("input", () => {
    if (!isNew) return;
    const suggested = VendorRules.categoryFor(vendor.value);
    if (suggested) category.value = suggested;
  });
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
    // Learn this vendor → category mapping (#81)
    VendorRules.learn(vendor.value.trim(), category.value);
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
  const c = contact || { name: "", company: "", type: "brand", email: "", phone: "", notes: "", tags: [], wikiMd: "", defaultRates: {}, audience: [], testimonials: [] };
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
  const tags = input((c.tags || []).join(", "), "text", { placeholder: "tier1, rush, pays-late, great-team" });
  const wikiMd = el("textarea", { class: "textarea", style: { minHeight: "120px" }, placeholder: "Brand notes (markdown OK)" }, c.wikiMd || "");

  // Default rates per service type (#5)
  const dr = c.defaultRates || {};
  const rateInputs = {};
  const rateGrid = el("div", { class: "form-grid" });
  ["v", "p", "qrt", "rt", "incentive"].forEach((k) => {
    const inp = input(dr[k] || "", "number", { step: "0.01", min: "0", placeholder: "0" });
    rateInputs[k] = inp;
    const lbl = ({ v: "Video", p: "Post", qrt: "Quote/RT", rt: "Repost", incentive: "Incentive" })[k];
    rateGrid.append(field(lbl, inp));
  });

  // Audience snapshot tracker (#93)
  let audience = (c.audience || []).slice();
  const audienceBox = el("div", { class: "audience" });
  const renderAudience = () => {
    audienceBox.innerHTML = "";
    audience.forEach((a, i) => {
      const date = input(a.date || todayISO(), "date");
      date.addEventListener("input", () => { audience[i].date = date.value; });
      const platform = selectEl(a.platform || "yt", ["yt", "ig", "tt", "x", "ln", "fb", "yt-shorts", "yt-subs"].map((v) => ({ value: v, label: v.toUpperCase() })));
      platform.addEventListener("change", () => { audience[i].platform = platform.value; });
      const count = input(a.count || 0, "number", { step: "1", min: "0", placeholder: "Followers" });
      count.addEventListener("input", () => { audience[i].count = +count.value || 0; });
      const remove = el("button", { class: "btn sm danger", type: "button", onclick: () => { audience.splice(i, 1); renderAudience(); } }, "×");
      audienceBox.append(el("div", { class: "audience-row" }, date, platform, count, remove));
    });
    audienceBox.append(el("button", { class: "btn sm", type: "button", style: { marginTop: 4 }, onclick: () => { audience.push({ date: todayISO(), platform: "yt", count: 0 }); renderAudience(); } }, "+ Snapshot"));
  };
  renderAudience();

  // Testimonials (#98)
  let testimonials = (c.testimonials || []).slice();
  const testBox = el("div", { class: "testimonials" });
  const renderTests = () => {
    testBox.innerHTML = "";
    testimonials.forEach((t, i) => {
      const date = input(t.date || todayISO(), "date");
      date.addEventListener("input", () => { testimonials[i].date = date.value; });
      const quote = el("textarea", { class: "textarea", placeholder: "“They were a dream to work with…”" }, t.quote || "");
      quote.addEventListener("input", () => { testimonials[i].quote = quote.value; });
      const remove = el("button", { class: "btn sm danger", type: "button", onclick: () => { testimonials.splice(i, 1); renderTests(); } }, "×");
      testBox.append(el("div", { class: "test-row" }, date, quote, remove));
    });
    testBox.append(el("button", { class: "btn sm", type: "button", style: { marginTop: 4 }, onclick: () => { testimonials.push({ date: todayISO(), quote: "" }); renderTests(); } }, "+ Add testimonial"));
  };
  renderTests();

  const body = el("div", { class: "form-grid" },
    field("Name", name),
    field("Type", type),
    field("Company", company, { full: true }),
    field("Email", email),
    field("Phone", phone),
    field("Tags (comma-separated)", tags, { full: true }),
    el("div", { class: "field full" }, el("label", {}, "Default rates ($)"), rateGrid),
    el("div", { class: "field full" }, el("label", {}, "Audience snapshots"), audienceBox),
    el("div", { class: "field full" }, el("label", {}, "Testimonials"), testBox),
    el("div", { class: "field full" }, el("label", {}, "Brand wiki (markdown)"), wikiMd),
    field("Quick notes", notes, { full: true }),
  );

  let modal;
  const save = () => {
    if (!name.value.trim()) { toast("Name required", "warn"); return; }
    const defaultRates = {};
    Object.entries(rateInputs).forEach(([k, inp]) => { if (+inp.value) defaultRates[k] = +inp.value; });
    Contacts.save({
      id: c.id,
      name: name.value.trim(),
      company: company.value.trim(),
      type: type.value,
      email: email.value.trim(),
      phone: phone.value.trim(),
      notes: notes.value,
      tags: tags.value.split(",").map((s) => s.trim()).filter(Boolean),
      wikiMd: wikiMd.value,
      defaultRates,
      audience: audience.filter((a) => a.count || a.date),
      testimonials: testimonials.filter((t) => t.quote?.trim()),
    });
    toast(isNew ? "Contact added" : "Contact updated");
    modal.close();
  };
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    el("button", { class: "btn", onclick: () => modal.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: save }, isNew ? "Add contact" : "Save"),
  );
  modal = openModal({ title: isNew ? "New contact" : "Edit contact", body, footer, wide: true });
  setTimeout(() => name.focus(), 30);
}

export function openQuickAdd() {
  const nlInput = el("input", {
    class: "input",
    placeholder: 'e.g. "Lumira AI $1500 video due May 15 paid"',
    style: { fontSize: "15px", padding: "10px 12px" },
  });
  const preview = el("div", { class: "small muted", style: { minHeight: "20px" } });
  const onInput = () => {
    const parsed = parseDealText(nlInput.value);
    if (!parsed || !nlInput.value.trim()) { preview.textContent = ""; return; }
    const parts = [];
    if (parsed.company) parts.push(`brand: ${parsed.company}`);
    if (parsed.fee) parts.push(`fee: $${parsed.fee}`);
    if (parsed.svc) parts.push(`type: ${parsed.svc}`);
    if (parsed.draftDue) parts.push(`due: ${parsed.draftDue}`);
    if (parsed.serviceDate) parts.push(`service: ${parsed.serviceDate}`);
    if (parsed.postDate) parts.push(`post: ${parsed.postDate}`);
    if (parsed.paid) parts.push("paid");
    preview.textContent = parts.length ? "→ " + parts.join("  ·  ") : "(no fields detected — opens a blank form)";
  };
  nlInput.addEventListener("input", onInput);
  nlInput.addEventListener("keydown", (e) => { if (e.key === "Enter") openParsedDeal(); });

  const openParsedDeal = () => {
    const parsed = parseDealText(nlInput.value) || {};
    close();
    openDealForm({
      company: parsed.company || "",
      svc: parsed.svc || "p",
      fee: parsed.fee || 0,
      partnerFeePct: parsed.partnerFeePct || 0,
      paid: !!parsed.paid,
      paidDate: parsed.paid ? todayISO() : "",
      draftDue: parsed.draftDue || "",
      serviceDate: parsed.serviceDate || todayISO(),
      postDate: parsed.postDate || "",
    });
  };

  const pasteImport = () => {
    const ta = el("textarea", { class: "textarea", placeholder: "Paste a brief, contract, or email here. We'll try to extract a deal.", style: { minHeight: "120px" } });
    let m2;
    const submit = () => {
      const parsed = parseDealText(ta.value) || {};
      m2.close(); close();
      openDealForm({
        company: parsed.company || "",
        svc: parsed.svc || "p",
        fee: parsed.fee || 0,
        partnerFeePct: parsed.partnerFeePct || 0,
        draftDue: parsed.draftDue || "",
        serviceDate: parsed.serviceDate || todayISO(),
        postDate: parsed.postDate || "",
        notes: ta.value.length > 200 ? ta.value.slice(0, 200) + "…" : ta.value,
      });
    };
    const footer = el("div", { class: "row" },
      el("div", { class: "spacer" }),
      el("button", { class: "btn", onclick: () => m2.close() }, "Cancel"),
      el("button", { class: "btn primary", onclick: submit }, "Extract & open"),
    );
    m2 = openModal({ title: "Paste to extract", body: ta, footer });
    setTimeout(() => ta.focus(), 30);
  };

  const body = el("div", { class: "stack" },
    el("div", { class: "field" },
      el("label", {}, "Type a deal in plain English"),
      nlInput, preview,
    ),
    el("div", { class: "row" },
      el("button", { class: "btn primary", onclick: openParsedDeal }, "Open deal form"),
      el("button", { class: "btn", onclick: pasteImport }, "Paste from email…"),
    ),
    el("div", { style: { borderTop: "1px solid var(--line)", margin: "12px 0", paddingTop: "12px" } },
      el("div", { class: "small muted", style: { marginBottom: 8 } }, "Or jump to:"),
      el("div", { class: "row", style: { flexWrap: "wrap", gap: "8px" } },
        el("button", { class: "btn", onclick: () => { close(); openDealForm(); } }, "★  New deal"),
        el("button", { class: "btn", onclick: () => { close(); openBillForm(); } }, "↧  New bill"),
        el("button", { class: "btn", onclick: () => { close(); openContactForm(); } }, "☺  New contact"),
      ),
    ),
  );
  let modal;
  const close = () => modal?.close();
  modal = openModal({ title: "Quick add", body });
  setTimeout(() => nlInput.focus(), 30);
}
