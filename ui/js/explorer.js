/* Prism Files — explorer view (files) */
import { ipc, $, esc, fmtSize, fmtDate, store, toast, status, progress, promptModal, confirmModal, showCtx } from "./app.js";

const ICONS = [
  [".pdf", "📕"], [".doc", "📘"], [".docx", "📘"], [".xls", "📗"], [".xlsx", "📗"],
  [".ppt", "📙"], [".pptx", "📙"], [".txt", "📝"], [".md", "📝"], [".log", "📝"],
  [".zip", "🗜️"], [".rar", "🗜️"], [".7z", "🗜️"], [".tar", "🗜️"], [".gz", "🗜️"], [".bz2", "🗜️"],
  [".exe", "⚙️"], [".msi", "⚙️"], [".bat", "⚡"], [".cmd", "⚡"], [".ps1", "⚡"], [".sh", "⚡"],
  [".lnk", "🔗"], [".url", "🔗"], [".desktop", "🔗"],
  [".dll", "🧩"], [".sys", "🧩"], [".ocx", "🧩"], [".dat", "🧩"], [".bin", "🧩"],
  [".ini", "⚙️"], [".cfg", "⚙️"], [".conf", "⚙️"], [".toml", "⚙️"], [".reg", "⚙️"],
  [".mp3", "🎵"], [".wav", "🎵"], [".flac", "🎵"], [".m4a", "🎵"], [".ogg", "🎵"], [".opus", "🎵"], [".mid", "🎵"],
  [".mp4", "🎬"], [".mkv", "🎬"], [".avi", "🎬"], [".mov", "🎬"], [".webm", "🎬"], [".wmv", "🎬"],
  [".png", "🖼️"], [".jpg", "🖼️"], [".jpeg", "🖼️"], [".gif", "🖼️"], [".webp", "🖼️"], [".bmp", "🖼️"],
  [".svg", "🖼️"], [".ico", "🖼️"], [".avif", "🖼️"], [".heic", "🖼️"], [".tiff", "🖼️"],
  [".py", "🐍"], [".rs", "🦀"], [".js", "📜"], [".ts", "📜"], [".json", "📜"], [".html", "📜"], [".htm", "📜"], [".css", "📜"],
  [".c", "📜"], [".cpp", "📜"], [".h", "📜"], [".go", "📜"], [".java", "📜"], [".php", "📜"], [".sql", "📜"],
  [".iso", "💿"], [".img", "💿"], [".vhd", "💾"], [".vhdx", "💾"], [".bak", "💾"],
  [".ttf", "🔤"], [".otf", "🔤"], [".woff", "🔤"], [".woff2", "🔤"],
  [".apk", "📦"], [".jar", "📦"], [".appx", "📦"], [".msix", "📦"], [".cab", "📦"],
  [".db", "🗄️"], [".sqlite", "🗄️"], [".sqlite3", "🗄️"], [".mdb", "🗄️"],
  [".csv", "📊"], [".tsv", "📊"], [".yml", "📊"], [".yaml", "📊"],
  [".torrent", "🧲"], [".eml", "✉️"], [".msg", "✉️"], [".psd", "🎨"], [".ai", "🎨"],
];
const IMG_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico", ".avif"]);
const iconFor = (e) => e.drive ? "💽" : e.is_dir ? "📁" : (ICONS.find(([x]) => e.ext === x) || [null, "📄"])[1];

let tab, sortBy = "name", sortDir = 1;
let viewMode = "list", showHidden = false;
let clipboard = null, searchState = null, shiftAnchor = null, favs = [];

