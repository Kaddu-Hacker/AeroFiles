/* AeroFiles — IPC bridge.
   In Tauri: real Rust commands. In a plain browser: a mock backend. */

const isTauri = !!window.__TAURI__;
const invokeReal = (cmd, args) => window.__TAURI__.core.invoke(cmd, args);

const fileUrlReal = (p) => window.__TAURI__.core.convertFileSrc(p);

/* ---------------- mock backend (browser preview mode) ---------------- */
const MOCK_TIME = Math.floor(Date.now() / 1000);
const mockJobs = new Map();

function mkFs() {
  const f = (name, size, ext, mtime = MOCK_TIME - Math.floor(Math.random() * 8.64e7 * 30)) =>
    ({ name, is_dir: false, size, ext, mtime, hidden: false });
  const d = (name, mtime = MOCK_TIME - 8.64e5) =>
    ({ name, is_dir: true, size: 0, ext: "", mtime, hidden: false });
  return {
    "C:": { children: {
      "Users": { children: {
        "You": { children: {
          "Desktop": { children: { "todo.txt": f("todo.txt", 128, ".txt"), "screenshot.png": f("screenshot.png", 884_233, ".png") } },
          "Documents": { children: { "projects": { children: { "readme.md": f("readme.md", 2_310, ".md"), "main.rs": f("main.rs", 9_812, ".rs") } }, "budget.xlsx": f("budget.xlsx", 38_221, ".xlsx") } },
          "Downloads": { children: { "setup.exe": f("setup.exe", 71_234_112, ".exe"), "paper.pdf": f("paper.pdf", 1_204_558, ".pdf") } },
          "Music": { children: { "album": { children: { "01 track.mp3": f("01 track.mp3", 7_342_112, ".mp3") } } } },
          "Videos": { children: { "clip.mp4": f("clip.mp4", 132_887_231, ".mp4") } },
        }}}},
      "Windows": { children: { "System32": { children: { "cmd.exe": f("cmd.exe", 232_960, ".exe"), "notepad.exe": f("notepad.exe", 201_216, ".exe") } } } },
      "Program Files": { children: {} },
    }},
    "E:": { children: {
      "projects": { children: { "prism-files": { children: { "index.html": f("index.html", 3_311, ".html"), "app.css": f("app.css", 14_118, ".css"), "main.rs": f("main.rs", 2_044, ".rs") } } } },
      "media": { children: { "wallpaper.jpg": f("wallpaper.jpg", 2_884_112, ".jpg"), "song.flac": f("song.flac", 31_204_112, ".flac") } },
      "tools": { children: { "python": { children: {} }, "nodejs": { children: {} } } },
    }},
    "D:": { children: { "backup": { children: { "archive.zip": f("archive.zip", 881_234_112, ".zip") } } } },
  };
}
let FS = mkFs();
const LABELS = { "C:": "System", "E:": "Data", "D:": "Vault" };

function resolve(path) {
  if (path === "COMPUTER") return { driveRoots: Object.keys(FS) };
  const parts = path.replace(/\\+$/, "").split("\\").filter(Boolean);
  let node = FS[parts[0]];
  if (!node) return null;
  for (const seg of parts.slice(1)) {
    const next = node.children?.[seg];
    if (!next) return null;
    node = next;
  }
  return { node, parts };
}

