mod bus;
mod dsh;
mod nodes;

use serde_json::json;
use std::fs;
use std::path::PathBuf;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Manager, PhysicalPosition, PhysicalSize};

/// 窗口位置/尺寸的持久化文件：`<app_config_dir>/window.json`
/// （Windows 下即 `%APPDATA%\life.alice.workbench\window.json`）
fn window_state_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("window.json"))
}

/// 恢复窗口几何。**必须校验落点仍存在于某块显示器上**——
/// 拔掉外接屏后，旧坐标会落在不存在的区域，窗口就"消失"了（比不恢复糟得多）。
fn restore_window_geometry(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };
    let Some(path) = window_state_path(app) else { return };
    let Ok(text) = fs::read_to_string(&path) else { return };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) else { return };

    let (Some(x), Some(y)) = (v["x"].as_i64(), v["y"].as_i64()) else { return };
    let (x, y) = (x as i32, y as i32);

    let on_some_monitor = app
        .available_monitors()
        .map(|mons| {
            mons.iter().any(|m| {
                let p = m.position();
                let s = m.size();
                x >= p.x
                    && y >= p.y
                    && x < p.x.saturating_add(s.width as i32)
                    && y < p.y.saturating_add(s.height as i32)
            })
        })
        .unwrap_or(true); // 取不到显示器信息时不拦（宁可恢复也不原地不动）
    if !on_some_monitor {
        eprintln!("[alice-workbench] saved window position {x},{y} is off-screen; keeping default");
        return;
    }

    // 单位：`outer_position()` / `inner_size()` 返回**物理**像素（Tauri 契约），
    // 所以恢复必须用 PhysicalPosition 配对；换成 Logical 会多一次缩放换算 → 窗口漂移。
    //
    // 踩坑记录（2026-09-14）：本机 150% 缩放。用 Win32 `SetWindowPos(300,180)` 移动窗口后，
    // 保存得到 `450,270`（比值正好 1.5），我一度据此断定「保存的是逻辑坐标」并改成 Logical——
    // **推错了**。真相：**Win32 那一侧在互操作时按逻辑坐标走**（300 逻辑 × 1.5 = 450 物理），
    // Tauri 侧自始至终是物理。教训：不要从「比值」去倒推单位归属，先确定**是哪一侧的 API**。
    let _ = window.set_position(PhysicalPosition::new(x, y));
    if let (Some(w), Some(h)) = (v["w"].as_u64(), v["h"].as_u64()) {
        let _ = window.set_size(PhysicalSize::new(w as u32, h as u32));
    }
}

/// 保存窗口几何。写失败只吞错——**观测绝不反噬主流程**。
fn save_window_geometry(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };
    let Some(path) = window_state_path(app) else { return };
    let (Ok(pos), Ok(size)) = (window.outer_position(), window.inner_size()) else { return };
    if let Some(dir) = path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    let payload = json!({ "x": pos.x, "y": pos.y, "w": size.width, "h": size.height });
    let _ = fs::write(&path, payload.to_string());
}

/// 托盘：常驻 + 显示/退出（spec §4.3）。
/// 纪律：托盘菜单只放「显示」与「退出」——通知能力留给 §6.3 三道门通过时再用，
/// 不在这里加任何自动提醒（那会绕过「打扰三道门」）。
fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示工作台", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .tooltip("爱丽丝工作台 · 只读总线 · 零模型调用")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "quit" => {
                save_window_geometry(app);
                app.exit(0);
            }
            _ => {}
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // 总线轮询：内容指纹变化即推前端（P1-4 判据 1s，实际 150ms 量级）
            bus::start_watch(app.handle().clone());
            restore_window_geometry(&app.handle());
            setup_tray(app)?;
            Ok(())
        })
        // 关闭窗口 = 收进托盘（常驻语义），并借这个时机记住窗口几何。
        // 真正退出走托盘菜单「退出」（那里也会保存一次）。
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                save_window_geometry(&window.app_handle().clone());
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            bus::bus_snapshot,
            bus::send_message,
            dsh::dsh_status,
            dsh::dsh_recover,
            nodes::spawn_ref_node,
            nodes::stop_ref_node,
            nodes::spawned_nodes,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run alice-workbench");
}
