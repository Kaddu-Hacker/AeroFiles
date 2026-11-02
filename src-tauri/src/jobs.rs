//! Background transfer jobs (copy/move) with progress polling.
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Clone, serde::Serialize)]
pub struct Job {
    pub status: String, // running | done | error
    pub done: usize,
    pub total: usize,
    pub message: String,
    pub error: String,
}

#[derive(Default)]
pub struct Jobs(pub Arc<Mutex<HashMap<String, Job>>>);

#[tauri::command]
pub fn get_job(id: String, jobs: tauri::State<Jobs>) -> Result<Job, String> {
    jobs.0
        .lock()
        .map_err(|e| e.to_string())?
        .get(&id)
        .cloned()
        .ok_or_else(|| "job not found".into())
}