const mock = {
  async list_dir({ path }) {
    const r = resolve(path);
    if (!r) throw new Error("path not found");
    if (r.driveRoots) {
      return Object.keys(FS).map((name, i) => ({
        name, is_dir: true, size: 0, ext: "", hidden: false, mtime: MOCK_TIME,
        drive: true, label: LABELS[name] || "", free: [13.6, 94.8, 210.4][i] * 2 ** 30,
        total: [103.8, 361.0, 512.0][i] * 2 ** 30,
      }));
    }
    if (!r.node.is_dir && r.node.children === undefined) throw new Error("not a directory");
    const ch = r.node.children || {};
    return Object.entries(ch).map(([name, n]) => n.drive || n.free ? n :
      { name, is_dir: !!n.children, size: n.children ? 0 : n.size, ext: n.ext || "", mtime: n.mtime, hidden: false });
  },
  async drives() {
    return Object.keys(FS).map((p, i) => ({ path: p, label: LABELS[p] || "",
      free: [13.6, 94.8, 210.4][i] * 2 ** 30, total: [103.8, 361.0, 512.0][i] * 2 ** 30, kind: "SSD" }));
  },
  async home_dirs() {
    return [["Desktop", "C:\\Users\\You\\Desktop"], ["Documents", "C:\\Users\\You\\Documents"],
      ["Downloads", "C:\\Users\\You\\Downloads"], ["Pictures", "C:\\Users\\You\\Pictures"],
      ["Music", "C:\\Users\\You\\Music"], ["Videos", "C:\\Users\\You\\Videos"]];
  },
  async open_path({ path }) { console.info("[mock] open", path); },
  async mkdir({ parent, name }) {
    const r = resolve(parent); if (!r?.node?.children) throw new Error("bad parent");
    let n = name, i = 2;
    while (r.node.children[n]) n = `${name} (${i++})`;
    r.node.children[n] = { children: {} };
    return n;
  },
  async new_file({ parent, name }) {
    const r = resolve(parent); if (!r?.node?.children) throw new Error("bad parent");
    let n = name, i = 2;
    while (r.node.children[n]) n = `${name} (${i++})`;
    r.node.children[n] = { name: n, is_dir: false, size: 0, ext: "", mtime: MOCK_TIME, hidden: false };
    return n;
  },
  async rename_path({ path, name }) {
    const parts = path.replace(/\\+$/, "").split("\\").filter(Boolean);
    const old = parts.pop(); const parent = resolve(parts.join("\\"));
    if (!parent?.node?.children?.[old]) throw new Error("not found");
    if (parent.node.children[name]) throw new Error("name already exists");
    parent.node.children[name] = parent.node.children[old];
    delete parent.node.children[old];
    return [...parts, name].join("\\");
  },
  async delete_paths({ paths }) { for (const p of paths) mockDel(p, false); },
  async recycle_paths({ paths }) { for (const p of paths) mockDel(p, false); },
  async zip_folder({ path }) { console.info("[mock] zip", path); return path + ".zip"; },
  async preview_file({ path }) {
    const r = resolve(path);
    const ext = "." + (path.split(".").pop() || "").toLowerCase();
    const kind = [".png",".jpg",".jpeg",".gif",".webp"].includes(ext) ? "image"
      : [".mp4",".webm"].includes(ext) ? "video" : [".mp3",".flac",".wav"].includes(ext) ? "audio"
      : ext === ".pdf" ? "pdf" : [".txt",".md",".rs",".py",".html",".css",".js",".json",".log"].includes(ext) ? "text" : "none";
    return { kind, text: kind === "text" ? `// ${path}\n// (mock preview content)\nfn main() {\n    println!("Hello from Prism Files!");\n}` : null,
      size: r?.node?.size ?? 0, truncated: false };
  },
  async copy_move({ mode, srcs, dst }) {
    const id = String(Math.random()).slice(2, 10);
    mockJobs.set(id, { status: "running", done: 0, total: srcs.length, message: "working…", error: "" });
    setTimeout(() => {
      for (const s of srcs) {
        const parts = s.replace(/\\+$/, "").split("\\").filter(Boolean);
        const name = parts.pop(); const from = resolve(parts.join("\\"));
        const to = resolve(dst);
        if (from?.node?.children?.[name] && to?.node?.children) {
          if (mode === "move" || from.parts.join("\\") !== to.parts.join("\\")) {
            to.node.children[name] = from.node.children[name];
            if (mode === "move") delete from.node.children[name];
          }
        }
      }
      const j = mockJobs.get(id); j.status = "done"; j.done = j.total;
    }, 500);
    return id;
  },
  async get_job({ id }) { return mockJobs.get(id) || { status: "error", done: 0, total: 0, message: "", error: "no job" }; },
  async search_files(filters) {
    const hits = [];
    const walk = (path, node, depth) => {
      if (hits.length >= (filters.cap || 500) || depth > 8) return;
      for (const [name, n] of Object.entries(node.children || {})) {
        const p = path + "\\" + name;
        const q = (filters.q || "").toLowerCase();
        if (!q || name.toLowerCase().includes(q)) {
          hits.push({ name, path: p, is_dir: !!n.children, size: n.size || 0, mtime: n.mtime || MOCK_TIME });
        }
        if (n.children) walk(p, n, depth + 1);
      }
    };
    const r = resolve(filters.root);
    if (r?.driveRoots) { for (const d of r.driveRoots) walk(d, FS[d], 1); }
    else if (r?.node) walk(filters.root.replace(/\\+$/, ""), r.node, 1);
    return { results: hits, truncated: false, scanned: hits.length };
  },
  async list_installed() {
    return [
      { name: "Firefox", version: "132.0", publisher: "Mozilla", install_location: "C:\\Program Files\\Mozilla Firefox", uninstall_string: "…", key: "HKLM" },
      { name: "VS Code", version: "1.95", publisher: "Microsoft", install_location: "C:\\Users\\You\\AppData\\Local\\Programs\\Microsoft VS Code", uninstall_string: "…", key: "HKCU" },
      { name: "7-Zip", version: "24.08", publisher: "Igor Pavlov", install_location: "C:\\Program Files\\7-Zip", uninstall_string: "…", key: "HKLM" },
    ];
  },
  async scan_cleanables() {
    return [
      { path: "C:\\Users\\You\\AppData\\Local\\Temp", label: "User temp", size: 2_411_776_112, risky: false },
      { path: "C:\\Windows\\Temp", label: "Windows temp", size: 412_887_231, risky: false },
      { path: "C:\\Windows\\SoftwareDistribution\\Download", label: "Windows Update cache", size: 1_120_004_112, risky: false },
    ];
  },
  async clean_paths({ paths }) { console.info("[mock] clean", paths); },
  async find_orphans() {
    return [
      { path: "C:\\Users\\You\\AppData\\Roaming\\OldPaintApp", hint: "Roaming appdata (14 MB): no installed app references it" },
      { path: "C:\\Users\\You\\AppData\\Local\\GameLauncher2019", hint: "Local appdata (203 MB): no installed app references it" },
    ];
  },
};

