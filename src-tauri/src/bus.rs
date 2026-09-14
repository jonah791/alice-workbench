//! 总线读取层：只读 `nodes/ mailbox/ state/ cluster-trace.jsonl`，写只写 `mailbox/<node>/*.json`。
//!
//! 设计纪律：
//! - **只读 + 单一写面**（spec §4.3）：应用不修改任何其它总线文件。
//! - **harness 无关**（spec §4.5 修正 1）：只看总线标准产物，不读任何 DSH 私有格式。
//! - **轮询替代 notify**（实施偏差，已回写 spec）：150ms 轮询在 Windows 上比 notify 更可靠、
//!   零第三方依赖，且接口（`start_watch`）保持可替换；延迟判据 1s 有 6x 余量。

use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

/// 心跳超过此时长视为离线（与插件 `DEFAULT_OFFLINE_AFTER_MS` 一致）
pub const OFFLINE_AFTER_MS: u64 = 30_000;
/// 轮询间隔
const POLL_MS: u64 = 150;
/// 行为流保留条数（新→旧）
const TRACE_TAIL: usize = 300;
/// 消息列表保留条数（新→旧）
const MESSAGE_LIMIT: usize = 200;
/// 单文件读取上限（防极端情况下把内存吃满）
const MAX_READ_BYTES: u64 = 8 * 1024 * 1024;

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 总线根：`DSH_CLUSTER_DIR` 环境变量优先，否则 `%USERPROFILE%\.dsh-cluster`
pub fn bus_dir() -> PathBuf {
    if let Ok(v) = std::env::var("DSH_CLUSTER_DIR") {
        if !v.trim().is_empty() {
            return PathBuf::from(v);
        }
    }
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    Path::new(&home).join(".dsh-cluster")
}

fn read_json(path: &Path) -> Option<Value> {
    let md = fs::metadata(path).ok()?;
    if md.len() > MAX_READ_BYTES {
        return None;
    }
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str::<Value>(&text).ok()
}

fn str_field(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(|x| x.as_str()).map(|s| s.to_string())
}

