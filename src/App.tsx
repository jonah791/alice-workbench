import { useCallback, useEffect, useMemo, useState } from "react";
import { busSnapshot, DEMO, dshRecover, dshStatus, onBusChanged } from "./api";
import { buildPulses, buildStarMap, isSparse } from "./starmap/layout";
import type { DshStatus, LocalEvent, Snapshot } from "./types";
import { ActionStream } from "./views/ActionStream";
import { Cockpit } from "./views/Cockpit";
import { DetailPanel } from "./views/DetailPanel";
import { PulseBar } from "./views/PulseBar";
import { StarMap } from "./views/StarMap";
import { Starter } from "./views/Starter";
import "./starmap/starmap.css";
import "./starter.css";

type Sel = { type: "node" | "task"; id: string } | null;

/** 初始视图可以从地址栏给：`#view=list` · `#task=<taskId>` · `#node=<nodeId>`。
 *  用途有二：① 让「某个任务 / 某个节点」可以被**直接指出来**（汇报、告警里贴链接）；
 *  ② 给无头截图验收一条**可复现的状态入口**（点击态没法用 CLI 模拟，链接可以）。 */
const readHash = (): { view: "map" | "list"; sel: Sel } => {
  if (typeof window === "undefined") return { view: "map", sel: null };
  const p = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const task = p.get("task");
  const node = p.get("node");
  return {
    view: p.get("view") === "list" ? "list" : "map",
    sel: task ? { type: "task", id: task } : node ? { type: "node", id: node } : null,
  };
};

/** 星图为主视图（`docs/DESIGN.md` v0.2）；列表视图保留 v0.1 的名册 + 任务板。
 *
 *  视图体系：顶栏 HUD（状态）· 主区（星图 / 列表）· 右侧上下文面板（点谁看谁）·
 *  底部脉冲条（行为图形化，点开才是全文）。**文字退到第二层，信息一条不少。**
 *
 *  v0.3（2026-09-15，主人判「没有可用性」后）：补**动作层**——
 *  ① 稀疏态下主区叠**起步层**（现状一句话 + 派任务），空系统也要回答「我能做什么」；
 *  ② 右侧概览从「只有数字」改为「派一件事 + 现状」动作优先。 */
