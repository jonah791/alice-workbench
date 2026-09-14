mod bus;
mod dsh;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

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
            "quit" => app.exit(0),
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
            setup_tray(app)?;
            Ok(())
        })
        // 关闭窗口 = 收进托盘（常驻语义）。真正退出走托盘菜单「退出」。
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            bus::bus_snapshot,
            bus::send_message,
            dsh::dsh_status,
            dsh::dsh_recover,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run alice-workbench");
}