fn u64_field(v: &Value, key: &str) -> Option<u64> {
    v.get(key).and_then(|x| x.as_u64())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeInfo {
    pub id: String,
    pub display_name: String,
    pub online: bool,
    pub age_ms: u64,
    pub role: Option<String>,
    pub profile: Option<String>,
    pub harness: Option<String>,
    pub pid: Option<u64>,
    pub host: Option<String>,
    pub port: Option<u64>,
    pub workspace: Option<String>,
    pub at_ms: Option<u64>,
    pub started_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageInfo {
    pub id: String,
    pub from: String,
    pub to: String,
    pub kind: String,
    pub text: String,
    pub created_at: u64,
    pub reply_to: Option<String>,
    pub delivered: bool,
    pub holder: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionEvent {
    pub at_ms: u64,
    pub phase: String,
    pub node: Option<String>,
    pub id: Option<String>,
    pub kind: Option<String>,
    pub to: Option<String>,
    pub why: Option<String>,
    pub chars: Option<u64>,
    pub raw: String,
}

/// 任务台账视图（`tasks/<taskId>.json`，语义见 dsh-agent-cluster `docs/semantic.md` §5.5）。
///
/// **诚实边界**：工作台只读台账，写者只有主脑（不变量 I8）⇒ 这里的 `status` 天然滞后于
/// 节点实况（最多一个主脑处理周期）。实时进度看 `logs/actions/`（行为流）。UI **不得假装**
/// 台账是实时的。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInfo {
    pub task_id: String,
    /// 短号（`t-mu1gvjpy-d6sp9j` → `d6sp9j`），列表里显示用
    pub short_id: Option<String>,
    /// 主人的原话摘录（不转述——契约要求可追溯）
    pub intent_ref: String,
    /// 验收判据（I9：无判据不派发；列表里为空即是主脑侧工具的问题）
    pub acceptance: String,
    pub grade: Option<String>,
    pub status: String,
    pub assignee: Option<String>,
    pub created_at: u64,
    pub last_progress_at: u64,
    pub evidence_count: usize,
    /// 未验证项条数——**必须显眼**（诚实优先于好看）
    pub unverified_count: usize,
    pub summary: Option<String>,
    pub verdict_pass: Option<bool>,
    pub verdict_method: Option<String>,
}

/// 结构性动作的分阶段事件（`logs/actions/<actionId>.jsonl`，语义见 dsh-agent-cluster
/// `docs/semantic.md` §5.7）。
///
/// 这是「**节点正在做什么**」的数据源，与 `TaskInfo`（账本状态，滞后一个主脑周期）互补。
/// 契约要求分阶段落盘（不变量 I10），所以能看到 `start → stage×N → done|failed` 的时间线；
/// 但**思考不落盘**——只显示「在做什么」，不假装显示「在想什么」（spec §5.2 的诚实边界）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StepEvent {
    pub at_ms: u64,
    pub action_id: String,
    pub node: Option<String>,
    pub stage: String,
    pub step: u64,
    pub total: u64,
    pub human_text: String,
    /// 从同一 `actionId` 的任意一行提取（`detail.taskId`）后**回填给组内每一条**——
    /// 因为 taskId 只出现在 `start`/`done` 行，不回填则 `stage` 行挂不上任务，
    /// 前端就无法「点开任务看它怎么干的」。
    pub task_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub bus_dir: String,
    pub bus_ok: bool,
    pub scanned_at_ms: u64,
    pub online_count: usize,
    pub nodes: Vec<NodeInfo>,
    pub messages: Vec<MessageInfo>,
    pub actions: Vec<ActionEvent>,
    pub tasks: Vec<TaskInfo>,
    pub steps: Vec<StepEvent>,
    pub fingerprint: String,
}

fn scan_nodes(dir: &Path) -> Vec<NodeInfo> {
    let now = now_ms();
    let mut out = Vec::new();
    let rd = match fs::read_dir(dir.join("nodes")) {
        Ok(rd) => rd,
        Err(_) => return out,
    };
    for entry in rd.flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let v = match read_json(&p) {
            Some(v) => v,
            None => continue,
        };
        let id = match str_field(&v, "nodeId") {
            Some(s) if !s.is_empty() => s,
            _ => continue,
        };
        let at_ms = u64_field(&v, "atMs");
        let age_ms = at_ms.map(|t| now.saturating_sub(t)).unwrap_or(u64::MAX);
        // displayName 是 spec §3.4 的扩展字段，插件尚未上报 → 回退到 nodeId 的短名
        let display_name = str_field(&v, "displayName").unwrap_or_else(|| short_name(&id));
        out.push(NodeInfo {
            id,
            display_name,
            online: age_ms < OFFLINE_AFTER_MS,
            age_ms,
            role: str_field(&v, "role"),
            profile: str_field(&v, "profile"),
            harness: str_field(&v, "harness"),
            pid: u64_field(&v, "pid"),
            host: str_field(&v, "hostname"),
            port: u64_field(&v, "port").filter(|p| *p > 0),
            workspace: str_field(&v, "workspace"),
            at_ms,
            started_at: u64_field(&v, "startedAt"),
        });
    }
    // 在线优先，其次越新越靠前
    out.sort_by(|a, b| {
        b.online
            .cmp(&a.online)
            .then(b.at_ms.unwrap_or(0).cmp(&a.at_ms.unwrap_or(0)))
    });
    out
}

/// `DEMO-HOST-web-0-31116` → `web-0`（人话名回退：主机名太吵，pid 是噪声）
fn short_name(id: &str) -> String {
    let parts: Vec<&str> = id.split('-').collect();
    if parts.len() >= 4 && parts[2] == "web" {
        format!("web-{}", parts[3])
    } else {
        id.to_string()
    }
}

