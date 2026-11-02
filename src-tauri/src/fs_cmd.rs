//! Filesystem commands: listing, drives, operations, preview, zip, transfers.
use crate::jobs::{Job, Jobs};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::os::windows::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

#[derive(Serialize)]
pub struct Entry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub mtime: u64,
    pub ext: String,
    pub hidden: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drive: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub free: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dtype: Option<String>,
}

#[derive(Serialize)]
pub struct Drive {
    pub path: String,
    pub label: String,
    pub free: u64,
    pub total: u64,
    pub kind: String,
}

#[derive(Serialize)]
pub struct Preview {
    pub kind: String, // image | video | audio | pdf | text | none
    pub text: Option<String>,
    pub size: u64,
    pub truncated: bool,
}

/// Canonicalize a user-supplied path: "C:" -> "C:\" (a bare drive letter is a
/// drive-relative path that resolves against the per-drive current directory,
/// not the root — which made C: show the wrong folder).
fn canon(raw: &str) -> String {
    let t = raw.trim();
    let b = t.as_bytes();
    if b.len() == 2 && b[1] == b':' && b[0].is_ascii_alphabetic() {
        format!("{t}\\")
    } else {
        t.to_string()
    }
}

fn entry_of(p: &Path) -> Option<Entry> {
    let md = fs::metadata(p).ok()?;
    let name = p.file_name()?.to_string_lossy().to_string();
    let is_dir = md.is_dir();
    #[cfg(windows)]
    let hidden = (md.file_attributes() & 0x2) != 0;
    #[cfg(not(windows))]
    let hidden = false;
    Some(Entry {
        ext: p
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
            .unwrap_or_default(),
        name,
        is_dir,
        size: if is_dir { 0 } else { md.len() },
        mtime: md
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0),
        hidden,
        drive: None,
        label: None,
        free: None,
        total: None,
        dtype: None,
    })
}

