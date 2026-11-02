//! Global search with multi-filters + uninstaller/cleaner module.
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(serde::Deserialize)]
pub struct SearchFilters {
    pub root: String,
    #[serde(default)]
    pub q: String,
    #[serde(default)]
    pub exts: Vec<String>,            // e.g. [".pdf", ".docx"]
    pub min_size: Option<u64>,        // bytes
    pub max_size: Option<u64>,
    pub newer_than_days: Option<u64>, // modified within N days
    pub older_than_days: Option<u64>, // modified before N days ago
    pub kind: Option<String>,         // any | files | dirs
    pub cap: Option<usize>,
}

#[derive(Serialize)]
pub struct Hit {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub mtime: u64,
}

#[derive(Serialize)]
pub struct SearchResult {
    pub results: Vec<Hit>,
    pub truncated: bool,
    pub scanned: u64,
}

#[tauri::command]
pub fn search_files(f: SearchFilters) -> SearchResult {
    let cap = f.cap.unwrap_or(2000);
    let q = f.q.to_lowercase();
    let exts: Vec<String> = f.exts.iter().map(|e| e.to_lowercase()).collect();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let want_dirs = f.kind.as_deref() != Some("files");
    let want_files = f.kind.as_deref() != Some("dirs");
    let mut out = Vec::new();
    let mut scanned: u64 = 0;
    let mut truncated = false;

    let walker = WalkDir::new(&f.root)
        .max_depth(16)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            let n = e.file_name().to_string_lossy().to_uppercase();
            n != "$RECYCLE.BIN" && n != "SYSTEM VOLUME INFORMATION" && !n.starts_with("WINDOWS.OLD")
        });

    for e in walker {
        let Ok(e) = e else { continue };
        if !e.file_type().is_file() && !e.file_type().is_dir() {
            continue;
        }
        scanned += 1;
        let p = e.path();
        if p == Path::new(&f.root) {
            continue;
        }
        let name = e.file_name().to_string_lossy().to_string();
        if !q.is_empty() && !name.to_lowercase().contains(&q) {
            continue;
        }
        let is_dir = e.file_type().is_dir();
        if is_dir && !want_dirs { continue; }
        if !is_dir && !want_files { continue; }
        let Ok(md) = e.metadata() else { continue };
        let size = if is_dir { 0 } else { md.len() };
        if !exts.is_empty() && !is_dir {
            let ext = p.extension().map(|x| format!(".{}", x.to_string_lossy().to_lowercase())).unwrap_or_default();
            if !exts.contains(&ext) {
                continue;
            }
        }
        if (f.min_size.is_some() || f.max_size.is_some()) && !is_dir {
            if let Some(min) = f.min_size { if size < min { continue; } }
            if let Some(max) = f.max_size { if size > max { continue; } }
        }
        let mtime = md.modified().ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs()).unwrap_or(0);
        if f.newer_than_days.is_some() || f.older_than_days.is_some() {
            let age_days = (now.saturating_sub(mtime)) / 86400;
            if let Some(nd) = f.newer_than_days { if age_days > nd { continue; } }
            if let Some(od) = f.older_than_days { if age_days < od { continue; } }
        }
        out.push(Hit {
            path: p.to_string_lossy().to_string(),
            name,
            is_dir,
            size,
            mtime,
        });
        if out.len() >= cap {
            truncated = true;
            break;
        }
    }
    SearchResult { results: out, truncated, scanned }
}

// ---------------- cleaner ----------------

#[derive(Serialize)]
pub struct InstalledApp {
    pub name: String,
    pub version: String,
    pub publisher: String,
    pub install_location: String,
    pub uninstall_string: String,
    pub key: String,
}

fn read_uninstall_root(hive: &winreg::RegKey, sub: &str, out: &mut Vec<InstalledApp>, root_desc: &str) {
    use winreg::enums::*;
    let Ok(uninst) = hive.open_subkey_with_flags(sub, KEY_READ) else { return };
    for key in uninst.enum_keys().flatten() {
        let Ok(k) = uninst.open_subkey_with_flags(&key, KEY_READ) else { continue };
        let name: String = k.get_value("DisplayName").unwrap_or_default();
        if name.trim().is_empty() {
            continue;
        }
        let loc: String = k.get_value("InstallLocation").unwrap_or_default();
        out.push(InstalledApp {
            name,
            version: k.get_value("DisplayVersion").unwrap_or_default(),
            publisher: k.get_value("Publisher").unwrap_or_default(),
            install_location: loc,
            uninstall_string: k.get_value("UninstallString").unwrap_or_default(),
            key: format!("{}\\{}", root_desc, key),
        });
    }
}