fn scan_messages(dir: &Path) -> Vec<MessageInfo> {
    let mut out: Vec<MessageInfo> = Vec::new();
    let mb = dir.join("mailbox");
    let boxes = match fs::read_dir(&mb) {
        Ok(rd) => rd,
        Err(_) => return out,
    };
    for holder in boxes.flatten() {
        let hp = holder.path();
        if !hp.is_dir() {
            continue;
        }
        let holder_name = holder.file_name().to_string_lossy().to_string();
        for (sub, delivered) in [("", false), ("done", true)] {
            let d = if sub.is_empty() {
                hp.clone()
            } else {
                hp.join(sub)
            };
            let rd = match fs::read_dir(&d) {
                Ok(rd) => rd,
                Err(_) => continue,
            };
            for f in rd.flatten() {
                let p = f.path();
                if p.extension().and_then(|e| e.to_str()) != Some("json") {
                    continue;
                }
                let v = match read_json(&p) {
                    Some(v) => v,
                    None => continue,
                };
                let text = str_field(&v, "text").unwrap_or_default();
                out.push(MessageInfo {
                    id: str_field(&v, "id").unwrap_or_else(|| {
                        p.file_stem()
                            .map(|s| s.to_string_lossy().to_string())
                            .unwrap_or_default()
                    }),
                    from: str_field(&v, "from").unwrap_or_else(|| "?".into()),
                    to: str_field(&v, "to").unwrap_or_else(|| holder_name.clone()),
                    kind: str_field(&v, "kind").unwrap_or_else(|| "chat".into()),
                    text,
                    created_at: u64_field(&v, "createdAt").unwrap_or(0),
                    reply_to: str_field(&v, "replyTo"),
                    delivered,
                    holder: holder_name.clone(),
                });
            }
        }
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    out.truncate(MESSAGE_LIMIT);
    out
}

fn arr_len_of(v: &Value, key: &str) -> usize {
    v.get(key)
        .and_then(|x| x.as_array())
        .map(|a| a.len())
        .unwrap_or(0)
}

/// 未收尾的排前面：running/dispatched/drafted 优先；done 沉底。
/// 理由：这是一个「看板」，主人最该先看到的是**还没落定的事**。
fn status_rank(s: &str) -> u8 {
    match s {
        "running" => 0,
        "dispatched" => 1,
        "drafted" => 2,
        "returned" | "verifying" => 3,
        "failed" => 4,
        "done" => 5,
        _ => 6,
    }
}

/// 任务台账扫描（只读）。坏文件跳过——与 nodes/messages 同纪律：一条坏数据不得坏掉整屏。
fn scan_tasks(dir: &Path) -> Vec<TaskInfo> {
    let mut out = Vec::new();
    let rd = match fs::read_dir(dir.join("tasks")) {
        Ok(rd) => rd,
        Err(_) => return out, // 目录不存在 = 还没派过任务，不是错误
    };
    for entry in rd.flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let v = match read_json(&p) {
            Some(v) => v,
            None => continue,
        };
        let task_id = match str_field(&v, "taskId") {
            Some(s) if !s.is_empty() => s,
            _ => continue, // 没有 taskId 的 JSON 不是台账
        };
        let result = v.get("result");
        let verdict = v.get("verdict");
        out.push(TaskInfo {
            short_id: task_id.rsplit('-').next().map(|s| s.to_string()),
            task_id,
            intent_ref: str_field(&v, "intentRef").unwrap_or_default(),
            acceptance: str_field(&v, "acceptance").unwrap_or_default(),
            grade: str_field(&v, "grade"),
            status: str_field(&v, "status").unwrap_or_else(|| "unknown".into()),
            assignee: str_field(&v, "assignee"),
            created_at: u64_field(&v, "createdAt").unwrap_or(0),
            last_progress_at: u64_field(&v, "lastProgressAt").unwrap_or(0),
            evidence_count: result.map(|r| arr_len_of(r, "evidence")).unwrap_or(0),
            unverified_count: result.map(|r| arr_len_of(r, "unverified")).unwrap_or(0),
            summary: result.and_then(|r| str_field(r, "summary")),
            verdict_pass: verdict
                .and_then(|x| x.get("pass"))
                .and_then(|b| b.as_bool()),
            verdict_method: verdict.and_then(|x| str_field(x, "method")),
        });
    }
    out.sort_by(|a, b| {
        status_rank(&a.status)
            .cmp(&status_rank(&b.status))
            .then(b.created_at.cmp(&a.created_at))
    });
    out
}

