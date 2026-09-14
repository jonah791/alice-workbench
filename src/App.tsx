import { useCallback, useEffect, useState } from "react";
import { busSnapshot, DEMO, dshRecover, dshStatus, onBusChanged } from "./api";
import type { DshStatus, LocalEvent, Snapshot } from "./types";
import { ActionStream } from "./views/ActionStream";
import { Cockpit } from "./views/Cockpit";
import { NodePanel } from "./views/NodePanel";

export function App() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [dsh, setDsh] = useState<DshStatus | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [local, setLocal] = useState<LocalEvent[]>([]);
  const [recovering, setRecovering] = useState(false);
  const [confirmRecover, setConfirmRecover] = useState(false);

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
  const online = snap?.onlineCount ?? 0;
  const node = nodes.find((n) => n.id === selected) ?? null;

  return (
    <div className="app">
      <header className="hud">
        <div className="hud-title">
          爱丽丝工作台<span>多智能体 · 只读总线 · 零模型调用</span>
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
        <Cockpit nodes={nodes} tasks={snap?.tasks ?? []} selected={selected} onSelect={setSelected} />
        <NodePanel node={node} actions={snap?.actions ?? []} messages={snap?.messages ?? []} onLocal={pushLocal} />
        <ActionStream actions={snap?.actions ?? []} local={local} messages={snap?.messages ?? []} />
      </div>
    </div>
  );
}
