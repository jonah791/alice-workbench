import { useState } from "react";
import type { StepEvent, TaskInfo } from "../types";
import { TaskDetail, statusDot, STATUS_LABEL } from "../components/TaskDetail";

/** 任务板（**列表视图**里的形态）：任务一句话列表 + 点开看判据 / 证据 / 裁决 / 执行过程。
 *
 *  星图里任务已变成「卫星」（点卫星 → 右侧上下文面板），本组件保留为**列表视图的回退**：
 *  星图看不清某个任务时，用它按名字找。渲染细节统一在 `TaskDetail`（单一副本，防漂移）。
 *
 *  **诚实边界**：台账只有主脑写（不变量 I8），`status` 最多滞后一个主脑处理周期。 */

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n) + "…" : s);

const ago = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s 前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m 前`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h 前` : `${Math.floor(h / 24)}d 前`;
};

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
              <div style={{ padding: "7px 10px 12px 22px" }}>
                <TaskDetail task={t} steps={steps} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
