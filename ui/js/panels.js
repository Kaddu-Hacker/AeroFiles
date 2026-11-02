/* Prism Files — Search, Cleaner, Settings views */
import { ipc, $, esc, fmtSize, fmtDate, store, setTheme, setAccent, toast, status, confirmModal, showCtx } from "./app.js";

/* ================= GLOBAL SEARCH ================= */
export function initSearch() {
  const root = $("view-search");
  root.innerHTML = `
  <div class="panel">
    <h2>Global Search <small>deep filesystem scan with multi-filters</small></h2>
    <div class="glass" style="padding:14px">
      <div class="filter-grid">
        <input id="s-q" class="big" placeholder="Search filenames anywhere under a drive or folder…">
      </div>
      <div class="filter-grid" style="margin-top:10px">
        <div class="fld"><span class="stat-chip">In</span><input id="s-root" value="C:" spellcheck="false" style="width:220px"></div>
        <div class="fld"><span class="stat-chip">Type</span>
          <select id="s-kind"><option value="any">Any</option><option value="files">Files</option><option value="dirs">Folders</option></select></div>
        <div class="fld"><span class="stat-chip">Ext</span><input id="s-exts" placeholder=".pdf .docx" spellcheck="false" style="width:130px"></div>
        <div class="fld"><span class="stat-chip">Size ≥</span><input id="s-min" placeholder="10 MB" style="width:80px"></div>
        <div class="fld"><span class="stat-chip">Modified</span>
          <select id="s-age"><option value="">Any time</option><option value="1">24 hours</option><option value="7">7 days</option><option value="30">30 days</option><option value="365">1 year</option></select></div>
        <button class="btn accent" id="s-go">Search</button>
      </div>
    </div>
    <div id="s-meta" class="stat-chip" style="align-self:flex-start">Type a query — Enter to search</div>
    <div id="s-results" style="display:flex;flex-direction:column;gap:2px"></div>
  </div>`;

  const run = async () => {
    const q = $("s-q").value.trim();
    const rootP = $("s-root").value.trim() || "C:";
    const exts = $("s-exts").value.split(/[\s,]+/).filter(x => x.startsWith("."));
    const minRaw = $("s-min").value.trim().toUpperCase();
    let min = null;
    const m = minRaw.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)?$/);
    if (m) min = Math.floor(parseFloat(m[1]) * ({ B: 1, KB: 2 ** 10, MB: 2 ** 20, GB: 2 ** 30, TB: 2 ** 40 }[m[2] || "B"]));
    const age = $("s-age").value;
    $("s-results").innerHTML = `<div class="empty-hint">Scanning ${esc(rootP)}…</div>`;
    status("Searching…");
    try {
      const r = await ipc.search({
        root: rootP, q, exts, min_size: min,
        kind: $("s-kind").value, cap: 1000,
        newer_than_days: age ? Number(age) : null,
      });
      $("s-meta").textContent = `${r.results.length} hits · scanned ${r.scanned.toLocaleString()} items${r.truncated ? " · capped" : ""}`;
      status(`${r.results.length} search results`);
      const box = $("s-results");
      box.innerHTML = "";
      const frag = document.createDocumentFragment();
      r.results.slice(0, 400).forEach(hit => {
        const d = document.createElement("div");
        d.className = "hit glass";
        d.innerHTML = `<span>${hit.is_dir ? "📁" : "📄"}</span>
          <span class="h-name">${esc(hit.name)}</span>
          <span class="h-path" title="${esc(hit.path)}">${esc(hit.path)}</span>
          <span class="s-sub">${hit.is_dir ? "" : fmtSize(hit.size)} · ${fmtDate(hit.mtime)}</span>`;
        d.ondblclick = () => hit.is_dir ? go(hit.path) : ipc.open(hit.path);
        d.oncontextmenu = (ev) => {
          ev.preventDefault();
          showCtx(ev.clientX, ev.clientY, [
            { l: "Open in Explorer view", fn: () => go(hit.is_dir ? hit.path : parentOf(hit.path)) },
            { l: "Open with default app", fn: () => ipc.open(hit.path) },
            { l: "Copy full path", fn: () => navigator.clipboard.writeText(hit.path) },
          ]);
        };
        frag.appendChild(d);
      });
      box.appendChild(frag);
      if (!r.results.length) box.innerHTML = `<div class="empty-hint">No matches.</div>`;
    } catch (e) { $("s-results").innerHTML = ""; toast(e.message || String(e), true); }
  };
  const parentOf = (p) => p.replace(/\\+$/, "").split("\\").slice(0, -1).join("\\");
  const go = (p) => document.querySelector('.nav-btn[data-view="explorer"]').click() ||
    setTimeout(() => window.dispatchEvent(new CustomEvent("prism:navigate", { detail: p })), 50);
  $("s-go").onclick = run;
  $("s-q").onkeydown = (e) => { if (e.key === "Enter") run(); };
  return {};
}