/// 行为事件的规模上限：历史越长越不该全量扫。
const ACTION_FILES: usize = 24;
const ACTION_LINES_PER_FILE: usize = 400;
const STEP_LIMIT: usize = 600;

/// 行为事件扫描（`logs/actions/<actionId>.jsonl`，一行一阶段）。
/// 与其它扫描同纪律：坏行跳过、目录不存在不算错。
fn scan_actions(dir: &Path) -> Vec<StepEvent> {
    let root = dir.join("logs").join("actions");
    let rd = match fs::read_dir(&root) {
        Ok(rd) => rd,
        Err(_) => return Vec::new(), // 还没节点写过行为事件，不是错误
    };

    // 只取最近修改的若干 action 文件
    let mut files: Vec<(u64, PathBuf)> = rd
        .flatten()
        .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("jsonl"))
        .filter_map(|e| {
            let t = e
                .metadata()
                .ok()?
                .modified()
                .ok()?
                .duration_since(UNIX_EPOCH)
                .ok()?
                .as_millis() as u64;
            Some((t, e.path()))
        })
        .collect();
    files.sort_by(|a, b| b.0.cmp(&a.0));
    files.truncate(ACTION_FILES);

    let mut out: Vec<StepEvent> = Vec::new();
    for (_, p) in files {
        let text = match fs::read_to_string(&p) {
            Ok(t) => t,
            Err(_) => continue,
        };
        let action_id = p
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();

        let all: Vec<&str> = text.lines().collect();
        let start = all.len().saturating_sub(ACTION_LINES_PER_FILE);
        let mut group: Vec<StepEvent> = Vec::new();
        let mut task_id: Option<String> = None;

        for line in &all[start..] {
            let v: Value = match serde_json::from_str(line) {
                Ok(v) => v,
                Err(_) => continue, // 单行坏数据不得坏掉整组
            };
            if task_id.is_none() {
                task_id = v.get("detail").and_then(|d| str_field(d, "taskId"));
            }
            group.push(StepEvent {
                at_ms: u64_field(&v, "atMs").unwrap_or(0),
                action_id: action_id.clone(),
                node: str_field(&v, "node"),
                stage: str_field(&v, "stage").unwrap_or_else(|| "unknown".into()),
                step: u64_field(&v, "step").unwrap_or(0),
                total: u64_field(&v, "total").unwrap_or(0),
                human_text: str_field(&v, "humanText").unwrap_or_default(),
                task_id: None,
            });
        }
        // 整组解析完再回填 taskId（它只在 start/done 行出现）
        for mut e in group {
            e.task_id = task_id.clone();
            out.push(e);
        }
    }

    out.sort_by(|a, b| a.at_ms.cmp(&b.at_ms));
    if out.len() > STEP_LIMIT {
        out.drain(0..out.len() - STEP_LIMIT); // 只留最新的一段
    }
    out
}

