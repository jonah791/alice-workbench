//! `.workbench/` 数据面：委托（主人的最初输入）与产物（爱丽丝的交付）。
//!
//! v0.5「委托台」的全部后端面。旧 `bus.rs` 的总线扫描依宪法 ①（内部一律不可见）已不做。
//! 契约主副本：`docs/semantic.md` §5.3；不变量 I1–I7 见同文档 §4。

use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

/// 轮询节奏（三档，隐藏优先于焦点）。与旧实现同源 —— C 表不动它。
const POLL_MS: u64 = 150;
const POLL_MS_UNFOCUSED: u64 = 700;
const POLL_MS_IDLE: u64 = 2500;

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 工作台数据面根：默认 `%USERPROFILE%\.workbench`，`ALICE_WB_DIR` 可覆盖（测试与多实例）。
pub fn data_dir() -> PathBuf {
    if let Ok(p) = std::env::var("ALICE_WB_DIR") {
        if !p.trim().is_empty() {
            return PathBuf::from(p);
        }
    }
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_default();
    PathBuf::from(home).join(".workbench")
}

/// ⚠ 这四个结构体**必须**带 `rename_all = "camelCase"`：它们是发往前端的 IPC 载荷，
/// 而前端契约 `src/types.ts` 用的是 camelCase（`atMs` / `whyOnlyYou` / `dataDir` / `dataOk` /
/// `scannedAtMs`）。少了它，单词字段（`id` / `text` / `status`）照常工作，**camelCase 字段静默变
/// `undefined`** —— 症状是界面上 `NaN 天前`、以及 `dataOk` 永远为假导致「数据目录不可用」提示失灵。
/// 读盘路径不受影响（那里按字符串键取 `"atMs"` 等，见 `u64_field`）。回归判据见 `tests` 的
/// `ipc_payload_uses_camel_case`。
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    pub name: String,
    /// 呈现类型：`image` / `video` / `code` / `page` / `file`（未知一律降级为 `file`，I4）。
    pub kind: String,
    pub path: String,
    pub bytes: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RequestInfo {
    pub what: String,
    pub why_only_you: String,
    pub at_ms: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Commission {
    pub id: String,
    pub text: String,
    pub attachments: Vec<String>,
    /// `doing` / `delivered` / `needs-you` —— 只有这三种（§4）。
    pub status: String,
    pub at_ms: u64,
    /// 产物随委托一起返回：产物不会多到需要分页，前端少一跳（v0.5 起取消 `read_artifacts`）。
    pub artifacts: Vec<Artifact>,
    /// 仅 `status == "needs-you"` 时存在；它是**一次打扰**，不是状态（I3）。
    pub request: Option<RequestInfo>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub data_dir: String,
    pub data_ok: bool,
    pub scanned_at_ms: u64,
    pub commissions: Vec<Commission>,
    pub fingerprint: String,
}

fn read_json(path: &Path) -> Option<Value> {
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str::<Value>(&raw).ok()
}

fn str_field(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(|x| x.as_str()).map(|s| s.to_string())
}

fn u64_field(v: &Value, key: &str) -> Option<u64> {
    v.get(key).and_then(|x| x.as_u64())
}

/// 扩展名 → 呈现类型。未知一律 `file`（I4：不预设产物类型，但必须能降级）。
fn kind_of(name: &str) -> &'static str {
    let ext = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp" | "svg" => "image",
        "mp4" | "webm" | "mov" | "mkv" | "avi" => "video",
        "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "go" | "java" | "c" | "cpp" | "h" | "json"
        | "toml" | "yaml" | "yml" | "sh" | "ps1" | "sql" | "css" => "code",
        "html" | "htm" => "page",
        _ => "file",
    }
}

