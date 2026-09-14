import { useState } from "react";
import { sendMessage } from "../api";
import type { ActionEvent, MessageInfo, NodeInfo } from "../types";

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
