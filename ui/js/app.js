/* Prism → AeroFiles — app shell: theme, router, titlebar, shared components */
import { ipc } from "./ipc.js?v=2";
import { initExplorer } from "./explorer.js";
import { initSearch, initCleaner, initSettings } from "./panels.js";

export { ipc };

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmtSize = (n) => {
  if (!n) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i === 0 ? n : n.toFixed(1)) + " " + u[i];
};
export const fmtDate = (epoch) => {
  if (!epoch) return "";
  const d = new Date(epoch * 1000), p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem("prism." + k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem("prism." + k, JSON.stringify(v)),
};
export { store };

/* ---------------- theme ---------------- */
export function setAccent(hue) {
  document.documentElement.style.setProperty("--accent-h", String(hue));
  store.set("accent", hue);
}
export function setTheme(t) {
  document.documentElement.dataset.theme = t;
  store.set("theme", t);
}
setTheme(store.get("theme", "dark"));
setAccent(store.get("accent", 212));

/* ---------------- titlebar (real window controls only in Tauri) ---------------- */
if (ipc.native) {
  const w = window.__TAURI__.window.getCurrentWindow();
  $("win-min").onclick = () => w.minimize();
  $("win-max").onclick = () => w.toggleMaximize();
  $("win-close").onclick = () => w.close();
} else {
  $("win-min").hidden = $("win-max").hidden = true;
  $("win-close").onclick = () => toast("Running in browser preview — window controls disabled", false);
}

/* ---------------- router ---------------- */
const VIEWS = {};
export function registerView(name, el, api) { VIEWS[name] = { el, api }; }
function switchView(name) {
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  $(`view-${name}`).classList.add("active");
  VIEWS[name]?.api.onShow?.();
}
document.querySelectorAll(".nav-btn").forEach(b => b.onclick = () => switchView(b.dataset.view));

/* ---------------- status bar ---------------- */
export function status(left, right = "") { $("st-left").textContent = left; $("st-right").textContent = right; }
export function progress(text) { const p = $("st-progress"); p.hidden = !text; p.textContent = text || ""; }

/* ---------------- toasts ---------------- */
export function toast(msg, isErr = false) {
  const d = document.createElement("div");
  d.className = "toast" + (isErr ? " err" : "");
  d.textContent = msg;
  $("toasts").appendChild(d);
  setTimeout(() => { d.style.opacity = "0"; d.style.transition = "opacity .3s"; setTimeout(() => d.remove(), 320); }, 2600);
}

/* ---------------- modal ---------------- */
let modalAction = null;
export function promptModal(title, value, fn) {
  $("modal-title").textContent = title;
  $("modal-input").hidden = false; $("modal-input").value = value;
  $("modal-note").textContent = "";
  $("modal-back").hidden = false;
  $("modal-input").focus(); $("modal-input").select();
  modalAction = fn;
}
export function confirmModal(title, note, fn) {
  $("modal-title").textContent = title;
  $("modal-input").hidden = true;
  $("modal-note").textContent = note;
  $("modal-back").hidden = false;
  modalAction = () => fn();
}
function closeModal() { $("modal-back").hidden = true; modalAction = null; }
$("modal-ok").onclick = () => { const f = modalAction; closeModal(); f && f($("modal-input").value.trim()); };
$("modal-cancel").onclick = closeModal;
$("modal-back").onclick = (e) => { if (e.target.id === "modal-back") closeModal(); };
$("modal-input").onkeydown = (e) => {
  if (e.key === "Enter") { const f = modalAction; closeModal(); f && f($("modal-input").value.trim()); }
  if (e.key === "Escape") closeModal();
};

/* ---------------- context menu ---------------- */
export function showCtx(x, y, items) {
  const m = $("ctxmenu");
  m.innerHTML = "";
  for (const it of items) {
    if (it.sep) { const s = document.createElement("div"); s.className = "sep"; m.appendChild(s); continue; }
    const d = document.createElement("div");
    d.className = "mi" + (it.danger ? " danger" : "");
    d.innerHTML = `<span>${esc(it.l)}</span>${it.k ? `<span class="k">${it.k}</span>` : ""}`;
    d.onclick = () => { hideCtx(); it.fn(); };
    m.appendChild(d);
  }
  m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 8) + "px";
  m.style.top = Math.min(y, innerHeight - r.height - 8) + "px";
}
export function hideCtx() { $("ctxmenu").hidden = true; }
document.addEventListener("click", (e) => { if (!e.target.closest("#ctxmenu")) hideCtx(); });

/* ---------------- boot ---------------- */
registerView("explorer", $("view-explorer"), initExplorer());
registerView("search", $("view-search"), initSearch());
registerView("cleaner", $("view-cleaner"), initCleaner());
registerView("settings", $("view-settings"), initSettings());
status(ipc.native ? "AeroFiles — native" : "AeroFiles — browser preview (mock data)");
