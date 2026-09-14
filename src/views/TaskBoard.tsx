import { useState } from "react";
import type { TaskInfo } from "../types";

/** 任务板：任务一句话列表 + 点开看判据/证据/裁决。
 *
 *  **诚实边界**（语义见 dsh-agent-cluster `docs/semantic.md` §5.5 不变量 I8）：
 *  台账只有主脑写，所以这里的 status 最多滞后一个主脑处理周期。这里显示的是
 *  「账本上的状态」，不是「节点正在干什么」——后者在右栏的行为流里。
 *  宁可让主人看到「账本比现实慢一点」，也不假装它是实时的。 */

const STATUS_LABEL: Record<string, string> = {
  drafted: "草拟",
  dispatched: "已派发",
  running: "执行中",
  returned: "已回结果",
  verifying: "验收中",
  pendingVerification: "待验收",
  done: "已完成",
  failed: "失败",
  unknown: "未知",
};

/** 状态色：复用全局 .dot 的 on/off/busy/err 四态 */
const statusDot = (s: string): string => {
  if (s === "done") return "on";
  if (s === "failed") return "err";
  if (s === "running" || s === "verifying") return "busy";
  if (s === "dispatched" || s === "returned") return "on";
  return "off";
};

const ago = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s 前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m 前`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h 前` : `${Math.floor(h / 24)}d 前`;
};

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n) + "…" : s);

export function TaskBoard({ tasks }: { tasks: TaskInfo[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const pending = tasks.filter((t) => t.status !== "done" && t.status !== "failed");
  const overflowed = tasks.filter((t) => t.unverifiedCount > 0);

  return (
    <div style={{ marginTop: 10, borderTop: "1px solid var(--line, #1c2430)", paddingTop: 8 }}>
      <div className="panel-head" style={{ padding: 0, marginBottom: 6 }}>
        <span>任务</span>
        <span className="dim">
          {pending.length} 未收尾 / {tasks.length}
          {overflowed.length > 0 && <span style={{ color: "var(--am)" }}> · {overflowed.length} 有待验证项</span>}
        </span>
      </div>

      {tasks.length === 0 && (
        <div className="empty" style={{ padding: "6px 2px" }}>
          账本为空——主脑派活后这里会出现任务
        </div>
      )}

      {tasks.map((t) => {
        const isOpen = open === t.taskId;
        return (
          <div key={t.taskId}>
            <button
              className={`node ${t.status === "done" ? "off" : "on"} ${isOpen ? "sel" : ""}`}
              onClick={() => setOpen(isOpen ? null : t.taskId)}
              title={t.taskId}
            >
              <span className={`dot ${statusDot(t.status)}`} />
              <span className="node-name">{clip(t.intentRef || "(无意图摘录)", 28)}</span>
              <span className="node-meta">
                {STATUS_LABEL[t.status] ?? t.status} · {t.assignee ?? "?"} · {t.evidenceCount} 证据
                {t.unverifiedCount > 0 && <span style={{ color: "var(--am)" }}> · {t.unverifiedCount} 未验证</span>}
                {" · "}
                {ago(t.lastProgressAt || t.createdAt)}
              </span>
            </button>

            {isOpen && (
              <div style={{ padding: "6px 10px 10px 22px", fontSize: 12, lineHeight: 1.6 }}>
                <div className="dim">判据</div>
                <div>{t.acceptance || "(判据为空——主脑侧工具的 bug，不是节点的)"}</div>
                <div className="dim" style={{ marginTop: 6 }}>
                  裁决 {t.verdictPass === null || t.verdictPass === undefined ? "（未裁决）" : t.verdictPass ? "通过" : "未通过"}
                  {t.verdictMethod ? ` · ${t.verdictMethod}` : ""}
                </div>
                {t.summary && <div style={{ marginTop: 4 }}>结果：{t.summary}</div>}
                <div className="dim" style={{ marginTop: 6, opacity: 0.7 }}>
                  {t.taskId} · {t.grade ?? "—"}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
