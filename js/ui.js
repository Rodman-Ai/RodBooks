// Modal, toast, confirm — reusable UI primitives.

import { el } from "./utils.js";

export function toast(msg, kind = "info", ms = 2200) {
  const root = document.getElementById("toast-root");
  const t = el("div", { class: `toast ${kind}` }, msg);
  root.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .25s"; }, ms - 250);
  setTimeout(() => t.remove(), ms);
}

let modalStack = [];

export function openModal({ title, body, footer, onClose, wide }) {
  const root = document.getElementById("modal-root");
  const backdrop = el("div", { class: "modal-backdrop" });
  const modal = el(
    "div",
    { class: "modal", style: wide ? { maxWidth: "880px" } : null, role: "dialog", "aria-modal": "true" },
    el(
      "header",
      {},
      el("h2", {}, title || ""),
      el("button", { class: "icon-btn", "aria-label": "Close", onclick: () => close() }, "✕"),
    ),
    el("div", { class: "body" }, body),
    footer && el("footer", {}, footer),
  );
  backdrop.append(modal);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  root.append(backdrop);
  const entry = { backdrop, close };
  modalStack.push(entry);

  function close() {
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
    modalStack = modalStack.filter((m) => m !== entry);
    if (typeof onClose === "function") onClose();
  }

  return { close };
}

export function closeAllModals() {
  while (modalStack.length) modalStack.pop().close();
}

export function confirmDialog({ title = "Are you sure?", body, danger, confirmLabel = "Confirm", cancelLabel = "Cancel" }) {
  return new Promise((resolve) => {
    let m;
    const cancel = el("button", { class: "btn", onclick: () => { m.close(); resolve(false); } }, cancelLabel);
    const ok = el("button", { class: `btn ${danger ? "danger" : "primary"}`, onclick: () => { m.close(); resolve(true); } }, confirmLabel);
    m = openModal({
      title,
      body: el("div", {}, body || ""),
      footer: el("div", { class: "row" }, cancel, ok),
      onClose: () => resolve(false),
    });
  });
}
