//! SuperCut: the Tauri shell. The web UI in ../src calls the commands below.

mod audio;
mod claude;
mod keep_awake;
mod transcribe;
mod words;

use std::path::Path;
use tauri::Emitter;

#[tauri::command]
async fn claude_status() -> claude::Status {
    tauri::async_runtime::spawn_blocking(|| claude::status(claude::find(&claude::candidates())))
        .await
        .unwrap_or(claude::Status { state: "missing", message: "Couldn't check Claude Code.".into() })
}

/// Emits `transcribe-progress` as (chunks done, chunks total).
#[tauri::command]
async fn transcribe(app: tauri::AppHandle, path: String) -> Result<transcribe::Transcript, String> {
    tauri::async_runtime::spawn_blocking(move || {
        transcribe::transcribe(&transcribe::model_dir(), &audio::bundled_ffmpeg(), Path::new(&path), |done, total| {
            let _ = app.emit("transcribe-progress", (done, total));
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn main() {
    // `SuperCut --transcribe <file>` prints the transcript as JSON and exits:
    // lets `npm run smoke` prove the packaged app (bundled ffmpeg + ONNX Runtime) really works.
    let args: Vec<String> = std::env::args().collect();
    if let [_, flag, file] = args.as_slice() {
        if flag == "--transcribe" {
            let r = transcribe::transcribe(&transcribe::model_dir(), &audio::bundled_ffmpeg(), Path::new(file), |_, _| {});
            match r {
                Ok(t) => println!("{}", serde_json::to_string(&t).unwrap()),
                Err(e) => {
                    eprintln!("{e}");
                    std::process::exit(1);
                }
            }
            return;
        }
    }

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![claude_status, transcribe])
        .run(tauri::generate_context!())
        .expect("error while running SuperCut");
}
