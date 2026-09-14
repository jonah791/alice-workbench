mod bus;
mod dsh;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // 总线轮询：内容指纹变化即推前端（<1s 判据：实际 150ms 量级）
            bus::start_watch(app.handle().clone());
            Ok(())
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
