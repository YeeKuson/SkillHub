use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

/// CLI 内核位置（依次尝试）：
/// ① exe 旁 dist/cli.js —— 安装版（MSI resources）与绿色版均为该结构；
/// ② 应用资源目录下的 dist/cli.js —— 同样随包分发；
/// ③ 开发模式专用：环境变量 SKILLHUB_DEV_CLI 显式指定仓库内 dist/cli.js。
/// 发布二进制中不嵌入任何构建机路径（不再使用编译期 CARGO_MANIFEST_DIR）。
fn cli_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let beside = dir.join("dist").join("cli.js");
            if beside.is_file() {
                return Some(beside);
            }
        }
    }
    if let Ok(res) = app.path().resource_dir() {
        let cand = res.join("dist").join("cli.js");
        if cand.is_file() {
            return Some(cand);
        }
    }
    if let Ok(dev) = std::env::var("SKILLHUB_DEV_CLI") {
        let p = PathBuf::from(dev);
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// 返回随包分发的预填 skill 目录（exe 旁 seed/）；不存在返回 None。
/// 安装版与绿色版均由打包脚本把 seed/ 放到 exe 同级。
#[tauri::command]
fn seed_dir() -> Option<String> {
    let dir = std::env::current_exe().ok()?.parent()?.join("seed");
    if dir.is_dir() {
        Some(dir.to_string_lossy().to_string())
    } else {
        None
    }
}

/// 通用 sidecar 命令：把参数透传给 skillhub CLI，返回 stdout；失败时返回完整输出。
/// 前端用 --json 自行解析，Rust 侧不做任何业务逻辑。
#[tauri::command]
fn run_cli(app: tauri::AppHandle, args: Vec<String>) -> Result<String, String> {
    let cli = cli_path(&app).ok_or_else(|| {
        "未找到 CLI 内核（dist/cli.js）：安装版请勿移动安装目录内文件".to_string()
    })?;
    let output = Command::new("node")
        .arg(cli)
        .args(&args)
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW，避免每次调用闪出控制台
        .output()
        .map_err(|e| format!("启动 node 失败: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if output.status.success() {
        Ok(stdout)
    } else {
        Err(if stdout.trim().is_empty() {
            stderr
        } else {
            format!("{stdout}\n{stderr}")
        })
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![run_cli, seed_dir])
        // 关闭按钮 = 隐藏到托盘常驻；真正退出走托盘菜单
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出 SkillHub", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            TrayIconBuilder::with_id("skillhub-tray")
                .icon(app.default_window_icon().expect("缺应用图标").clone())
                .tooltip("SkillHub — 扩展资源中转台")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