#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<Entry>, String> {
    // "COMPUTER" is the virtual This PC root — render drives as entries
    if path.trim().eq_ignore_ascii_case("COMPUTER") {
        return Ok(drives()
            .into_iter()
            .map(|d| Entry {
                name: d.path.clone(),
                is_dir: true,
                size: 0,
                mtime: 0,
                ext: String::new(),
                hidden: false,
                drive: Some(true),
                label: Some(d.label.clone()),
                free: Some(d.free),
                total: Some(d.total),
                dtype: Some(d.kind.clone()),
            })
            .collect());
    }
    let root = PathBuf::from(canon(&path));
    if !root.is_dir() {
        return Err("path is not a directory".into());
    }
    let mut out = Vec::new();
    for e in fs::read_dir(&root).map_err(|e| e.to_string())? {
        let Ok(e) = e else { continue };
        if let Some(en) = entry_of(&e.path()) {
            out.push(en);
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn drives() -> Vec<Drive> {
    use sysinfo::Disks;
    let disks = Disks::new_with_refreshed_list();
    disks
        .list()
        .iter()
        .map(|d| Drive {
            path: d.mount_point().to_string_lossy().trim_end_matches('\\').to_string(),
            label: d.name().to_string_lossy().to_string(),
            free: d.available_space(),
            total: d.total_space(),
            kind: format!("{:?}", d.kind()).split('(').next().unwrap_or("Unknown").trim().to_string(),
        })
        .collect()
}

#[tauri::command]
pub fn home_dirs() -> Vec<(String, String)> {
    let pairs: [( &str, Option<PathBuf> ); 6] = [
        ("Desktop", dirs::desktop_dir()),
        ("Documents", dirs::document_dir()),
        ("Downloads", dirs::download_dir()),
        ("Pictures", dirs::picture_dir()),
        ("Music", dirs::audio_dir()),
        ("Videos", dirs::video_dir()),
    ];
    pairs
        .into_iter()
        .filter_map(|(label, p)| p.map(|p| (label.to_string(), p.to_string_lossy().to_string())))
        .collect()
}

#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    // ShellExecuteW via the `open` crate — no cmd.exe re-parsing, so paths
    // containing `&` (C:\Users\Keshaw&Tanishi\…) open correctly.
    open::that(canon(&path)).map_err(|e| e.to_string())
}

fn unique_target(dst: &Path) -> PathBuf {
    if !dst.exists() {
        return dst.to_path_buf();
    }
    let stem = dst.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = dst.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    let parent = dst.parent().unwrap_or(Path::new("."));
    for n in 2..10000 {
        let cand = parent.join(format!("{} ({}){}", stem, n, ext));
        if !cand.exists() {
            return cand;
        }
    }
    dst.to_path_buf()
}

#[tauri::command]
pub fn mkdir(parent: String, name: String) -> Result<String, String> {
    let target = unique_target(&Path::new(&canon(&parent)).join(name));
    fs::create_dir(&target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub fn new_file(parent: String, name: String) -> Result<String, String> {
    let target = unique_target(&Path::new(&canon(&parent)).join(name));
    fs::File::create(&target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub fn rename_path(path: String, name: String) -> Result<String, String> {
    let src = PathBuf::from(&path);
    let dst = src.parent().ok_or("no parent")?.join(&name);
    if dst.exists() {
        return Err("name already exists".into());
    }
    fs::rename(&src, &dst).map_err(|e| e.to_string())?;
    Ok(dst.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_paths(paths: Vec<String>) -> Result<(), String> {
    let mut errors = Vec::new();
    for p in &paths {
        let pb = PathBuf::from(p);
        let r = if pb.is_dir() { fs::remove_dir_all(pb) } else { fs::remove_file(pb) };
        if let Err(e) = r {
            errors.push(format!("{}: {}", Path::new(p).file_name().map(|s| s.to_string_lossy()).unwrap_or_default(), e));
        }
    }
    if errors.is_empty() { Ok(()) } else { Err(errors.join("; ")) }
}

#[tauri::command]
pub fn recycle_paths(paths: Vec<String>) -> Result<(), String> {
    let mut errors = Vec::new();
    for p in &paths {
        if let Err(e) = trash::delete(p) {
            errors.push(format!("{}: {}", p, e));
        }
    }
    if errors.is_empty() { Ok(()) } else { Err(errors.join("; ")) }
}

#[tauri::command]
pub fn zip_folder(path: String) -> Result<String, String> {
    let src = PathBuf::from(canon(&path));
    if !src.exists() {
        return Err("not found".into());
    }
    let fname = src.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "archive".into());
    let out = src.parent().unwrap_or(Path::new(".")).join(format!("{}.zip", fname));
    if out.exists() {
        return Err("archive name already exists".into());
    }
    let file = fs::File::create(&out).map_err(|e| e.to_string())?;
    let mut zw = zip::ZipWriter::new(file);
    let opts = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    let base = src.clone();
    let walker = if src.is_dir() {
        walkdir::WalkDir::new(&src).into_iter()
    } else {
        walkdir::WalkDir::new(src.parent().unwrap_or(Path::new("."))).max_depth(1).into_iter()
    };
    for e in walker {
        let Ok(e) = e else { continue };
        let p = e.path();
        if p == base && src.is_dir() {
            continue;
        }
        if !p.is_file() {
            continue;
        }
        let rel = p.strip_prefix(src.parent().unwrap_or(Path::new("."))).map_err(|e| e.to_string())?;
        if zw.start_file(rel.to_string_lossy(), opts).is_ok() {
            let mut f = fs::File::open(p).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, &mut zw).map_err(|e| e.to_string())?;
        }
    }
    zw.finish().map_err(|e| e.to_string())?;
    Ok(out.to_string_lossy().to_string())
}

const IMG: &[&str] = &[".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico", ".avif"];
const VID: &[&str] = &[".mp4", ".webm", ".mkv", ".mov"];
const AUD: &[&str] = &[".mp3", ".wav", ".flac", ".m4a", ".ogg", ".opus"];
const TXT: &[&str] = &[".txt", ".md", ".log", ".json", ".py", ".js", ".ts", ".css", ".html", ".xml",
    ".yml", ".yaml", ".bat", ".cmd", ".ps1", ".ini", ".cfg", ".toml", ".csv", ".srt", ".c", ".cpp",
    ".h", ".rs", ".go", ".java", ".sh", ".nfo"];

#[tauri::command]
pub fn preview_file(path: String) -> Result<Preview, String> {
    let p = PathBuf::from(canon(&path));
    let md = fs::metadata(&p).map_err(|e| e.to_string())?;
    let size = md.len();
    let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy().to_lowercase())).unwrap_or_default();
    let kind = if IMG.contains(&ext.as_str()) { "image" }
        else if VID.contains(&ext.as_str()) { "video" }
        else if AUD.contains(&ext.as_str()) { "audio" }
        else if ext == ".pdf" { "pdf" }
        else if TXT.contains(&ext.as_str()) { "text" }
        else { "none" };
    let (text, truncated) = if kind == "text" {
        let cap = 96 * 1024;
        use std::io::Read;
        let mut f = fs::File::open(&p).map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; cap + 1];
        let mut filled = 0usize;
        loop {
            let n = f.read(&mut buf[filled..]).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            filled += n;
            if filled > cap {
                break;
            }
        }
        let trunc = filled > cap;
        (String::from_utf8_lossy(&buf[..filled.min(cap)]).to_string(), trunc)
    } else { (String::new(), false) };
    Ok(Preview { kind: kind.into(), text: (!text.is_empty()).then_some(text), size, truncated })
}

fn copy_dir_all(src: &Path, dst: &Path, jobs: &Mutex<HashMap<String, Job>>, id: &str) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for e in fs::read_dir(src)? {
        let e = e?;
        let from = e.path();
        let to = dst.join(e.file_name());
        if from.is_dir() {
            copy_dir_all(&from, &to, jobs, id)?;
        } else {
            fs::copy(&from, &to)?;
        }
        if let Ok(mut m) = jobs.lock() {
            if let Some(j) = m.get_mut(id) {
                j.message = format!("copying {}", e.file_name().to_string_lossy());
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn copy_move(mode: String, srcs: Vec<String>, dst: String, jobs: tauri::State<Jobs>) -> Result<String, String> {
    if mode != "copy" && mode != "move" {
        return Err("bad mode".into());
    }
    let dst = canon(&dst);
    let id = format!("{:08x}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().subsec_nanos() as u64
        ^ (srcs.len() as u64) << 32);
    {
        let mut m = jobs.0.lock().map_err(|e| e.to_string())?;
        m.insert(id.clone(), Job { status: "running".into(), done: 0, total: srcs.len(), message: "starting…".into(), error: String::new() });
    }
    let jobs_map: Arc<Mutex<HashMap<String, Job>>> = jobs.0.clone();
    let mode2 = mode.clone();
    let id2 = id.clone();
    std::thread::spawn(move || {
        let mut errors = Vec::new();
        for (i, s) in srcs.iter().enumerate() {
            let sp = PathBuf::from(s);
            let name = sp.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            let target = unique_target(&Path::new(&dst).join(&name));
            let r = if mode2 == "copy" {
                if sp.is_dir() {
                    copy_dir_all(&sp, &target, &jobs_map, &id2)
                } else {
                    fs::copy(&sp, &target).map(|_| ())
                }
            } else {
                fs::rename(&sp, &target).or_else(|_| {
                    let r = if sp.is_dir() { copy_dir_all(&sp, &target, &jobs_map, &id2) } else { fs::copy(&sp, &target).map(|_| ()) };
                    if r.is_ok() { let _ = if sp.is_dir() { fs::remove_dir_all(&sp) } else { fs::remove_file(&sp) }; }
                    r
                })
            };
            if let Err(e) = r {
                errors.push(format!("{}: {}", name, e));
            }
            if let Ok(mut m) = jobs_map.lock() {
                if let Some(j) = m.get_mut(&id2) {
                    j.done = i + 1;
                }
            }
        }
        if let Ok(mut m) = jobs_map.lock() {
            if let Some(j) = m.get_mut(&id2) {
                j.status = if errors.is_empty() { "done".into() } else { "error".into() };
                j.error = errors.join("; ");
            }
        }
    });
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canon_normalizes_drive_paths() {
        assert_eq!(canon("C:"), "C:\\");
        assert_eq!(canon("c:"), "c:\\");
        assert_eq!(canon(" C: "), "C:\\");
        assert_eq!(canon("C:\\Users"), "C:\\Users");
        assert_eq!(canon("E:\\projects\\AeroFiles"), "E:\\projects\\AeroFiles");
        assert_eq!(canon("\\\\server\\share"), "\\\\server\\share");
    }

    #[test]
    fn unique_target_suffixes() {
        let dir = std::env::temp_dir().join(format!("aero-test-ut-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("note.txt"), b"x").unwrap();
        let t1 = unique_target(&dir.join("note.txt"));
        assert_eq!(t1.file_name().unwrap().to_string_lossy(), "note (2).txt");
        fs::write(&t1, b"x").unwrap();
        let t2 = unique_target(&dir.join("note.txt"));
        assert_eq!(t2.file_name().unwrap().to_string_lossy(), "note (3).txt");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn entry_of_parses_metadata() {
        let dir = std::env::temp_dir().join(format!("aero-test-eo-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("hello.txt"), b"hello").unwrap();
        let e = entry_of(&dir.join("hello.txt")).unwrap();
        assert_eq!(e.name, "hello.txt");
        assert_eq!(e.ext, ".txt");
        assert!(!e.is_dir);
        assert_eq!(e.size, 5);
        fs::remove_dir_all(&dir).unwrap();
    }
}
