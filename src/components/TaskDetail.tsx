import type { StepEvent, TaskInfo } from "../types";

/** 任务详情（判据 / 裁决 / 结果 / 执行过程）——**单一副本**。
 *
 *  被两处复用：右侧上下文面板（星图里点卫星）与列表视图的任务板。
 *  抽成一个组件的理由：两份渲染必然漂移（对照 `docs/semantics/README.md` §4.1 的教训——
 *  「同一事实的两套表述 = 两个真相」）。
 *
 *  **诚实边界**：台账只有主脑写（不变量 I8），`status` 最多滞后一个主脑处理周期；
 *  「执行过程」来自 `logs/actions/`（不变量 I10），它显示节点**在做什么**——
 *  **思考不落盘**，所以不假装显示「在想什么」。 */

export const STATUS_LABEL: Record<string, string> = {
  drafted: "草拟",
  dispatched: "已派发",
  running: "执行中",
  returned: "已回结果",
  verifying: "验收中",
  pendingVerification: "待验收",
  done: "已完成",
  failed: "失败",
  blocked: "受阻",
  unknown: "未知",
};

/** 状态色：复用全局 .dot 的四态 */
export const statusDot = (s: string): string => {
  if (s === "done") return "on";
  if (s === "failed" || s === "blocked") return "err";
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

const clock = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
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

export function TaskDetail({ task, steps }: { task: TaskInfo; steps: StepEvent[] }) {
  const mine = steps.filter((s) => s.taskId === task.taskId);
  return (
    <div className="task-detail">
      <div className="dim">状态</div>
      <div>
        <span className={`dot ${statusDot(task.status)}`} /> {STATUS_LABEL[task.status] ?? task.status}
        {task.assignee ? ` · ${task.assignee}` : " · 未派发"} · {task.evidenceCount} 证据
        {task.unverifiedCount > 0 && <span style={{ color: "var(--am)" }}> · {task.unverifiedCount} 未验证</span>}
        {" · "}
        {ago(task.lastProgressAt || task.createdAt)}
      </div>

      <div className="dim" style={{ marginTop: 8 }}>
        判据
      </div>
      <div>{task.acceptance || "(判据为空——主脑侧工具的 bug，不是节点的)"}</div>

      <div className="dim" style={{ marginTop: 8 }}>
        裁决{" "}
        {task.verdictPass === null || task.verdictPass === undefined ? "（未裁决）" : task.verdictPass ? "通过" : "未通过"}
        {task.verdictMethod ? ` · ${task.verdictMethod}` : ""}
      </div>
      {task.summary && <div style={{ marginTop: 4 }}>结果：{task.summary}</div>}

      <div className="dim" style={{ marginTop: 10 }}>
        执行过程 {mine.length > 0 ? `（${mine.length} 条）` : ""}
      </div>
      {mine.length === 0 && <div className="dim">还没有行为事件——节点干活时会分阶段落盘</div>}
      {mine.length > 0 && (
        <div className="steps">
          {mine.map((s, i) => (
            <div key={`${s.actionId}-${i}`} className="step">
              <span className="ic">{STAGE_ICON[s.stage] ?? "?"}</span>
              <span className="tx">{s.humanText || s.stage}</span>
              <span className="tm dim">{clock(s.atMs)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="dim" style={{ marginTop: 10, opacity: 0.7, fontFamily: "var(--mono)", fontSize: 11 }}>
        {task.taskId} · {task.grade ?? "—"}
      </div>
    </div>
  );
}