/// 扫一个委托的产物目录。**只读**（工作台不写、不改、不删，I7）。
fn scan_artifacts(base: &Path, commission_id: &str) -> Vec<Artifact> {
    let dir = base.join("artifacts").join(commission_id);
    let mut out = Vec::new();
    let Ok(rd) = fs::read_dir(&dir) else {
        return out;
    };
    for e in rd.flatten() {
        let p = e.path();
        let Ok(md) = fs::metadata(&p) else { continue };
        if !md.is_file() {
            continue; // 只认文件、不递归：产物目录的形状要可预测
        }
        let name = e.file_name().to_string_lossy().to_string();
        out.push(Artifact {
            kind: kind_of(&name).to_string(),
            name,
            path: p.to_string_lossy().to_string(),
            bytes: md.len(),
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name)); // 稳定顺序：两次扫描逐字节相同（可断言）
    out
}

fn read_request(base: &Path, commission_id: &str) -> Option<RequestInfo> {
    let v = read_json(&base.join("requests").join(format!("{commission_id}.json")))?;
    Some(RequestInfo {
        what: str_field(&v, "what")?,
        why_only_you: str_field(&v, "whyOnlyYou").unwrap_or_default(),
        at_ms: u64_field(&v, "atMs").unwrap_or(0),
    })
}

/// 扫全部委托。坏 / 缺字段的单条**跳过**，不影响其余（I5）。
fn scan_commissions(base: &Path) -> Vec<Commission> {
    let dir = base.join("commissions");
    let mut out = Vec::new();
    let Ok(rd) = fs::read_dir(&dir) else {
        return out;
    };
    for e in rd.flatten() {
        let p = e.path();
        if p.extension().map(|x| x != "json").unwrap_or(true) {
            continue;
        }
        let Some(v) = read_json(&p) else { continue };
        let Some(id) = str_field(&v, "id") else { continue };
        let Some(text) = str_field(&v, "text") else { continue };
        let status = str_field(&v, "status").unwrap_or_else(|| "doing".to_string());
        let attachments = v
            .get("attachments")
            .and_then(|x| x.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_else(Vec::new);
        let artifacts = scan_artifacts(base, &id);
        let request = if status == "needs-you" {
            read_request(base, &id)
        } else {
            None
        };
        out.push(Commission {
            id,
            text,
            attachments,
            status,
            at_ms: u64_field(&v, "atMs").unwrap_or(0),
            artifacts,
            request,
        });
    }
    out.sort_by(|a, b| b.at_ms.cmp(&a.at_ms)); // 新委托在前：主人的注意力在最上面
    out
}

/// 内容指纹：`(文件数, len+mtime 累加)`。与旧 `bus.rs` 同式 —— 便宜、够用。
/// 覆盖范围必须与 `snapshot()` 的读取源**一致**，否则会漏推送。
fn fingerprint(base: &Path) -> String {
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
    for sub in ["commissions", "requests"] {
        if let Ok(rd) = fs::read_dir(base.join(sub)) {
            for e in rd.flatten() {
                bump(&e.path());
            }
        }
    }
    // 产物按委托展开一层（产物按定义是文件，见 scan_artifacts）
    if let Ok(rd) = fs::read_dir(base.join("artifacts")) {
        for e in rd.flatten() {
            if let Ok(inner) = fs::read_dir(e.path()) {
                for f in inner.flatten() {
                    bump(&f.path());
                }
            }
        }
    }
    format!("{count}:{acc}")
}

pub fn snapshot(base: &Path) -> Snapshot {
    Snapshot {
        data_dir: base.to_string_lossy().to_string(),
        data_ok: base.is_dir(),
        scanned_at_ms: now_ms(),
        commissions: scan_commissions(base),
        fingerprint: fingerprint(base),
    }
}

#[tauri::command]
pub fn list_commissions() -> Snapshot {
    snapshot(&data_dir())
}

/// 写一条委托（应用**唯一**写面）。
/// 形状与 §5.3 一致：工作台创建并写 `{v,id,text,attachments,status,atMs}`；`status` 初值 `doing`，
/// 之后**只由爱丽丝改**（字段级分工：同一文件两个写者，各写各的字段，互不覆盖）。
#[tauri::command]
pub fn submit_commission(text: String, attachments: Option<Vec<String>>) -> Result<String, String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("委托内容为空".to_string());
    }
    let base = data_dir();
    let dir = base.join("commissions");
    fs::create_dir_all(&dir).map_err(|e| format!("建目录失败：{e}"))?;
    let at = now_ms();
    let id = format!("c-{at}-{:06}", std::process::id() % 1_000_000);
    let doc = serde_json::json!({
        "v": 1,
        "id": id,
        "text": text,
        "attachments": attachments.unwrap_or_default(),
        "status": "doing",
        "atMs": at,
    });
    let path = dir.join(format!("{id}.json"));
    let body = serde_json::to_string_pretty(&doc).map_err(|e| format!("序列化失败：{e}"))?;
    fs::write(&path, body).map_err(|e| format!("写委托失败：{e}"))?;
    Ok(id)
}