export function initExplorer() {
  const root = $("view-explorer");
  root.innerHTML = `
  <div id="explorer">
    <aside id="ex-side" class="glass">
      <div class="side-title">Quick access</div><div id="qx-list"></div>
      <div class="side-title">Favorites</div><div id="fav-list"></div>
      <div class="side-title grow">Drives</div><div id="drive-list" style="flex:1"></div>
    </aside>
    <div id="ex-main">
      <div id="ex-toolbar" class="glass">
        <button class="tbtn" id="b-back" title="Back (Alt+←)">←</button>
        <button class="tbtn" id="b-fwd" title="Forward (Alt+→)">→</button>
        <button class="tbtn" id="b-up" title="Up (Backspace)">↑</button>
        <div id="crumbs" title="Double-click to type a path"></div>
        <button class="tbtn accent" id="b-newfolder">＋ Folder</button>
        <button class="tbtn" id="b-view" title="View (Ctrl+G)">▦</button>
        <button class="tbtn" id="b-hidden" title="Hidden (Ctrl+H)">◌</button>
      </div>
      <div id="file-wrap" class="glass">
        <div id="list-head">
          <div data-sort="name">Name <span class="arrow"></span></div>
          <div data-sort="size">Size <span class="arrow"></span></div>
          <div data-sort="mtime">Modified <span class="arrow"></span></div>
        </div>
        <div id="file-list" tabindex="0"></div>
        <div id="drop-overlay">Drop to move here</div>
      </div>
    </div>
    <aside id="preview" class="glass" hidden>
      <div id="preview-head">
        <div id="preview-name"></div>
        <button class="tbtn" id="p-open" title="Open default app">↗</button>
        <button class="tbtn" id="p-close" title="Close (Esc)">✕</button>
      </div>
      <div id="preview-body"></div>
      <div id="preview-meta"></div>
    </aside>
  </div>`;

  // hydrate persisted prefs here (never at module top level — app.js cycle/TDZ)
  sortBy = store.get("sortBy", "name"); sortDir = store.get("sortDir", 1);
  viewMode = store.get("view", "list"); showHidden = store.get("hidden", false);
  favs = store.get("favs", []);
  tab = { path: store.get("last", "COMPUTER"), history: [], hIdx: -1, entries: [], sel: new Set() };
  wireToolbar();
  wireList();
  nav0(tab.path);

  return {
    onShow() { renderSide(); renderAll(); },
  };
}

/* ------------ navigation ------------ */
async function nav0(path, push = true) {
  try {
    const entries = await ipc.list(path);
    if (push && tab.history[tab.hIdx] !== path) { tab.history = tab.history.slice(0, tab.hIdx + 1); tab.history.push(path); tab.hIdx = tab.history.length; }
    tab.path = path; tab.entries = entries; tab.sel.clear(); searchState = null;
    store.set("last", path);
    if (path !== "COMPUTER") pushRecent(path);
    renderAll();
  } catch (e) { toast(e.message || String(e), true); }
}
const up = () => {
  if (tab.path === "COMPUTER") return;
  const parent = tab.path.replace(/\\$/, "").split("\\").slice(0, -1).join("\\");
  nav0(parent || "COMPUTER");
};

/* ------------ rendering ------------ */
function renderAll() { renderCrumbs(); renderList(); renderSide(); renderStatus(); }

function renderCrumbs() {
  const c = $("crumbs");
  const mk = (label, path, last) => {
    const s = document.createElement("span");
    s.className = "crumb" + (last ? " last" : "");
    s.textContent = label;
    s.onclick = () => nav0(path);
    s.ondragover = (e) => e.preventDefault();
    s.ondrop = (e) => { e.preventDefault(); dropMove(path); };
    c.appendChild(s);
  };
  c.innerHTML = "";
  if (searchState) { c.innerHTML = `<span class="crumb last">Results for “${esc(searchState.q)}”</span>`; return; }
  if (tab.path === "COMPUTER") { mk("This PC", "COMPUTER", true); return; }
  mk("This PC", "COMPUTER", false);
  tab.path.replace(/\\$/, "").split("\\").forEach((p, i, arr) => {
    const sep = document.createElement("span"); sep.className = "crumb-sep"; sep.textContent = "›"; c.appendChild(sep);
    mk(p || "\\", arr.slice(0, i + 1).join("\\") + (i === 0 ? "\\" : ""), i === arr.length - 1);
  });
}

function sorted() {
  const arr = tab.entries.filter(e => showHidden || !e.hidden);
  arr.sort((a, b) => {
    if (a.drive !== b.drive) return a.drive ? -1 : 1;
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    let r = 0;
    if (sortBy === "name") r = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    else if (sortBy === "size") r = a.size - b.size;
    else r = a.mtime - b.mtime;
    return r * sortDir;
  });
  return arr;
}

