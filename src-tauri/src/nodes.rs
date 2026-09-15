//! 节点的启动与停止（工作台是**启动方**，因此也负责收尸）。
//!
//! ## 为什么收尸必须由启动方做（2026-09-15 实测）
//!
//! Windows 上 `taskkill` 终止 Node 进程时 **不会触发 `process.on('SIGTERM')`**
//! （Node 在 Windows 不支持 SIGTERM 语义）⇒ 「进程自己清理心跳后退出」这条路径**不可依赖**。
//! 实测：进程被杀后 `nodes/<id>.json` 仍在 ⇒ 变成**墓碑**。
//! 总线里已有 13 个墓碑，全是这么攒下来的——所以 stop 必须显式删心跳。
//!
//! ## 安全边界（本文件是唯一会「起进程」的地方，必须最保守）
//!
//! 1. **只起我们自己的脚本**：路径来自配置/默认常量，**不接受任何调用方传入的可执行路径**。
//! 2. **只停我们起过的节点**：sidecar `bus/.workbench-spawned.json` 记录归属；
//!    不在册的 node_id 一律拒绝——绝不停主人的 DSH 主脑或任何别人的进程。
//! 3. **node id 由我们生成**（主机名 + 序号），不直接采用调用方给的字符串建路径。
//! 4. 子进程不弹控制台窗口（`CREATE_NO_WINDOW`），stdout/stderr 落到 `<workdir>/node.log`
//!    （静默失败不可诊断——落盘是排障的第一现场）。

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// 归属账本（sidecar）：谁起的节点、pid 多少、工作目录在哪。
const SPAWNED_FILE: &str = ".workbench-spawned.json";

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SpawnedNode {
    pub node_id: String,
    pub display_name: String,
    pub pid: u32,
    pub at_ms: u64,
    pub workdir: String,
}

fn spawned_path(bus: &Path) -> PathBuf {
    bus.join(SPAWNED_FILE)
}

fn read_spawned(bus: &Path) -> Vec<SpawnedNode> {
    let Ok(text) = fs::read_to_string(spawned_path(bus)) else {
        return Vec::new();
    };
    serde_json::from_str::<Vec<SpawnedNode>>(&text).unwrap_or_default()
}

fn write_spawned(bus: &Path, list: &[SpawnedNode]) -> Result<(), String> {
    let body = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    fs::write(spawned_path(bus), body).map_err(|e| format!("写归属账本失败：{e}"))
}

/// 参考适配器脚本（`dsh-agent-cluster` 的活证明 + 接入模板）。
/// 可用环境变量 `ALICE_WB_REF_NODE` 覆盖（换机器/换仓库位置时不必改代码）。
fn ref_node_script() -> PathBuf {
    if let Ok(v) = std::env::var("ALICE_WB_REF_NODE") {
        if !v.trim().is_empty() {
            return PathBuf::from(v);
        }
    }
    PathBuf::from("E:/alice/self-plugins/dsh-agent-cluster/scripts/ref-node.mjs")
}

/// 节点工作目录根（ref-node 的路径白名单以它为界）。可用 `ALICE_WB_NODE_WORKDIR` 覆盖。
fn node_workdir_root() -> PathBuf {
    if let Ok(v) = std::env::var("ALICE_WB_NODE_WORKDIR") {
        if !v.trim().is_empty() {
            return PathBuf::from(v);
        }
    }
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    Path::new(&home).join(".alice-node-workdir")
}

/// 生成节点 id：`<主机名>-wb-<序号>`（**由我们生成**，不接受调用方传入）。
fn next_node_id(bus: &Path) -> String {
    let host = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "node".to_string());
    let mut n = read_spawned(bus).len();
    loop {
        let id = format!("{host}-wb-{n}");
        let taken = bus.join("nodes").join(format!("{id}.json")).exists()
            || read_spawned(bus).iter().any(|s| s.node_id == id);
        if !taken {
            return id;
        }
        n += 1;
    }
}

/// 工作台起过的节点（前端据此显示「可以停哪些」；是否还活着由总线快照交叉验证）。
#[tauri::command]
pub fn spawned_nodes() -> Vec<SpawnedNode> {
    read_spawned(&crate::bus::bus_dir())
}

