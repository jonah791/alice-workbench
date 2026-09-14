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

  const recover = async () => {
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
        <button className="btn warn" disabled={recovering} onClick={() => void recover()}>
          {recovering ? "恢复中…" : "一键恢复 DSH"}
        </button>
      </header>

      <div className="main">
        <Cockpit nodes={nodes} selected={selected} onSelect={setSelected} />
        <NodePanel node={node} actions={snap?.actions ?? []} messages={snap?.messages ?? []} onLocal={pushLocal} />
        <ActionStream actions={snap?.actions ?? []} local={local} messages={snap?.messages ?? []} />
      </div>
    </div>
  );
}
