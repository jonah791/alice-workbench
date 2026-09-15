import { useMemo, useState } from "react";
import { sendMessage, spawnRefNode } from "../api";
import type { StarMapModel } from "../starmap/layout";
import type { NodeInfo } from "../types";

/** 起步层 —— 稀疏态下的**动作优先**界面（2026-09-15 主人判「没有可用性」的正面回答）。
 *
 *  为什么要有它：总线只剩 1 个活节点时，星图是一颗孤星 + 一片空网格；
 *  而主人打开工作台想问的是「我能做什么」。空态必须回答这个问题。
 *
 *  它不做假按钮：投递走的是**已有的写面**（`send_message` → `mailbox/<node>`，`from=owner`），
 *  与节点详情里的 composer 同一条路。 */

/** 派活输入框：意图（必填）+ 判据（选填）。
 *  `kind="task"` 与 `kind="chat"` 只在语义标签上不同——消费方式由目标节点的适配器决定。 */
export function TaskComposer({
  nodes,
  defaultTargetId,
  onLocal,
  compact = false,
}: {
  nodes: NodeInfo[];
  defaultTargetId: string | null;
  onLocal: (text: string, tone: "info" | "ok" | "warn" | "err") => void;
  compact?: boolean;
}) {
  const online = useMemo(() => nodes.filter((n) => n.online), [nodes]);
  const [target, setTarget] = useState<string>(() => defaultTargetId ?? online[0]?.id ?? "");
  const [intent, setIntent] = useState("");
  const [acceptance, setAcceptance] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const t = intent.trim();
    if (!t || !target) return;
    setSending(true);
    try {
      const acc = acceptance.trim();
      const body = acc ? `【任务】${t}\n判据：${acc}` : `【任务】${t}`;
      const id = await sendMessage(target, body, "task");
      const to = nodes.find((n) => n.id === target)?.displayName ?? target;
      onLocal(`已投递任务 ${id} → ${to}`, "ok");
      setIntent("");
      setAcceptance("");
    } catch (e) {
      onLocal(`投递失败：${String(e)}`, "err");
    } finally {
      setSending(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit();
  };

  const disabled = sending || !intent.trim() || !target;

  return (
    <div className={`act-form ${compact ? "compact" : ""}`}>
      <div className="act-row">
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          title="任务投给谁（写入该节点的 mailbox）"
        >
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.displayName}
              {n.online ? "" : "（离线）"}
            </option>
          ))}
        </select>
        <input
          className="act-intent"
          value={intent}
          placeholder="要它做什么？一句话"
          onChange={(e) => setIntent(e.target.value)}
          onKeyDown={onKey}
        />
      </div>
      <div className="act-row">
        <input
          className="act-acc"
          value={acceptance}
          placeholder="判据：怎么算做完（可留空，由主脑立判据）"
          onChange={(e) => setAcceptance(e.target.value)}
          onKeyDown={onKey}
        />
        <button className="btn primary" disabled={disabled} onClick={() => void submit()}>
          {sending ? "投递中…" : "投递任务"}
        </button>
      </div>
      {!compact && (
        <div className="hint act-hint">
          以 owner 身份写入总线 mailbox（零模型调用）· 由目标节点的适配器消费 · Ctrl+Enter 投递
        </div>
      )}
    </div>
  );
}

/** 稀疏态叠层：现状一句话 + 动作。星图仍在后面可见（不是把主区换掉，是**补一层引导**）。 */
export function Starter({
  model,
  nodes,
  onLocal,
  onShowList,
}: {
  model: StarMapModel;
  nodes: NodeInfo[];
  onLocal: (text: string, tone: "info" | "ok" | "warn" | "err") => void;
  onShowList: () => void;
}) {
  const online = nodes.filter((n) => n.online);
  const core = nodes.find((n) => n.id === model.coreId) ?? online[0] ?? null;
  const { stats } = model;

  /** 起节点：**判据是心跳真的出现**（Rust 侧 `spawn_ref_node` 会等 3 秒核对心跳，
   *  没出现就如实报错——不假装成功）。 */
  const [spawning, setSpawning] = useState(false);
  const spawn = async () => {
    setSpawning(true);
    try {
      const n = await spawnRefNode("参考节点");
      onLocal(`已起节点 ${n.displayName}（${n.nodeId} · pid ${n.pid}）`, "ok");
    } catch (e) {
      onLocal(`起节点失败：${String(e)}`, "err");
    } finally {
      setSpawning(false);
    }
  };

  /** 目标默认给**主脑**：它有派发能力（节点只是执行者），所以「交给主脑」总是有意义的一步。 */
  const targets = useMemo(() => {
    const list = [...nodes].sort((a, b) => Number(b.online) - Number(a.online));
    return list.length > 0 ? list : [];
  }, [nodes]);

  return (
    <div className="starter">
      <div className="starter-card">
        <div className="starter-head">
          <b>工作台还空着</b>
          <span className="dim">
            在线 {stats.online} · 退役 {stats.retired} · 待办 {stats.openTasks}
          </span>
        </div>
        <p className="starter-lead">
          {online.length === 0 ? (
            <>总线里还没有活着的节点——投递的消息会留在 mailbox 里等它上线。</>
          ) : (
            <>
              总线里此刻活着的只有 <b>{online.map((n) => n.displayName).join("、")}</b>
              {stats.retired > 0 ? <>（另有 {stats.retired} 个是历史心跳，不占星位）</> : null}。
              交给它一件事，或者先看看总线里都有什么。
            </>
          )}
        </p>

        {targets.length > 0 && (
          <TaskComposer nodes={targets} defaultTargetId={core?.id ?? null} onLocal={onLocal} />
        )}

        <div className="starter-actions">
          <button
            className="btn primary"
            disabled={spawning}
            onClick={() => void spawn()}
            title="起一个参考节点（ref-node 适配器）：能收任务、逐步执行、回证据；不消耗模型 token"
          >
            {spawning ? "启动中…" : "起一个参考节点"}
          </button>
          <button className="btn" onClick={onShowList} title="名册与任务一句话列表">
            看总线全貌（{stats.total} 个节点
            {stats.retired > 0 ? ` · 含 ${stats.retired} 个退役` : ""}）
          </button>
        </div>
      </div>
    </div>
  );
}
