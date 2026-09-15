import type { Pulse, StarMapModel } from "../starmap/layout";
import type { ActionEvent, MessageInfo, NodeInfo, StepEvent, TaskInfo } from "../types";
import { TaskDetail } from "../components/TaskDetail";
import { NodePanel } from "./NodePanel";
import { TaskComposer } from "./Starter";

/** 右侧上下文面板 —— 「点谁看谁」（`docs/DESIGN.md` §3 第 3 项）。
 *
 *  文字纪律：**长文本只住在这里**，且必须点选后才出现。三态：
 *    概览（默认）· 任务详情 · 节点详情（复用 `NodePanel`，含发消息入口）。
 *
 *  v0.3（2026-09-15，主人判「没有可用性」后）：
 *  ① 概览改为**动作优先**——先给「派一件事」，再给现状数字；
 *  ② **稀疏态下不再重复表单**：此时动作集中在主区的起步卡（空间大、看得清），
 *     侧栏只留现状与最近行为，避免同一屏两个一模一样的输入框把视线劈成两半。
 *
 *  取消选择：点星图空白处，或点标题栏的 ×。 */

const clock = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** 概览里只显示**短名**：`LAPTOP-XXX-web-0-31116` 这种全 id 会把三行挤成六行（违文字纪律）。 */
const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n) + "…" : s);

export function DetailPanel({
  sel,
  model,
  pulses,
  node,
  task,
  steps,
  actions,
  messages,
  nodes,
  sparse,
  onLocal,
  onClear,
}: {
  sel: { type: "node" | "task"; id: string } | null;
  model: StarMapModel;
  pulses: Pulse[];
  node: NodeInfo | null;
  task: TaskInfo | null;
  steps: StepEvent[];
  actions: ActionEvent[];
  messages: MessageInfo[];
  nodes: NodeInfo[];
  /** 稀疏态：动作交给主区起步卡，这里不再重复一份表单。 */
  sparse: boolean;
  onLocal: (text: string, tone: "info" | "ok" | "warn" | "err") => void;
  onClear: () => void;
}) {
  if (sel?.type === "task" && task) {
    return (
      <section className="panel">
        <header className="panel-head">
          <span>任务详情</span>
          <span className="dim">{task.shortId ?? ""}</span>
          <button className="x" onClick={onClear} title="回到概览">
            ×
          </button>
        </header>
        <div className="panel-body">
          <TaskDetail task={task} steps={steps} />
        </div>
      </section>
    );
  }

  if (sel?.type === "node" && node) {
    return <NodePanel node={node} actions={actions} messages={messages} onLocal={onLocal} />;
  }

  const { stats } = model;
  const recent = [...pulses].slice(-3).reverse();
  const nameOf = (id: string | null): string =>
    (id ? model.stars.find((s) => s.id === id)?.name ?? id : "") as string;

  return (
    <section className="panel">
      <header className="panel-head">
        <span>概览</span>
        <span className="dim">{stats.total} 节点</span>
      </header>
      <div className="panel-body">
        {/* 动作优先：有活在干时，这里就是最顺手的派活入口。
            稀疏态则让位给主区起步卡——**同一屏不出现两份同样的表单**。 */}
        {!sparse && (
          <div className="act-block">
            <div className="hint" style={{ marginBottom: 6 }}>
              派一件事
            </div>
            <TaskComposer nodes={nodes} defaultTargetId={model.coreId} onLocal={onLocal} compact />
          </div>
        )}

        <div className="hint" style={{ margin: sparse ? "0 0 6px" : "14px 0 6px" }}>
          现状
        </div>
        <div className="bigs">
          <div className="big">
            <b>{stats.online}</b>
            <span>在线节点</span>
          </div>
          <div className={`big ${stats.openTasks > 0 ? "am" : ""}`}>
            <b>{stats.openTasks}</b>
            <span>未收尾任务</span>
          </div>
          <div className={`big ${stats.unverified > 0 ? "am" : ""}`}>
            <b>{stats.unverified}</b>
            <span>有未验证项</span>
          </div>
          <div className="big">
            <b>{stats.busy}</b>
            <span>正在干活</span>
          </div>
        </div>

        {recent.length > 0 && (
          <>
            <div className="hint" style={{ margin: "14px 0 6px" }}>
              最近行为
            </div>
            <div className="stream">
              {recent.map((p, i) => (
                <div key={`${p.atMs}-${i}`} className={`ev tone-${p.tone}`}>
                  <span className="ev-time">{clock(p.atMs)}</span>
                  <span className="ev-text">
                    {p.node ? `${nameOf(p.node)} · ` : ""}
                    {clip(p.text, 76)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {stats.retired > 0 && (
          <div className="hint" style={{ marginTop: 12 }}>
            {stats.retired} 个退役节点（离线 &gt; 6h）不占星位——完整名册见<b>列表</b>视图
          </div>
        )}

        <div className="hint" style={{ marginTop: 16, lineHeight: 1.8 }}>
          点<b>星</b>看节点 · 点<b>卫星</b>看任务 · 点空白回到这里
        </div>
      </div>
    </section>
  );
}