function renderList() {
  const list = $("file-list"), head = $("list-head");
  list.classList.toggle("grid", viewMode === "grid");
  head.classList.toggle("grid-mode", viewMode === "grid");
  head.querySelectorAll("[data-sort]").forEach(h => {
    const on = sortBy === h.dataset.sort && !searchState;
    h.querySelector(".arrow").textContent = on ? (sortDir > 0 ? "▲" : "▼") : "";
  });
  const entries = searchState ? searchState.results : sorted();
  list.innerHTML = "";
  if (!entries.length) { list.innerHTML = `<div class="empty-hint">${searchState ? "No matches." : "Empty folder"}</div>`; return; }
  const frag = document.createDocumentFragment();
  const MAX = 2000;
  entries.slice(0, MAX).forEach((e, i) => {
    const key = searchState ? e.path : e.name;
    const row = document.createElement("div");
    row.className = "row" + (tab.sel.has(key) ? " sel" : "") + (isCut(e) ? " cut" : "");
    row.dataset.key = key; row.dataset.i = i; row.draggable = true;
    const full = searchState ? e.path : join(tab.path, e.name);
    const thumb = (!e.is_dir && IMG_EXT.has(e.ext))
      ? `<img class="thumb" loading="lazy" src="${ipc.fileUrl(full)}" onerror="this.remove()">` : "";
    row.innerHTML =
      `<div class="r-name"><span class="icon ${thumb ? "has-thumb" : ""}">${iconFor(e)}</span>${thumb}<span title="${esc(key)}">${esc(searchState ? key : e.name)}</span></div>` +
      `<div class="r-size">${e.drive ? fmtSize(e.free) + " free" : e.is_dir ? "—" : fmtSize(e.size)}</div>` +
      `<div class="r-date">${fmtDate(e.mtime)}</div>`;
    wireRow(row, e, i, full);
    frag.appendChild(row);
  });
  list.appendChild(frag);
  if (entries.length > MAX) list.insertAdjacentHTML("beforeend", `<div class="trunc-note">First ${MAX} of ${entries.length}</div>`);
}

const join = (dir, name) => dir === "COMPUTER" ? name : dir.replace(/\\$/, "") + "\\" + name;
const isCut = (e) => clipboard?.mode === "cut" && clipboard.srcs.includes(searchState ? e.path : join(tab.path, e.name));

function wireRow(row, e, i, full) {
  const key = row.dataset.key;
  row.onclick = (ev) => {
    if (ev.ctrlKey) { tab.sel.has(key) ? tab.sel.delete(key) : tab.sel.add(key); shiftAnchor = i; }
    else if (ev.shiftKey && shiftAnchor != null) {
      const rows = [...$("file-list").querySelectorAll(".row")];
      const [a, b] = [Math.min(shiftAnchor, i), Math.max(shiftAnchor, i)];
      tab.sel.clear(); rows.slice(a, b + 1).forEach(r => tab.sel.add(r.dataset.key));
    } else { tab.sel.clear(); tab.sel.add(key); shiftAnchor = i; }
    renderList(); renderStatus(); maybePreview();
  };
  row.ondblclick = () => {
    if (e.drive) return nav0(e.name + "\\");
    if (e.is_dir) return searchState ? nav0(e.path) : nav0(full);
    ipc.open(full).catch(err => toast(err.message || String(err), true));
  };
  row.oncontextmenu = (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    if (!tab.sel.has(key)) { tab.sel.clear(); tab.sel.add(key); renderList(); renderStatus(); }
    showCtx(ev.clientX, ev.clientY, ctxItems(e, full));
    maybePreview();
  };
  row.ondragstart = (ev) => {
    const keys = tab.sel.size && tab.sel.has(key) ? [...tab.sel] : [key];
    ev.dataTransfer.setData("text/prism", JSON.stringify(searchState ? keys : keys.map(k => join(tab.path, k))));
  };
}