/* ================= CLEANER ================= */
export function initCleaner() {
  const root = $("view-cleaner");
  root.innerHTML = `
  <div class="panel">
    <h2>Smart Cleaner <small>installed apps · safe cleanups · orphaned leftovers</small></h2>
    <div style="display:flex;gap:12px;align-items:center">
      <button class="btn" id="c-rescan">⟳ Rescan</button>
      <span id="c-stats" class="stat-chip">scanning…</span>
      <button class="btn accent" id="c-clean" style="margin-left:auto">🧹 Clean selected</button>
    </div>
    <div class="side-title" style="padding-left:2px">Safe to clean (temp & caches)</div>
    <div id="c-cleanables" style="display:flex;flex-direction:column;gap:8px"></div>
    <div class="side-title" style="padding-left:2px">Orphaned leftovers <small style="color:var(--text-dim)">(review only — never auto-deleted)</small></div>
    <div id="c-orphans" style="display:flex;flex-direction:column;gap:8px"></div>
    <div class="side-title" style="padding-left:2px">Installed applications <span id="c-appcount"></span></div>
    <div id="c-apps" style="display:flex;flex-direction:column;gap:2px"></div>
  </div>`;

  async function rescan() {
    status("Cleaner scanning…");
    const [cleanables, orphans, apps] = await Promise.all([ipc.cleanables(), ipc.orphans(), ipc.installed()]);
    const cb = $("c-cleanables"); cb.innerHTML = "";
    let totalCleanable = 0;
    cleanables.forEach(t => {
      totalCleanable += t.size;
      cb.insertAdjacentHTML("beforeend", `
        <label class="clean-card glass">
          <input type="checkbox" checked data-path="${esc(t.path)}">
          <div class="c-label">${esc(t.label)}<div class="c-sub">${esc(t.path)}</div></div>
          <span class="stat-chip">${fmtSize(t.size)}</span>
        </label>`);
    });
    const or = $("c-orphans"); or.innerHTML = "";
    if (!orphans.length) or.innerHTML = `<div class="clean-card glass"><span>✨ No orphans detected</span></div>`;
    orphans.forEach(o => or.insertAdjacentHTML("beforeend", `
      <div class="clean-card glass">
        <input type="checkbox" data-orphan="${esc(o.path)}">
        <div class="c-label">${esc(o.path.split("\\").pop())}<div class="c-sub">${esc(o.hint)} · ${esc(o.path)}</div></div>
      </div>`));
    const ap = $("c-apps"); ap.innerHTML = "";
    $("c-appcount").textContent = `(${apps.length})`;
    apps.slice(0, 300).forEach(a => ap.insertAdjacentHTML("beforeend", `
      <div class="hit glass"><span>📦</span><span class="h-name">${esc(a.name)}</span>
        <span class="h-path">${esc(a.publisher || "—")} · ${esc(a.version || "—")}</span>
        <span class="s-sub">${esc(a.install_location || "")}</span></div>`));
    $("c-stats").textContent = `${fmtSize(totalCleanable)} reclaimable · ${orphans.length} orphan(s) · ${apps.length} apps`;
    status("Cleaner ready");
  }

  $("c-rescan").onclick = () => rescan().catch(e => toast(e.message || String(e), true));
  $("c-clean").onclick = () => {
    const paths = [...root.querySelectorAll("input[data-path]:checked, input[data-orphan]:checked")].map(i => i.dataset.path || i.dataset.orphan);
    if (!paths.length) return toast("Nothing selected", true);
    confirmModal(`Clean ${paths.length} location(s)?`, "Locked/in-use files are skipped automatically.", async () => {
      try { await ipc.clean(paths); toast("Cleanup complete"); rescan(); }
      catch (e) { toast(e.message || String(e), true); }
    });
  };
  return { onShow: () => rescan().catch(e => toast(e.message || String(e), true)) };
}

/* ================= SETTINGS ================= */
export function initSettings() {
  const root = $("view-settings");
  root.innerHTML = `
  <div class="panel" style="max-width:640px">
    <h2>Settings</h2>
    <div class="glass" style="padding:16px">
      <div class="side-title" style="padding-left:0">Theme</div>
      <div class="filter-grid">
        <button class="btn" id="th-dark">🌙 Dark</button>
        <button class="btn" id="th-light">☀️ Light</button>
      </div>
      <div class="side-title" style="padding-left:0;margin-top:14px">Accent</div>
      <div class="swatches" id="swatches"></div>
    </div>
    <div class="glass" style="padding:16px">
      <div class="side-title" style="padding-left:0">About</div>
      <div style="color:var(--text-dim);font-size:12.5px;line-height:1.8">
        <b style="color:var(--text)">AeroFiles</b> 0.1.0 — by Kaddu@Anshu — open-source glassmorphism file explorer for Windows.<br>
        Tauri 2 + Rust backend · zero-build vanilla JS frontend · MIT licensed.<br>
        ${ipc.native ? "Running natively (Tauri)." : "Browser preview mode — mock data."}
      </div>
    </div>
  </div>`;

  const hues = [212, 160, 268, 320, 24, 52, 0, 190];
  const cur = store.get("accent", 212);
  const sw = $("swatches");
  hues.forEach(h => {
    const d = document.createElement("div");
    d.className = "sw" + (h === cur ? " sel" : "");
    d.style.background = `hsl(${h} 92% 60%)`;
    d.onclick = () => { setAccent(h); sw.querySelectorAll(".sw").forEach(x => x.classList.remove("sel")); d.classList.add("sel"); };
    sw.appendChild(d);
  });
  $("th-dark").onclick = () => setTheme("dark");
  $("th-light").onclick = () => setTheme("light");
  return {};
}
