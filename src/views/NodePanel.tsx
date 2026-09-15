import { useEffect, useState } from "react";
import { sendMessage, spawnedNodes, stopRefNode } from "../api";
import type { ActionEvent, MessageInfo, NodeInfo, SpawnedNode } from "../types";

const hhmmss = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return "--:--:--";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const fmtAge = (ms: number): string => {
  if (!Number.isFinite(ms) || ms > 1e12) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} 秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} 小时前` : `${Math.floor(h / 24)} 天前`;
};

export function NodePanel({
  node,
  actions,
  messages,
  onLocal,
}: {
  node: NodeInfo | null;
  actions: ActionEvent[];
  messages: MessageInfo[];
  onLocal: (text: string, tone: "info" | "ok" | "warn" | "err") => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  /** 这个节点是不是**工作台自己起的**？只有自己起的才给「停止」——
   *  安全边界：工作台绝不停不是自己起的进程（归属账本见 Rust `nodes.rs`）。
   *  自己问而不靠上层透传：面板是唯一需要这个事实的地方。 */
  const [mine, setMine] = useState<SpawnedNode | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [stopping, setStopping] = useState(false);
  const nodeId = node?.id ?? null;
  useEffect(() => {
    if (!nodeId) {
      setMine(null);
      return;
    }
    let alive = true;
    spawnedNodes()
      .then((list) => {
        if (alive) setMine(list.find((s) => s.nodeId === nodeId) ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [nodeId]);

  if (!node) {
    return (
      <section className="panel">
        <header className="panel-head">
          <span>节点详情</span>
        </header>
        <div className="panel-body">
          <div className="empty">从左侧选择一个节点</div>
        </div>
      </section>
    );
  }

  const related = actions
    .filter((a) => a.node === node.id || a.to === node.id || a.id === node.id)
    .slice(-60)
    .reverse();
  const relatedMsgs = messages.filter((m) => m.to === node.id || m.from === node.id).slice(0, 30);

  const doStop = async () => {
    if (!node || !mine) return;
    if (!confirmStop) {
      setConfirmStop(true);
      onLocal("再点一次确认：停止会终止该节点进程并清理它的心跳", "warn");
      window.setTimeout(() => setConfirmStop(false), 5000);
      return;
    }
    setConfirmStop(false);
    setStopping(true);
    try {
      const msg = await stopRefNode(node.id);
      onLocal(msg, "ok");
      setMine(null);
    } catch (e) {
      onLocal(`停止失败：${String(e)}`, "err");
    } finally {
      setStopping(false);
    }
  };

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    try {
      const id = await sendMessage(node.id, t, "chat");
      onLocal(`已投递消息 ${id} → ${node.displayName}`, "ok");
      setText("");
    } catch (e) {
      onLocal(`投递失败：${String(e)}`, "err");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="panel">
      <header className="panel-head">
        <span>节点详情</span>
        <span className="dim">{node.online ? "在线" : "离线"}</span>
      </header>

      <div className="detail-head">
        <h2>
          <span className={`dot ${node.online ? "on" : "off"}`} /> {node.displayName}
        </h2>
        <div className="kv">
          <span>节点 id</span>
          <b>{node.id}</b>
          <span>角色 / harness</span>
          <b>{node.role || "—"} / {node.harness || (node.profile ? `DSH (${node.profile})` : "未上报")}</b>
          <span>心跳</span>
          <b>{fmtAge(node.ageMs)}</b>
          <span>进程 / 端口</span>
          <b>{node.pid ?? "—"} / {node.port ?? "未上报"}</b>
          <span>工作区</span>
          <b>{node.workspace ?? "—"}</b>
        </div>
      </div>

      <div className="panel-body">
        <div className="hint" style={{ marginBottom: 6 }}>
          该节点相关事件（{related.length}）
        </div>
        {related.length === 0 ? (
          <div className="empty">暂无该节点的事件</div>
        ) : (
          <div className="stream">
            {related.map((a, i) => (
              <div key={`${a.atMs}-${a.phase}-${i}`} className="ev">
                <span className="ev-time">{hhmmss(a.atMs)}</span>
                <span className="ev-text">
                  <span className="ph">{a.phase}</span>
                  {a.kind ? ` · ${a.kind}` : ""}
                  {a.chars ? ` · ${a.chars} 字` : ""}
                  {a.why ? ` · ${a.why}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}

        {relatedMsgs.length > 0 && (
          <>
            <div className="hint" style={{ margin: "14px 0 6px" }}>
              往来消息（{relatedMsgs.length}）
            </div>
            {relatedMsgs.map((m) => (
              <div key={m.id} className="ev" style={{ gridTemplateColumns: "62px 1fr" }}>
                <span className="ev-time">{hhmmss(m.createdAt)}</span>
                <span className="ev-text">
                  <span className="ph">{m.from === node.id ? "发出" : "收到"}</span> · {m.kind} · {m.text.slice(0, 120)}
                  {m.text.length > 120 ? "…" : ""}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {mine && (
        <div className="spawned-box">
          <div className="hint">工作台启动的节点 · pid {mine.pid}</div>
          <button
            className={`btn ${confirmStop ? "warn" : ""}`}
            disabled={stopping}
            onClick={() => void doStop()}
            title="终止该节点进程并删除它的心跳文件"
          >
            {stopping ? "停止中…" : confirmStop ? "确认停止？再点一次" : "停止并清理心跳"}
          </button>
          <div className="hint" style={{ marginTop: 6, lineHeight: 1.7 }}>
            Windows 上 Node 收不到 SIGTERM ⇒ 进程不会自己清心跳，**停止由启动方收尸**。
          </div>
        </div>
      )}

      <div className="composer">
        <textarea
          value={text}
          placeholder={`发消息给 ${node.displayName}（写入总线 mailbox，不消耗 token）`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit();
          }}
        />
        <div className="composer-row">
          <button className="btn primary" disabled={sending || !text.trim()} onClick={() => void submit()}>
            {sending ? "投递中…" : "投递（Ctrl+Enter）"}
          </button>
          <span className="hint">以 owner 身份写入 · 由目标节点的适配器决定如何消费</span>
        </div>
      </div>
    </section>
  );
}