fn read_trace(dir: &Path) -> Vec<ActionEvent> {
    let p = dir.join("cluster-trace.jsonl");
    let md = match fs::metadata(&p) {
        Ok(md) => md,
        Err(_) => return Vec::new(),
    };
    if md.len() > MAX_READ_BYTES {
        return Vec::new();
    }
    let text = match fs::read_to_string(&p) {
        Ok(t) => t,
        Err(_) => return Vec::new(),
    };
    let mut out: Vec<ActionEvent> = text
        .lines()
        .rev()
        .take(TRACE_TAIL)
        .filter_map(|line| {
            let v: Value = serde_json::from_str(line).ok()?;
            Some(ActionEvent {
                at_ms: u64_field(&v, "atMs").unwrap_or(0),
                phase: str_field(&v, "phase").unwrap_or_else(|| "unknown".into()),
                node: str_field(&v, "node"),
                id: str_field(&v, "id"),
                kind: str_field(&v, "kind"),
                to: str_field(&v, "to"),
                why: str_field(&v, "why"),
                chars: u64_field(&v, "chars"),
                raw: line.to_string(),
            })
        })
        .collect();
    out.reverse(); // 新→旧 转回 旧→新；前端按需反转
    out
}

fn fingerprint(dir: &Path) -> String {
    let mut acc: u64 = 0;
    let mut count: u64 = 0;
    let mut bump = |p: &Path| {
        if let Ok(md) = fs::metadata(p) {
            count += 1;
            acc = acc.wrapping_add(md.len());
            if let Ok(t) = md.modified() {
                if let Ok(d) = t.duration_since(UNIX_EPOCH) {
                    acc = acc.wrapping_add(d.as_millis() as u64);
                }
            }
        }
    };
    for sub in ["nodes", "state"] {
        if let Ok(rd) = fs::read_dir(dir.join(sub)) {
            for e in rd.flatten() {
                bump(&e.path());
            }
        }
    }
    if let Ok(rd) = fs::read_dir(dir.join("mailbox")) {
        for e in rd.flatten() {
            if e.path().is_dir() {
                if let Ok(inner) = fs::read_dir(e.path()) {
                    for f in inner.flatten() {
                        bump(&f.path());
                    }
                }
            }
        }
    }
    // tasks/ 纳入指纹：台账变了前端必须收到推送（否则任务列表停在旧状态）
    if let Ok(rd) = fs::read_dir(dir.join("tasks")) {
        for e in rd.flatten() {
            bump(&e.path());
        }
    }
    // logs/actions/ 同理：节点干活时界面必须动起来（否则「正在做什么」是死的）
    if let Ok(rd) = fs::read_dir(dir.join("logs").join("actions")) {
        for e in rd.flatten() {
            bump(&e.path());
        }
    }
    bump(&dir.join("cluster-trace.jsonl"));
    format!("{count}:{acc}")
}

pub fn snapshot(dir: &Path) -> Snapshot {
    let nodes = scan_nodes(dir);
    let online_count = nodes.iter().filter(|n| n.online).count();
    Snapshot {
        bus_dir: dir.to_string_lossy().to_string(),
        bus_ok: dir.is_dir(),
        scanned_at_ms: now_ms(),
        online_count,
        nodes,
        messages: scan_messages(dir),
        actions: read_trace(dir),
        tasks: scan_tasks(dir),
        steps: scan_actions(dir),
        fingerprint: fingerprint(dir),
    }
}

#[tauri::command]
pub fn bus_snapshot() -> Snapshot {
    snapshot(&bus_dir())
}

