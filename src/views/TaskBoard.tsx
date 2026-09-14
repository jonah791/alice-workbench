import { useState } from "react";
import type { StepEvent, TaskInfo } from "../types";

/** 任务板：任务一句话列表 + 点开看「判据 / 证据 / 裁决 / **执行过程**」。
 *
 *  **诚实边界**（语义见 dsh-agent-cluster `docs/semantic.md`）：
 *  - 台账只有主脑写（不变量 I8），所以 `status` 最多滞后一个主脑处理周期；
 *  - 「执行过程」来自 `logs/actions/`（不变量 I10：结构性动作必须分阶段落盘），
 *    它显示节点**在做什么**——**思考不落盘**，所以不假装显示「在想什么」。 */

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

/** 阶段图标：一眼看出「开始了 / 走到哪 / 成了没有」 */
const STAGE_ICON: Record<string, string> = {
  start: "▸",
  stage: "·",
  done: "✓",
  failed: "✕",
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

const clock = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n) + "…" : s);

export function TaskBoard({ tasks, steps }: { tasks: TaskInfo[]; steps: StepEvent[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const pending = tasks.filter((t) => t.status !== "done" && t.status !== "failed");
  const overflowed = tasks.filter((t) => t.unverifiedCount > 0);

  return (
    <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
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
        const mine = steps.filter((s) => s.taskId === t.taskId);
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

                {/* 执行过程：节点在做什么（来自 logs/actions，分阶段落盘） */}
                <div className="dim" style={{ marginTop: 8 }}>
                  执行过程 {mine.length > 0 ? `（${mine.length} 条）` : ""}
                </div>
                {mine.length === 0 && (
                  <div className="dim" style={{ opacity: 0.7 }}>
                    还没有行为事件——节点干活时会分阶段落盘
                  </div>
                )}
                {mine.length > 0 && (
                  <div style={{ fontFamily: "var(--mono)", fontSize: 11, marginTop: 2 }}>
                    {mine.map((s, i) => (
                      <div key={`${s.actionId}-${i}`} style={{ display: "flex", gap: 6 }}>
                        <span style={{ width: 12, opacity: 0.85 }}>{STAGE_ICON[s.stage] ?? "?"}</span>
                        <span style={{ flex: 1 }}>{s.humanText || s.stage}</span>
                        <span className="dim">{clock(s.atMs)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="dim" style={{ marginTop: 8, opacity: 0.7 }}>
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