function ctxItems(e, full) {
  const items = [];
  const one = tab.sel.size === 1;
  items.push({ l: e.is_dir || e.drive ? "Open" : "Open", k: "Enter", fn: () => e.drive ? nav0(e.name + "\\") : e.is_dir ? nav0(searchState ? e.path : full) : ipc.open(full) });
  if (one && (e.is_dir || e.drive)) items.push({ l: "Open in new view state", fn: () => nav0(searchState ? e.path : full) });
  items.push({ sep: 1 });
  items.push({ l: "Cut", k: "Ctrl+X", fn: () => clip("cut") });
  items.push({ l: "Copy", k: "Ctrl+C", fn: () => clip("copy") });
  if (!searchState && tab.path !== "COMPUTER") items.push({ l: "Paste", k: "Ctrl+V", fn: paste });
  items.push({ sep: 1 });
  if (one) items.push({ l: "Rename", k: "F2", fn: doRename });
  items.push({ l: `Delete${tab.sel.size > 1 ? ` ${tab.sel.size} items` : ""}`, k: "Del", fn: doDelete, danger: 1 });
  items.push({ l: "Delete permanently", k: "⇧Del", fn: () => doDelete(true), danger: 1 });
  items.push({ sep: 1 });
  if (one && (e.is_dir || e.drive)) {
    const p = searchState ? e.path : full;
    items.push({ l: favs.includes(p) ? "★ Unpin" : "☆ Pin to sidebar", fn: () => { favs = favs.includes(p) ? favs.filter(x => x !== p) : [...favs, p]; store.set("favs", favs); renderSide(); } });
  }
  items.push({ l: e.is_dir || e.drive ? "Zip here" : "Zip here", fn: async () => { try { await ipc.zip(full); toast("Archive created"); refresh(); } catch (err) { toast(err.message || String(err), true); } } });
  items.push({ l: "Copy path", k: "Ctrl+⇧+C", fn: async () => { await navigator.clipboard.writeText(full); toast("Path copied"); } });
  return items;
}

function renderSide() {
  const mk = (host, label, sub, path, icon) => {
    const el = document.createElement("div");
    el.className = "side-item";
    el.innerHTML = `<span>${icon}</span><span class="s-name" title="${esc(path)}">${esc(label)}</span>${sub ? `<span class="s-sub">${esc(sub)}</span>` : ""}`;
    el.onclick = () => nav0(path);
    el.ondragover = (e) => e.preventDefault();
    el.ondrop = (e) => { e.preventDefault(); dropMove(path); };
    host.appendChild(el);
  };
  const qx = $("qx-list"); qx.innerHTML = "";
  ipc.home().then(folders => folders.forEach(([label, path]) => mk(qx, label, "", path, "📁"))).catch(() => {});
  const fl = $("fav-list"); fl.innerHTML = "";
  if (!favs.length) fl.innerHTML = `<div class="side-item" style="color:var(--text-dim)">Right-click a folder → ☆ Pin</div>`;
  favs.forEach(p => mk(fl, p.split("\\").filter(Boolean).pop() || p, "", p, "★"));
  const dl = $("drive-list"); dl.innerHTML = "";
  ipc.drives().then(drives => drives.forEach(d => {
    const el = document.createElement("div");
    el.className = "side-item" + (tab.path === d.path ? " active" : "");
    const pct = d.total ? Math.round(100 * (d.total - d.free) / d.total) : 0;
    el.innerHTML = `<span>💽</span><div style="flex:1;min-width:0">
      <div style="display:flex;justify-content:space-between"><span class="s-name">${esc(d.path)} ${esc(d.label || "")}</span><span class="s-sub">${esc(d.kind || "")}</span></div>
      <div class="drive-bar"><i style="width:${pct}%"></i></div>
      <div class="s-sub">${fmtSize(d.free)} free of ${fmtSize(d.total)}</div></div>`;
    el.onclick = () => nav0(d.path);
    el.ondragover = (e) => e.preventDefault();
    el.ondrop = (e) => { e.preventDefault(); dropMove(d.path); };
    dl.appendChild(el);
  })).catch(() => {});
}

let recents = [];
function pushRecent(p) { if (!recents.length) recents = store.get("recents", []); recents = [p, ...recents.filter(x => x !== p)].slice(0, 10); store.set("recents", recents); }

function renderStatus() {
  const shown = searchState ? searchState.results.length : sorted().length;
  status(searchState ? `${shown} results` : `${shown} items`, tab.sel.size ? `${tab.sel.size} selected` : "");
}