function mockDel(path, _perm) {
  const parts = path.replace(/\\+$/, "").split("\\").filter(Boolean);
  const name = parts.pop();
  const parent = resolve(parts.join("\\"));
  if (parent?.node?.children?.[name]) delete parent.node.children[name];
}

/* ---------------- public api ---------------- */
export const ipc = {
  native: isTauri,
  async call(cmd, args = {}) {
    return isTauri ? invokeReal(cmd, args) : mock[cmd](args);
  },
  list: (path) => ipc.call("list_dir", { path }),
  drives: () => ipc.call("drives"),
  home: () => ipc.call("home_dirs"),
  open: (path) => ipc.call("open_path", { path }),
  mkdir: (parent, name) => ipc.call("mkdir", { parent, name }),
  newFile: (parent, name) => ipc.call("new_file", { parent, name }),
  rename: (path, name) => ipc.call("rename_path", { path, name }),
  remove: (paths, permanent) => ipc.call(permanent ? "delete_paths" : "recycle_paths", { paths }),
  transfer: (mode, srcs, dst) => ipc.call("copy_move", { mode, srcs, dst }),
  job: (id) => ipc.call("get_job", { id }),
  preview: (path) => ipc.call("preview_file", { path }),
  zip: (path) => ipc.call("zip_folder", { path }),
  search: (filters) => ipc.call("search_files", filters),
  installed: () => ipc.call("list_installed"),
  cleanables: () => ipc.call("scan_cleanables"),
  clean: (paths) => ipc.call("clean_paths", { paths }),
  orphans: () => ipc.call("find_orphans"),
  fileUrl: (p) => (isTauri ? fileUrlReal(p) : mockMediaUrl(p)),
};

function mockMediaUrl(p) {
  const ext = p.split(".").pop().toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
    const hue = (p.length * 47) % 360;
    return "data:image/svg+xml," + encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='112'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${hue},70%,55%)'/><stop offset='1' stop-color='hsl(${hue + 70},70%,40%)'/></linearGradient></defs><rect width='160' height='112' fill='url(#g)'/><circle cx='40' cy='34' r='13' fill='white' opacity='.7'/><path d='M0 112 60 55l35 34 25-22 40 45z' fill='white' opacity='.45'/></svg>`);
  }
  return "";
}