export function App() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [dsh, setDsh] = useState<DshStatus | null>(null);
  const [sel, setSel] = useState<Sel>(() => readHash().sel);
  const [view, setView] = useState<"map" | "list">(() => readHash().view);
  const [pulseOpen, setPulseOpen] = useState(false);
  const [local, setLocal] = useState<LocalEvent[]>([]);
  const [recovering, setRecovering] = useState(false);
  const [confirmRecover, setConfirmRecover] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const pushLocal = useCallback((text: string, tone: LocalEvent["tone"]) => {
    setLocal((l) => [...l.slice(-99), { atMs: Date.now(), text, tone }]);
  }, []);

  // 总线：首帧快照 + 订阅变化（Rust 侧 150ms 轮询驱动，零模型调用）
  useEffect(() => {
    busSnapshot()
      .then(setSnap)
      .catch((e) => pushLocal(`总线读取失败：${String(e)}`, "err"));
    const un = onBusChanged(setSnap);
    return () => {
      void un.then((f) => f());
    };
  }, [pushLocal]);

  // 兜底轮询：事件通道是「快路」（<1s），但权限被拒、监听丢失、窗口休眠都可能让它静默失效。
  // 低频轮询保证 UI 永远能在数秒内回到真实状态——**两条路都比一条路可靠**（对照 §5.24 兜底纪律）。
  useEffect(() => {
    if (DEMO) return;
    const id = window.setInterval(() => {
      busSnapshot()
        .then(setSnap)
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(id);
  }, []);

  // DSH 运行时状态：纯本地探测（TCP + 文件），10s 一次
  useEffect(() => {
    const tick = () => {
      dshStatus()
        .then(setDsh)
        .catch(() => setDsh(null));
    };
    tick();
    const id = window.setInterval(tick, 10_000);
    return () => window.clearInterval(id);
  }, []);

  // 星图的「忙碌 / 新消息」判据依赖 now（布局本身是确定性的，与 now 无关）：
  // 2s 走一格，够 20s 忙碌窗口用，且不产生任何模型调用。窗口休眠后自动追上真实时间。
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 2000);
    return () => window.clearInterval(id);
  }, []);

  /** 危险动作二次确认（spec §4.3）：一键恢复会调 `<workspace>/.dsh/init-dsh.ps1`，而该脚本
   *  第一步就是清理现有 DSH 进程——等于重启正在承载会话的运行时。故第一次点击只进入确认态
   *  （5 秒内再点一次才执行）：不弹窗、不打断流程，但误点一下不会造成重启。 */
  const recover = async () => {
    if (!confirmRecover) {
      setConfirmRecover(true);
      pushLocal("再点一次确认：恢复会重启 DSH 运行时", "warn");
      window.setTimeout(() => setConfirmRecover(false), 5000);
      return;
    }
    setConfirmRecover(false);
    setRecovering(true);
    pushLocal("请求恢复 DSH（调运行时管理器）", "info");
    try {
      const msg = await dshRecover();
      pushLocal(msg, "ok");
      window.setTimeout(() => {
        dshStatus().then(setDsh).catch(() => undefined);
      }, 2000);
    } catch (e) {
      pushLocal(`恢复失败：${String(e)}`, "err");
    } finally {
      setRecovering(false);
    }
  };

  const nodes = snap?.nodes ?? [];
  const tasks = snap?.tasks ?? [];
  const steps = snap?.steps ?? [];
  const actions = snap?.actions ?? [];
  const messages = snap?.messages ?? [];
  const online = snap?.onlineCount ?? 0;

  const model = useMemo(
    () => buildStarMap({ nodes, tasks, messages, actions, steps, now }),
    [nodes, tasks, messages, actions, steps, now],
  );
  const pulses = useMemo(() => buildPulses(actions, steps, 64), [actions, steps]);
  /** 稀疏态：没有别人在干活、也没有待办 ⇒ 主区叠起步层（判据在 layout.ts，纯函数可单测）。 */
  const sparse = isSparse(model.stats);

  const selNode = sel?.type === "node" ? nodes.find((n) => n.id === sel.id) ?? null : null;
  const selTask = sel?.type === "task" ? tasks.find((t) => t.taskId === sel.id) ?? null : null;

  return (
    <div className="app">
      <header className="hud">
        <div className="hud-title">
          爱丽丝工作台<span>多智能体 · 可派任务 · 零模型调用</span>
        </div>
        <div className="seg">
          <button className={`seg-btn ${view === "map" ? "on" : ""}`} onClick={() => setView("map")} title="星图：看全局面">
            星图
          </button>
          <button
            className={`seg-btn ${view === "list" ? "on" : ""}`}
            onClick={() => setView("list")}
            title="列表：名册 + 任务一句话列表（星图看不清时用）"
          >
            列表
          </button>
        </div>
        <div className="hud-spacer" />
        {DEMO && (
          <div className="hud-stat">
            <span className="dot busy" />
            演示数据 <b>浏览器模式</b>
          </div>
        )}
        <div className="hud-stat">
          <span className={`dot ${dsh?.webOnline ? "on" : "err"}`} />
          DSH <b>{dsh?.webOnline ? `在线 :${dsh.port}` : "未响应"}</b>
        </div>
        <div className="hud-stat">
          <span className={`dot ${online > 0 ? "on" : "off"}`} />
          节点 <b>{online}</b> 在线
        </div>
        <div className="hud-stat">
          <span className={`dot ${snap?.busOk ? "busy" : "err"}`} />
          总线 <b>{snap?.busOk ? "已挂载" : "缺失"}</b>
        </div>
        <button
          className={`btn ${confirmRecover ? "warn" : ""}`}
          disabled={recovering}
          onClick={() => void recover()}
          title="调起 DSH 运行时管理器（会清理并重启 DSH 进程）——因此需要二次确认"
        >
          {recovering ? "恢复中…" : confirmRecover ? "确认恢复？再点一次" : "一键恢复 DSH"}
        </button>
      </header>

      <div className="main">
        <section className="stage">
          {view === "map" ? (
            <>
              <StarMap
                model={model}
                selectedStar={sel?.type === "node" ? sel.id : null}
                selectedTask={sel?.type === "task" ? sel.id : null}
                onPickStar={(id) => setSel({ type: "node", id })}
                onPickTask={(id) => setSel({ type: "task", id })}
                onClear={() => setSel(null)}
              />
              {sparse && (
                <Starter
                  model={model}
                  nodes={nodes}
                  onLocal={pushLocal}
                  onShowList={() => setView("list")}
                />
              )}
            </>
          ) : (
            <Cockpit
              nodes={nodes}
              tasks={tasks}
              steps={steps}
              selected={selNode?.id ?? null}
              onSelect={(id) => setSel({ type: "node", id })}
            />
          )}
        </section>

        <DetailPanel
          sel={sel}
          model={model}
          pulses={pulses}
          node={selNode}
          task={selTask}
          steps={steps}
          actions={actions}
          messages={messages}
          nodes={nodes}
          sparse={sparse}
          onLocal={pushLocal}
          onClear={() => setSel(null)}
        />
      </div>

      <PulseBar pulses={pulses} now={now} expanded={pulseOpen} onToggle={() => setPulseOpen((v) => !v)}>
        <ActionStream actions={actions} local={local} messages={messages} />
      </PulseBar>
    </div>
  );
}