/* ------------ ops ------------ */
function refresh() { nav0(tab.path, false); }
function clip(mode) {
  const srcs = selectedPaths();
  if (!srcs.length) return;
  clipboard = { mode, srcs };
  renderList(); toast(`${mode === "copy" ? "Copied" : "Cut"} ${srcs.length} item(s)`);
}
function selectedPaths() { return [...tab.sel].map(k => searchState ? k : join(tab.path, k)); }
async function paste() {
  if (!clipboard) return;
  try {
    const id = await ipc.transfer(clipboard.mode, clipboard.srcs, tab.path);
    if (clipboard.mode === "cut") clipboard = null;
    watchJob(id, "Transferring");
  } catch (e) { toast(e.message || String(e), true); }
}
async function dropMove(dst) {
  try {
    dropPayload = dropPayload || JSON.parse(event.dataTransfer.getData("text/prism") || "null");
    if (!dropPayload) return;
    const id = await ipc.transfer("move", dropPayload, dst);
    watchJob(id, "Moving");
  } catch (e) { toast(e.message || String(e), true); }
  dropPayload = null;
}
let dropPayload = null;
function doRename() {
  if (tab.sel.size !== 1) return;
  const k = [...tab.sel][0];
  promptModal("Rename", k, async (name) => {
    await ipc.rename(searchState ? k : join(tab.path, k), name);
    tab.sel.clear(); refresh();
  });
}
function doDelete(permanent) {
  const paths = selectedPaths();
  if (!paths.length) return;
  const run = async () => { await ipc.remove(paths, permanent); tab.sel.clear(); refresh(); toast(permanent ? "Deleted" : "Sent to Recycle Bin"); };
  if (permanent) confirmModal(`Permanently delete ${paths.length} item(s)?`, "This cannot be undone.", run);
  else confirmModal(`Move ${paths.length} item(s) to the Recycle Bin?`, "Restorable from the Recycle Bin.", run);
}
async function watchJob(id, label) {
  progress(`${label}…`);
  const tick = async () => {
    try {
      const j = await ipc.job(id);
      if (j.status === "running") { progress(`${label}… ${j.done}/${j.total} ${j.message || ""}`); setTimeout(tick, 350); }
      else { progress(null); j.status === "error" ? toast(j.error, true) : toast(`${label} — done`); refresh(); }
    } catch { progress(null); }
  };
  tick();
}

/* ------------ preview ------------ */
let previewTimer;
function maybePreview() {
  clearTimeout(previewTimer);
  if (tab.sel.size !== 1) { closePreview(); return; }
  previewTimer = setTimeout(showPreview, 200);
}
async function showPreview() {
  const key = [...tab.sel][0];
  const full = searchState ? key : join(tab.path, key);
  try {
    const info = await ipc.preview(full);
    if (info.kind === "none") return closePreview();
    $("preview").hidden = false;
    $("preview-name").textContent = key;
    const body = $("preview-body");
    body.innerHTML = "";
    const url = ipc.fileUrl(full);
    if (info.kind === "image") body.innerHTML = `<img src="${url}">`;
    else if (info.kind === "video") body.innerHTML = `<video src="${url}" controls muted></video>`;
    else if (info.kind === "audio") body.innerHTML = `<audio src="${url}" controls style="margin:auto"></audio>`;
    else if (info.kind === "pdf") body.innerHTML = `<iframe src="${url}"></iframe>`;
    else if (info.kind === "text") { const pre = document.createElement("pre"); pre.textContent = info.text; body.appendChild(pre); }
    $("preview-meta").textContent = `${fmtSize(info.size)}${info.truncated ? " · truncated" : ""}`;
  } catch { closePreview(); }
}
function closePreview() { $("preview").hidden = true; $("preview-body").innerHTML = ""; }

