//! DSH 运行时生命周期：探测 + 一键恢复。
//!
//! 可迁移性纪律（spec §4.5 修正 3）：`init-dsh.ps1` 是 **DSH 运行时管理器**（可插拔件），
//! 应用只依赖「运行时管理」这一接口——workspace 从总线心跳取，脚本路径由 workspace 推导，
//! 应用本身**零硬编码路径**（也避免把本机路径写进公开仓库）。

use crate::bus;
use serde::Serialize;
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// 心跳未上报端口时的回退端口（DSH web 默认）
const DEFAULT_PORT: u16 = 3080;
const PROBE_TIMEOUT: Duration = Duration::from_millis(400);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DshStatus {
    pub web_online: bool,
    pub port: u16,
    pub url: String,
    pub workspace: Option<String>,
    pub init_script: Option<String>,
    pub init_script_exists: bool,
    pub online_nodes: usize,
    pub detail: String,
}

/// 从总线心跳里推导 workspace（零硬编码）：优先在线节点，其次任意带 workspace 的节点。
fn workspace_from_bus() -> (Option<String>, Option<u64>) {
    let snap = bus::snapshot(&bus::bus_dir());
    let mut fallback: Option<String> = None;
    for n in &snap.nodes {
        if let Some(ws) = &n.workspace {
            if n.online && n.port.is_some() {
                return (Some(ws.clone()), n.port);
            }
            if n.online {
                return (Some(ws.clone()), None);
            }
            if fallback.is_none() {
                fallback = Some(ws.clone());
            }
        }
    }
    (fallback, None)
}

fn probe(port: u16) -> bool {
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    TcpStream::connect_timeout(&addr, PROBE_TIMEOUT).is_ok()
}

fn init_script_for(ws: &str) -> PathBuf {
    Path::new(ws).join(".dsh").join("init-dsh.ps1")
}

#[tauri::command]
pub fn dsh_status() -> DshStatus {
    let (ws, bus_port) = workspace_from_bus();
    let port = bus_port.unwrap_or(DEFAULT_PORT as u64) as u16;
    let online = probe(port);
    let script = ws.as_ref().map(|w| init_script_for(w));
    let exists = script.as_ref().map(|p| p.is_file()).unwrap_or(false);
    let online_nodes = bus::snapshot(&bus::bus_dir()).online_count;

    let detail = if online {
        format!("web 在线（127.0.0.1:{port}）")
    } else if ws.is_none() {
        "总线无心跳：DSH 可能从未启动".to_string()
    } else {
        format!("web 未响应 127.0.0.1:{port}")
    };

    DshStatus {
        web_online: online,
        port,
        url: format!("http://127.0.0.1:{port}"),
        workspace: ws,
        init_script: script.map(|p| p.to_string_lossy().to_string()),
        init_script_exists: exists,
        online_nodes,
        detail,
    }
}

/// 一键恢复：调 DSH 运行时管理器（`<workspace>/.dsh/init-dsh.ps1`），不等待完成。
/// 恢复是否成功由「总线出现新心跳 / 端口可连」判定，不靠脚本退出码——
/// 复活的 DSH 会自己发心跳，前端的实时行为流随即反映出来（P1-3）。
#[tauri::command]
pub fn dsh_recover() -> Result<String, String> {
    let (ws, _) = workspace_from_bus();
    let ws = ws.ok_or_else(|| "无法从总线推断 workspace（无任何心跳）——请先手动启动一次 DSH".to_string())?;
    let script = init_script_for(&ws);
    if !script.is_file() {
        return Err(format!("未找到运行时管理器：{}", script.display()));
    }

    let mut cmd = Command::new("powershell.exe");
    cmd.args([
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        &script.to_string_lossy(),
    ])
    .current_dir(&ws);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let child = cmd.spawn().map_err(|e| format!("启动失败：{e}"))?;
    Ok(format!(
        "已调起运行时管理器（pid {}）：{}",
        child.id(),
        script.display()
    ))
}