/// 起一个参考节点。返回后**已确认心跳出现**才算成功（否则如实报错，不假装成功）。
#[tauri::command]
pub fn spawn_ref_node(display_name: Option<String>) -> Result<SpawnedNode, String> {
    let bus = crate::bus::bus_dir();
    let script = ref_node_script();
    if !script.exists() {
        return Err(format!("参考适配器脚本不存在：{}", script.display()));
    }

    let node_id = next_node_id(&bus);
    let workdir = node_workdir_root().join(&node_id);
    fs::create_dir_all(&workdir).map_err(|e| format!("建工作目录失败：{e}"))?;
    let log = workdir.join("node.log");
    let name = display_name
        .unwrap_or_else(|| "参考节点".to_string())
        .trim()
        .to_string();
    let name = if name.is_empty() { "参考节点".to_string() } else { name };

    let stdout = fs::File::create(&log).map_err(|e| format!("建日志失败：{e}"))?;
    let stderr = stdout.try_clone().map_err(|e| e.to_string())?;

    let mut cmd = std::process::Command::new("node");
    cmd.arg(&script)
        .arg("--workdir")
        .arg(&workdir)
        .arg("--id")
        .arg(&node_id)
        .arg("--displayName")
        .arg(&name)
        .arg("--role")
        .arg("执行节点")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::from(stdout))
        .stderr(std::process::Stdio::from(stderr));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let child = cmd.spawn().map_err(|e| format!("启动失败（node 不在 PATH？）：{e}"))?;
    let pid = child.id();

    let rec = SpawnedNode {
        node_id: node_id.clone(),
        display_name: name.clone(),
        pid,
        at_ms: crate::bus::now_ms(),
        workdir: workdir.to_string_lossy().to_string(),
    };
    let mut list = read_spawned(&bus);
    list.push(rec.clone());
    write_spawned(&bus, &list)?;

    // 验收判据：**心跳文件真的出现**才叫起来了（对照「不落盘 = 不算节点」）。
    let beat = bus.join("nodes").join(format!("{node_id}.json"));
    for _ in 0..30 {
        if beat.exists() {
            return Ok(rec);
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    Err(format!(
        "进程已起（pid={pid}）但 3 秒内没有心跳——日志见 {}",
        log.display()
    ))
}

/// 停一个**工作台自己起的**节点：杀进程 + 删心跳（收尸）+ 记账移除。
#[tauri::command]
pub fn stop_ref_node(node_id: String) -> Result<String, String> {
    let bus = crate::bus::bus_dir();
    let key = node_id.trim().to_string();
    let list = read_spawned(&bus);
    let Some(rec) = list.iter().find(|s| s.node_id == key).cloned() else {
        return Err(format!("拒绝停止 {key}：它不在「工作台启动过」的账本里"));
    };

    let mut msg = String::new();
    // 1) 杀进程（/F：Windows 上 Node 收不到 SIGTERM，优雅退出不可依赖）
    let out = std::process::Command::new("taskkill")
        .args(["/F", "/PID", &rec.pid.to_string()])
        .output();
    match out {
        Ok(o) if o.status.success() => msg.push_str(&format!("已终止进程 {}", rec.pid)),
        Ok(_) => msg.push_str(&format!("进程 {} 已不在（或终止失败）", rec.pid)),
        Err(e) => msg.push_str(&format!("调用 taskkill 失败：{e}")),
    }

    // 2) 收尸：删心跳（这一步是必需的——进程不会自己清）
    let beat = bus.join("nodes").join(format!("{key}.json"));
    if beat.exists() {
        match fs::remove_file(&beat) {
            Ok(()) => msg.push_str("；已清理心跳"),
            Err(e) => msg.push_str(&format!("；心跳清理失败：{e}")),
        }
    } else {
        msg.push_str("；心跳已不在");
    }

    // 3) 记账移除
    let rest: Vec<SpawnedNode> = list.into_iter().filter(|s| s.node_id != key).collect();
    write_spawned(&bus, &rest)?;
    Ok(format!("已停止 {key}（{msg}）"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 归属账本读写往返（不触总线，用临时目录）。
    #[test]
    fn spawned_ledger_roundtrip() {
        let dir = std::env::temp_dir().join(format!("wb-nodes-test-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let rec = SpawnedNode {
            node_id: "host-wb-0".into(),
            display_name: "参考节点".into(),
            pid: 4242,
            at_ms: 1,
            workdir: dir.to_string_lossy().to_string(),
        };
        write_spawned(&dir, &[rec.clone()]).expect("write");
        let back = read_spawned(&dir);
        assert_eq!(back.len(), 1);
        assert_eq!(back[0].node_id, "host-wb-0");
        assert_eq!(back[0].pid, 4242);
        // 账本损坏时读成空表（不 panic）——总线目录是外部世界，形状不可假设
        fs::write(spawned_path(&dir), "{ not json").unwrap();
        assert!(read_spawned(&dir).is_empty());
        let _ = fs::remove_dir_all(&dir);
    }
}