/* ------------ wiring ------------ */
function wireToolbar() {
  $("b-back").onclick = () => { if (tab.hIdx > 0) { tab.hIdx--; nav0(tab.history[tab.hIdx], false); } };
  $("b-fwd").onclick = () => { if (tab.hIdx < tab.history.length - 1) { tab.hIdx++; nav0(tab.history[tab.hIdx], false); } };
  $("b-up").onclick = up;
  $("b-newfolder").onclick = () => {
    if (tab.path === "COMPUTER") return;
    promptModal("New folder", "New folder", async (name) => { await ipc.mkdir(tab.path, name); refresh(); });
  };
  $("b-view").onclick = () => { viewMode = viewMode === "list" ? "grid" : "list"; store.set("view", viewMode); renderList(); };
  $("b-hidden").onclick = () => { showHidden = !showHidden; store.set("hidden", showHidden); renderList(); renderStatus(); };
  $("p-close").onclick = closePreview;
  $("p-open").onclick = () => { if (tab.sel.size === 1) ipc.open(searchState ? [...tab.sel][0] : join(tab.path, [...tab.sel][0])); };
  $("crumbs").ondblclick = () => {
    const c = $("crumbs");
    const inp = document.createElement("input");
    inp.id = "crumb-input"; inp.value = tab.path;
    c.innerHTML = ""; c.appendChild(inp); inp.focus(); inp.select();
    inp.onkeydown = (e) => { if (e.key === "Enter") nav0(inp.value.trim()); if (e.key === "Escape") renderCrumbs(); };
    inp.onblur = renderCrumbs;
  };
  document.querySelectorAll("#list-head [data-sort]").forEach(h => h.onclick = () => {
    const k = h.dataset.sort;
    if (sortBy === k) sortDir *= -1; else { sortBy = k; sortDir = 1; }
    store.set("sortBy", sortBy); store.set("sortDir", sortDir);
    renderList();
  });
  const list = $("file-list");
  list.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".row")) return;
    e.preventDefault(); tab.sel.clear(); renderList(); renderStatus();
    showCtx(e.clientX, e.clientY, ctxItems({ is_dir: true, name: tab.path, drive: false }, tab.path));
  });
  list.addEventListener("dragover", (e) => { e.preventDefault(); $("drop-overlay").classList.add("show"); });
  list.addEventListener("dragleave", () => $("drop-overlay").classList.remove("show"));
  list.addEventListener("drop", (e) => {
    e.preventDefault(); $("drop-overlay").classList.remove("show");
    dropPayload = JSON.parse(e.dataTransfer.getData("text/prism") || "null");
    const row = e.target.closest(".row");
    if (row) {
      const entry = searchState ? null : tab.entries.find(x => x.name === row.dataset.key);
      if (entry?.is_dir) return dropMove(join(tab.path, entry.name));
    }
    if (dropPayload && tab.path !== "COMPUTER") dropMove(tab.path);
  });

  window.addEventListener("prism:navigate", (e) => { if (e.detail) nav0(e.detail); });
  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("view-explorer").classList.contains("active")) return;
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    const k = e.key.toLowerCase();
    if (e.key === "Escape") { closePreview(); return; }
    if (e.key === "F5") { e.preventDefault(); refresh(); }
    else if (e.key === "F2") doRename();
    else if (e.key === "Delete") { e.preventDefault(); doDelete(e.shiftKey); }
    else if (e.key === "Backspace") { e.preventDefault(); up(); }
    else if (e.key === "Enter") selectedPaths().forEach(p => { const en = searchState ? searchState.results.find(r => r.path === p) : tab.entries.find(x => join(tab.path, x.name) === p); if (en && (en.is_dir || en.drive)) nav0(en.drive ? en.name + "\\" : p); else ipc.open(p); });
    else if (e.ctrlKey && k === "a") { e.preventDefault(); const all = searchState ? searchState.results : sorted(); tab.sel = new Set(all.map(x => searchState ? x.path : x.name)); renderList(); renderStatus(); }
    else if (e.ctrlKey && k === "c") clip("copy");
    else if (e.ctrlKey && k === "x") clip("cut");
    else if (e.ctrlKey && k === "v") paste();
    else if (e.ctrlKey && e.shiftKey && k === "c") navigator.clipboard.writeText(selectedPaths().join("\n")).then(() => toast("Paths copied"));
    else if (e.ctrlKey && k === "h") { e.preventDefault(); showHidden = !showHidden; store.set("hidden", showHidden); renderList(); }
    else if (e.ctrlKey && k === "g") { e.preventDefault(); viewMode = viewMode === "list" ? "grid" : "list"; store.set("view", viewMode); renderList(); }
    else if (e.altKey && e.key === "ArrowLeft") $("b-back").click();
    else if (e.altKey && e.key === "ArrowRight") $("b-fwd").click();
  });
}
function wireList() { /* handled in wireToolbar */ }
