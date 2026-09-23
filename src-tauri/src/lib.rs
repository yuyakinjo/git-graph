mod avatar;
mod commands;
mod github;
mod graph;
mod repo;
mod sh;
mod tidy;

use tauri::{Manager, WindowEvent};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // ウィンドウのサイズ・位置を終了時に保存し、次回起動時に復元する。
        // tauri.conf.json の width/height は初回起動時の既定値として使われる。
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // window-state プラグインがディスクへ書くのはアプリの正常終了時だけで、
            // `tauri dev` の Ctrl+C やウォッチャによる再起動では保存されない。
            // ウィンドウを閉じた時とフォーカスを失った時にも書き出しておく。
            if let Some(window) = app.get_webview_window("main") {
                let handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if matches!(
                        event,
                        WindowEvent::CloseRequested { .. } | WindowEvent::Focused(false)
                    ) {
                        let _ = handle.save_window_state(StateFlags::all());
                    }
                });
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::repo_open,
            commands::graph_load,
            commands::status_load,
            commands::branches_load,
            commands::tags_load,
            commands::stash_load,
            commands::worktree_load,
            commands::commit_detail,
            commands::wip_files,
            commands::stash_files,
            commands::diff_text,
            commands::git_stage,
            commands::git_stage_all,
            commands::git_unstage,
            commands::git_unstage_all,
            commands::git_discard,
            commands::git_commit,
            commands::git_fetch,
            commands::git_pull,
            commands::git_push,
            commands::git_fast_forward,
            commands::git_checkout,
            commands::git_checkout_remote,
            commands::git_create_branch,
            commands::git_delete_branch,
            commands::git_delete_remote_branch,
            commands::git_stash_push,
            commands::git_stash_apply,
            commands::git_stash_drop,
            commands::git_worktree_add,
            commands::git_worktree_remove,
            commands::git_worktree_prune,
            commands::git_tidy_plan,
            commands::git_tidy_apply,
            commands::gh_status,
            commands::gh_owners,
            commands::gh_repo_create,
            commands::gh_pr_list,
            commands::gh_pr_for_branch,
            commands::gh_pr_view,
            commands::gh_pr_create,
            commands::gh_pr_checkout,
            commands::gh_pr_merge,
            commands::gh_pr_template,
            commands::gh_avatars,
            commands::gh_avatars_clear,
            commands::scan_repos,
            commands::home_dir,
            commands::last_commit_message,
            commands::initial_repo,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