/// 写一条消息到 `mailbox/<to>/<id>.json`（应用唯一写面）。
/// `from` 用 `owner`：工作台代表主人发话，而不是冒充某个智能体节点。
#[tauri::command]
pub fn send_message(to: String, text: String, kind: Option<String>) -> Result<String, String> {
    let to = to.trim().to_string();
    let text = text.trim().to_string();
    if to.is_empty() {
        return Err("目标节点为空".into());
    }
    if text.is_empty() {
        return Err("消息内容为空".into());
    }
    if to.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|']) {
        return Err("目标节点名不合法".into());
    }
    let dir = bus_dir();
    let inbox = dir.join("mailbox").join(&to);
    fs::create_dir_all(&inbox).map_err(|e| format!("创建收件箱失败：{e}"))?;
    let now = now_ms();
    let id = format!("m-{now:x}-wb");
    let payload = serde_json::json!({
        "v": 1,
        "id": id,
        "from": "owner",
        "to": to,
        "kind": kind.unwrap_or_else(|| "chat".into()),
        "text": text,
        "createdAt": now,
        "ttlMs": 86_400_000u64,
    });
    let file = inbox.join(format!("{id}.json"));
    let body = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
    fs::write(&file, body).map_err(|e| format!("写入消息失败：{e}"))?;
    Ok(id)
}

