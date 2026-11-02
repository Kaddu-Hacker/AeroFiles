#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod fs_cmd;
mod jobs;
mod search_cleaner;

fn main() {
    tauri::Builder::default()
        .manage(jobs::Jobs::default())
        .invoke_handler(tauri::generate_handler![
            // filesystem
            fs_cmd::list_dir,
            fs_cmd::drives,
            fs_cmd::home_dirs,
            fs_cmd::open_path,
            fs_cmd::mkdir,
            fs_cmd::new_file,
            fs_cmd::rename_path,
            fs_cmd::delete_paths,
            fs_cmd::recycle_paths,
            fs_cmd::zip_folder,
            fs_cmd::preview_file,
            fs_cmd::copy_move,
            jobs::get_job,
            // search + cleaner
            search_cleaner::search_files,
            search_cleaner::list_installed,
            search_cleaner::scan_cleanables,
            search_cleaner::clean_paths,
            search_cleaner::find_orphans,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AeroFiles");
}