#[tauri::command]
pub fn list_installed() -> Vec<InstalledApp> {
    use winreg::RegKey;
    const UNINSTALL: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
    const UNINSTALL_WOW: &str = r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall";
    let mut out = Vec::new();
    let hklm = RegKey::predef(winreg::enums::HKEY_LOCAL_MACHINE);
    let hkcu = RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
    read_uninstall_root(&hklm, UNINSTALL, &mut out, "HKLM");
    read_uninstall_root(&hklm, UNINSTALL_WOW, &mut out, "HKLM\\WOW6432Node");
    read_uninstall_root(&hkcu, UNINSTALL, &mut out, "HKCU");
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

#[derive(Serialize)]
pub struct CleanTarget {
    pub path: String,
    pub label: String,
    pub size: u64,
    pub risky: bool,
}

fn dir_size_capped(p: &Path, cap_entries: u64) -> u64 {
    let mut total = 0u64;
    let mut n = 0u64;
    for e in WalkDir::new(p).into_iter().flatten() {
        if let Ok(md) = e.metadata() {
            if md.is_file() {
                total += md.len();
            }
        }
        n += 1;
        if n >= cap_entries {
            break;
        }
    }
    total
}

#[tauri::command]
pub fn scan_cleanables() -> Vec<CleanTarget> {
    let mut out = Vec::new();
    let temps: [(String, String); 4] = [
        ("User temp".into(), std::env::temp_dir().to_string_lossy().to_string()),
        ("Windows temp".into(), "C:\\Windows\\Temp".into()),
        ("Windows Update cache".into(), "C:\\Windows\\SoftwareDistribution\\Download".into()),
        ("Thumbnails cache".into(), format!("{}\\Microsoft\\Windows\\Explorer",
            std::env::var("LOCALAPPDATA").unwrap_or_default())),
    ];
    for (label, path) in temps {
        let p = PathBuf::from(&path);
        if p.is_dir() {
            out.push(CleanTarget {
                path,
                label,
                size: dir_size_capped(&p, 60_000),
                risky: false,
            });
        }
    }
    out
}

#[tauri::command]
pub fn clean_paths(paths: Vec<String>) -> Result<(), String> {
    let mut errors = Vec::new();
    for p in &paths {
        // only allow cleaning inside known temp/cache roots, never a whole root itself
        let pb = PathBuf::from(p);
        let safe = pb.components().count() > 3
            && p.to_lowercase().contains("\\temp")
            || p.to_lowercase().contains("softwaredistribution")
            || p.to_lowercase().contains("\\explorer");
        if !safe {
            errors.push(format!("refusing unsafe path: {}", p));
            continue;
        }
        if let Ok(rd) = fs::read_dir(&pb) {
            for e in rd.flatten() {
                let r = if e.path().is_dir() { fs::remove_dir_all(e.path()) } else { fs::remove_file(e.path()) };
                if let Err(err) = r {
                    // locked files are expected; report but continue
                    errors.push(format!("{}: {}", e.file_name().to_string_lossy(), err));
                }
            }
        }
    }
    Ok(())
}

#[derive(Serialize)]
pub struct Orphan {
    pub path: String,
    pub hint: String,
}

/// Heuristic: appdata folders that don't look like they belong to any installed app.
/// Review-only output — nothing is deleted automatically.
#[tauri::command]
pub fn find_orphans() -> Vec<Orphan> {
    let apps = list_installed();
    let hay: String = apps.iter()
        .map(|a| format!("{} {} {}", a.name.to_lowercase(), a.install_location.to_lowercase(), a.publisher.to_lowercase()))
        .collect::<Vec<_>>()
        .join("§");
    let mut out = Vec::new();
    let roots = [
        ("Local", std::env::var("LOCALAPPDATA").unwrap_or_default()),
        ("Roaming", std::env::var("APPDATA").unwrap_or_default()),
    ];
    for (scope, root) in roots {
        if root.is_empty() { continue; }
        let Ok(rd) = fs::read_dir(&root) else { continue };
        for e in rd.flatten() {
            if !e.path().is_dir() { continue; }
            let name = e.file_name().to_string_lossy().to_lowercase();
            if name.len() < 3 { continue; }
            let known = ["microsoft", "google", "programs", "temp", "packages", "publisher cache",
                "cache", "d3dscache", "connectedDevicesPlatform", "comms", "crypto", "placeholder"];
            if known.iter().any(|k| name.contains(*k)) { continue; }
            // an app whose name/location mentions this folder name is NOT an orphan
            if hay.contains(name.as_str()) { continue; }
            out.push(Orphan {
                path: e.path().to_string_lossy().to_string(),
                hint: format!("{} appdata ({}): no installed app references it", scope, dir_size_capped(&e.path(), 2000)),
            });
            if out.len() >= 200 { break; }
        }
    }
    out
}