/// 后台轮询：指纹变化 → 推 `bus-changed`。回调全程兜底（§5.24：逃逸异常会杀宿主）。
pub fn start_watch(app: AppHandle) {
    std::thread::spawn(move || {
        let dir = bus_dir();
        let mut last = String::new();
        loop {
            std::thread::sleep(Duration::from_millis(POLL_MS));
            let result = std::panic::catch_unwind(|| snapshot(&dir));
            match result {
                Ok(snap) => {
                    if snap.fingerprint != last {
                        last = snap.fingerprint.clone();
                        if let Err(e) = app.emit("bus-changed", &snap) {
                            eprintln!("[alice-workbench] emit failed: {e}");
                        }
                    }
                }
                Err(_) => {
                    eprintln!("[alice-workbench] snapshot panicked; continuing");
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(tag: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("aw-test-{tag}-{}", now_ms()));
        fs::create_dir_all(&p).expect("create tmpdir");
        p
    }

    #[test]
    fn short_name_maps_dsh_node() {
        assert_eq!(short_name("DEMO-HOST-web-0-31116"), "web-0");
        assert_eq!(short_name("sim-node-a"), "sim-node-a");
        assert_eq!(short_name("DEMO-HOST-web-0"), "web-0");
    }

    #[test]
    fn scan_nodes_on_empty_dir_is_safe() {
        let d = tmpdir("empty");
        assert!(scan_nodes(&d).is_empty());
    }

    #[test]
    fn scan_nodes_reads_heartbeat_and_marks_online() {
        let d = tmpdir("hb");
        fs::create_dir_all(d.join("nodes")).unwrap();
        let hb = serde_json::json!({
            "v": 1, "nodeId": "DEMO-HOST-web-0-1", "role": "主脑",
            "pid": 42, "port": 0, "atMs": now_ms(), "workspace": "X:\\ws"
        });
        fs::write(d.join("nodes").join("a.json"), hb.to_string()).unwrap();
        let nodes = scan_nodes(&d);
        assert_eq!(nodes.len(), 1);
        assert!(nodes[0].online);
        assert_eq!(nodes[0].pid, Some(42));
        assert_eq!(nodes[0].display_name, "web-0");
        // port=0 视为「未上报」而非「端口 0」
        assert_eq!(nodes[0].port, None);
        assert_eq!(nodes[0].workspace.as_deref(), Some("X:\\ws"));
    }

    #[test]
    fn scan_nodes_marks_stale_heartbeat_offline() {
        let d = tmpdir("stale");
        fs::create_dir_all(d.join("nodes")).unwrap();
        let hb = serde_json::json!({"nodeId": "n2", "atMs": now_ms().saturating_sub(60_000)});
        fs::write(d.join("nodes").join("b.json"), hb.to_string()).unwrap();
        let nodes = scan_nodes(&d);
        assert_eq!(nodes.len(), 1);
        assert!(!nodes[0].online);
    }

    #[test]
    fn scan_nodes_skips_corrupt_and_nameless() {
        let d = tmpdir("bad");
        fs::create_dir_all(d.join("nodes")).unwrap();
        fs::write(d.join("nodes").join("broken.json"), "{ not json").unwrap();
        fs::write(d.join("nodes").join("nameless.json"), "{\"v\":1}").unwrap();
        assert!(scan_nodes(&d).is_empty());
    }

    #[test]
    fn read_trace_skips_corrupt_lines_and_keeps_order() {
        let d = tmpdir("trace");
        fs::write(
            d.join("cluster-trace.jsonl"),
            "{\"atMs\":1,\"phase\":\"sent\",\"to\":\"x\"}\nnot-json\n{\"atMs\":2,\"phase\":\"delivered\"}\n",
        )
        .unwrap();
        let ev = read_trace(&d);
        assert_eq!(ev.len(), 2, "坏行必须被跳过而不是丢弃整文件");
        assert_eq!(ev[0].phase, "sent");
        assert_eq!(ev[1].phase, "delivered");
        assert_eq!(ev[0].to.as_deref(), Some("x"));
    }

    #[test]
    fn fingerprint_reacts_to_bus_changes() {
        let d = tmpdir("fp");
        let before = fingerprint(&d);
        fs::create_dir_all(d.join("nodes")).unwrap();
        fs::write(d.join("nodes").join("x.json"), "{}").unwrap();
        let after = fingerprint(&d);
        assert_ne!(before, after, "新增心跳必须改变指纹（否则前端不会收到推送）");
    }

    #[test]
    fn scan_tasks_on_empty_dir_is_safe() {
        let d = tmpdir("tasks-empty");
        assert!(scan_tasks(&d).is_empty());
    }

    #[test]
    fn scan_tasks_reads_ledger_and_ranks_unfinished_first() {
        let d = tmpdir("tasks");
        fs::create_dir_all(d.join("tasks")).unwrap();
        let done = serde_json::json!({
            "v": 1, "taskId": "t-aaa-111111", "intentRef": "已完成的事",
            "acceptance": "它确实完成了", "status": "done", "assignee": "w1",
            "createdAt": 2000, "lastProgressAt": 2000,
            "result": { "status": "ok", "summary": "搞定", "evidence": [{}, {}], "unverified": [] },
            "verdict": { "by": "primary", "pass": true, "method": "复现证据" }
        });
        let running = serde_json::json!({
            "v": 1, "taskId": "t-bbb-222222", "intentRef": "正在做的事",
            "acceptance": "判据在此", "status": "running", "assignee": "w2",
            "createdAt": 1000, "lastProgressAt": 1500,
            "result": { "evidence": [{}], "unverified": ["第二段"] }
        });
        fs::write(d.join("tasks").join("a.json"), done.to_string()).unwrap();
        fs::write(d.join("tasks").join("b.json"), running.to_string()).unwrap();
        let t = scan_tasks(&d);
        assert_eq!(t.len(), 2);
        // 未收尾的排前面（更该被看见），即便它更旧
        assert_eq!(t[0].status, "running");
        assert_eq!(t[0].short_id.as_deref(), Some("222222"));
        assert_eq!(t[0].evidence_count, 1);
        assert_eq!(t[0].unverified_count, 1);
        assert_eq!(t[0].verdict_pass, None);
        assert_eq!(t[1].status, "done");
        assert_eq!(t[1].evidence_count, 2);
        assert_eq!(t[1].verdict_pass, Some(true));
        assert_eq!(t[1].verdict_method.as_deref(), Some("复现证据"));
    }

    #[test]
    fn scan_tasks_skips_corrupt_and_nameless() {
        let d = tmpdir("tasks-bad");
        fs::create_dir_all(d.join("tasks")).unwrap();
        fs::write(d.join("tasks").join("broken.json"), "{ not json").unwrap();
        fs::write(d.join("tasks").join("nameless.json"), "{\"v\":1}").unwrap();
        assert!(scan_tasks(&d).is_empty());
    }

    #[test]
    fn fingerprint_reacts_to_task_changes() {
        let d = tmpdir("fp-tasks");
        let before = fingerprint(&d);
        fs::create_dir_all(d.join("tasks")).unwrap();
        fs::write(d.join("tasks").join("t.json"), "{}").unwrap();
        let after = fingerprint(&d);
        assert_ne!(before, after, "台账变化必须改变指纹（否则任务列表不刷新）");
    }

    #[test]
    fn scan_actions_on_empty_dir_is_safe() {
        let d = tmpdir("steps-empty");
        assert!(scan_actions(&d).is_empty());
    }

    #[test]
    fn scan_actions_backfills_task_id_to_every_row() {
        let d = tmpdir("steps");
        fs::create_dir_all(d.join("logs").join("actions")).unwrap();
        let lines = [
            r#"{"atMs":10,"actionId":"a-1","node":"w1","stage":"start","step":0,"total":2,"humanText":"收到任务 t-x-1，拆解为 2 步","detail":{"taskId":"t-x-1","plan":[]}}"#,
            r#"{"atMs":11,"actionId":"a-1","node":"w1","stage":"stage","step":1,"total":2,"humanText":"第 1/2 步：建目录","detail":{"op":"fs.mkdir","path":"docs"}}"#,
            r#"{"atMs":12,"actionId":"a-1","node":"w1","stage":"stage","step":2,"total":2,"humanText":"第 2/2 步：写文件","detail":{"op":"fs.write","path":"docs/a.md"}}"#,
            r#"{"atMs":13,"actionId":"a-1","node":"w1","stage":"done","step":2,"total":2,"humanText":"任务完成","detail":{"taskId":"t-x-1","evidenceCount":2}}"#,
        ];
        fs::write(
            d.join("logs").join("actions").join("a-1.jsonl"),
            lines.join("\n"),
        )
        .unwrap();
        let s = scan_actions(&d);
        assert_eq!(s.len(), 4);
        assert_eq!(s[0].stage, "start");
        assert_eq!(s[3].stage, "done");
        // 回填：连没有 taskId 的 stage 行也要挂上任务（否则前端没法按任务过滤）
        assert!(
            s.iter().all(|e| e.task_id.as_deref() == Some("t-x-1")),
            "stage 行必须被回填 taskId"
        );
        assert_eq!(s[2].step, 2);
        assert_eq!(s[2].total, 2);
        assert_eq!(s[0].action_id, "a-1");
    }

    #[test]
    fn scan_actions_skips_corrupt_lines_and_keeps_order() {
        let d = tmpdir("steps-bad");
        fs::create_dir_all(d.join("logs").join("actions")).unwrap();
        fs::write(
            d.join("logs").join("actions").join("a-2.jsonl"),
            "{\"atMs\":5,\"stage\":\"start\",\"humanText\":\"x\"}\nnot-json\n{\"atMs\":9,\"stage\":\"done\"}\n",
        )
        .unwrap();
        let s = scan_actions(&d);
        assert_eq!(s.len(), 2, "坏行跳过而不是丢整组");
        assert_eq!(s[0].at_ms, 5);
        assert_eq!(s[1].at_ms, 9);
        assert!(s[0].task_id.is_none(), "没有 detail.taskId 时不得瞎填");
    }

    #[test]
    fn fingerprint_reacts_to_action_changes() {
        let d = tmpdir("fp-actions");
        let before = fingerprint(&d);
        fs::create_dir_all(d.join("logs").join("actions")).unwrap();
        fs::write(d.join("logs").join("actions").join("a-3.jsonl"), "{}\n").unwrap();
        assert_ne!(before, fingerprint(&d), "节点干活时界面必须收到推送");
    }

    #[test]
    fn snapshot_reports_missing_bus() {
        let d = std::env::temp_dir().join(format!("aw-absent-{}", now_ms()));
        let s = snapshot(&d);
        assert!(!s.bus_ok);
        assert_eq!(s.online_count, 0);
        assert!(s.nodes.is_empty());
    }
}