fn poll_cadence_ms(hidden: bool, focused: bool) -> u64 {
    if hidden {
        POLL_MS_IDLE
    } else if focused {
        POLL_MS
    } else {
        POLL_MS_UNFOCUSED
    }
}

/// 后台轮询：**指纹先行** → 变了才做全量扫 → 推 `commissions-changed`。
///
/// 隐藏（最小化 / 被全屏压住）时**不推送**：前端回前台会自己补一次快照 ⇒ 省掉渲染器唤醒重绘，
/// 却不会看到陈旧界面。回调全程 `catch_unwind` 兜底（§5.24：逃逸异常会杀宿主）。
pub fn start_watch(app: AppHandle) {
    std::thread::spawn(move || {
        let base = data_dir();
        let mut last = String::new();
        loop {
            let (hidden, focused) = match app.get_webview_window("main") {
                Some(w) => (
                    w.is_minimized().unwrap_or(false) || !w.is_visible().unwrap_or(true),
                    w.is_focused().unwrap_or(true),
                ),
                None => (false, true),
            };
            std::thread::sleep(Duration::from_millis(poll_cadence_ms(hidden, focused)));
            // 便宜的前置判据：指纹没变 = 数据面没动 ⇒ 跳过昂贵的全量扫描
            match std::panic::catch_unwind(|| fingerprint(&base)) {
                Ok(fp) if fp == last => continue,
                Ok(_) => { /* 变了：走完整快照 */ }
                Err(_) => {
                    eprintln!("[alice-workbench] fingerprint panicked; continuing");
                    continue;
                }
            }
            match std::panic::catch_unwind(|| snapshot(&base)) {
                Ok(snap) => {
                    if snap.fingerprint != last {
                        last = snap.fingerprint.clone();
                        if !hidden {
                            if let Err(e) = app.emit("commissions-changed", &snap) {
                                eprintln!("[alice-workbench] emit failed: {e}");
                            }
                        }
                    }
                }
                Err(_) => eprintln!("[alice-workbench] snapshot panicked; continuing"),
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(tag: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("aw-wb-{tag}-{}", now_ms()));
        fs::create_dir_all(&p).expect("create tmpdir");
        p
    }

    #[test]
    fn kind_maps_known_extensions_and_falls_back() {
        assert_eq!(kind_of("a.png"), "image");
        assert_eq!(kind_of("b.mp4"), "video");
        assert_eq!(kind_of("c.rs"), "code");
        assert_eq!(kind_of("d.html"), "page");
        assert_eq!(kind_of("e.zzz"), "file", "未知类型必须降级（I4）");
        assert_eq!(kind_of("noext"), "file");
    }

    #[test]
    fn scan_skips_corrupt_and_nameless() {
        let base = tmpdir("skip");
        let dir = base.join("commissions");
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("good.json"),
            r#"{"v":1,"id":"c1","text":"干活","status":"doing","atMs":5}"#,
        )
        .unwrap();
        fs::write(dir.join("bad.json"), "{ not json").unwrap();
        fs::write(dir.join("nameless.json"), r#"{"v":1,"text":"无 id"}"#).unwrap();
        let got = scan_commissions(&base);
        assert_eq!(got.len(), 1, "坏的与缺 id 的都必须跳过，不影响其余");
        assert_eq!(got[0].id, "c1");
        assert_eq!(got[0].status, "doing");
        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn artifacts_are_sorted_and_kind_classified() {
        let base = tmpdir("art");
        let d = base.join("artifacts").join("c1");
        fs::create_dir_all(&d).unwrap();
        fs::write(d.join("z.png"), b"x").unwrap();
        fs::write(d.join("a.txt"), b"yy").unwrap();
        let got = scan_artifacts(&base, "c1");
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].name, "a.txt", "顺序必须稳定（按名），否则两次扫描不一致");
        assert_eq!(got[1].kind, "image");
        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn request_only_read_when_needs_you() {
        let base = tmpdir("req");
        let cd = base.join("commissions");
        let rd = base.join("requests");
        fs::create_dir_all(&cd).unwrap();
        fs::create_dir_all(&rd).unwrap();
        fs::write(
            cd.join("c1.json"),
            r#"{"v":1,"id":"c1","text":"t","status":"doing","atMs":1}"#,
        )
        .unwrap();
        fs::write(
            rd.join("c1.json"),
            r#"{"v":1,"what":"给个 key","whyOnlyYou":"只有你有","atMs":2}"#,
        )
        .unwrap();
        let got = scan_commissions(&base);
        assert!(
            got[0].request.is_none(),
            "status=doing 时不该读请求 —— 它不是状态，是一次打扰（I3）"
        );
        fs::write(
            cd.join("c1.json"),
            r#"{"v":1,"id":"c1","text":"t","status":"needs-you","atMs":1}"#,
        )
        .unwrap();
        let got = scan_commissions(&base);
        let r = got[0].request.as_ref().expect("needs-you 时必须带请求");
        assert_eq!(r.what, "给个 key");
        assert_eq!(r.why_only_you, "只有你有");
        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn missing_dir_is_empty_view_not_error() {
        let base = tmpdir("missing");
        // tmpdir 自己会建目录 ⇒ 要测「根不存在」必须另指一个真不存在的路径
        // （首版这条断言写成 !data_ok 却传了存在的 base，被测试自己抓出来）
        let gone = base.join("does-not-exist");
        let snap = snapshot(&gone);
        assert!(snap.commissions.is_empty());
        assert!(
            !snap.data_ok,
            "根目录不存在 ⇒ data_ok=false，但仍是合法空视图"
        );
        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn fingerprint_changes_when_commission_added() {
        let base = tmpdir("fp");
        fs::create_dir_all(base.join("commissions")).unwrap();
        let a = fingerprint(&base);
        fs::write(
            base.join("commissions").join("c1.json"),
            r#"{"v":1,"id":"c1","text":"t","atMs":1}"#,
        )
        .unwrap();
        let b = fingerprint(&base);
        assert_ne!(a, b, "新增委托必须让指纹变化，否则前端收不到推送");
        fs::remove_dir_all(&base).ok();
    }

    /// 尸体样本来自 2026-09-27 真窗口自审：四个结构体曾缺 `rename_all`，
    /// 单词字段（`id` / `text` / `status`）照常工作，**camelCase 字段静默变 `undefined`**
    /// ⇒ 界面显示「NaN 天前」、`dataOk` 恒假令「数据目录不可用」提示失灵。
    /// 原有 6 条测试全绿却漏掉它：那些测试走的是 `snapshot()` 之后的 Rust 结构体，
    /// 从不检查**发往前端的键名**。本条的检验对象正是那一跳。
    #[test]
    fn ipc_payload_uses_camel_case() {
        let c = Commission {
            id: "c1".into(),
            text: "t".into(),
            attachments: vec![],
            status: "needs-you".into(),
            at_ms: 1_700_000_000_000,
            artifacts: vec![Artifact {
                name: "a.png".into(),
                kind: "image".into(),
                path: "p".into(),
                bytes: 3,
            }],
            request: Some(RequestInfo {
                what: "w".into(),
                why_only_you: "y".into(),
                at_ms: 1,
            }),
        };
        let v = serde_json::to_value(&c).unwrap();
        for k in ["atMs", "artifacts", "attachments", "status", "request"] {
            assert!(
                v.get(k).is_some(),
                "IPC 载荷缺 {k}（前端契约见 src/types.ts）"
            );
        }
        // `request` 是嵌套对象 —— 它的字段也要逐个查（首版把它们写在顶层，测试当场抓住）
        let r = v.get("request").expect("needs-you 必须带 request 对象");
        for k in ["what", "whyOnlyYou", "atMs"] {
            assert!(r.get(k).is_some(), "request 缺 {k}");
        }
        // 反向：snake_case 不得出现 —— 前端读到 undefined 不会报错，只会安静地坏掉
        for k in ["at_ms", "why_only_you"] {
            assert!(v.get(k).is_none(), "IPC 载荷泄漏 snake_case 键 {k}");
            assert!(r.get(k).is_none(), "request 泄漏 snake_case 键 {k}");
        }

        let s = serde_json::to_value(Snapshot {
            data_dir: "d".into(),
            data_ok: true,
            scanned_at_ms: 2,
            commissions: vec![],
            fingerprint: "f".into(),
        })
        .unwrap();
        for k in ["dataDir", "dataOk", "scannedAtMs"] {
            assert!(s.get(k).is_some(), "Snapshot 载荷缺 {k}");
        }
        assert!(
            s.get("data_ok").is_none(),
            "Snapshot 泄漏 snake_case 键 data_ok"
        );
    }
}
