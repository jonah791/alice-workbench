/** 委托台主视图 —— v0.5。
 *
 *  结构只有两端：上面是**输入**（主人的唯一动作），下面是**委托列表**与选中委托的**产物**。
 *  中间没有任何东西：没有节点、没有拓扑、没有心跳、没有日志（宪法 ①）。
 *  若有人想在这里加一块「让主人更了解内部」的面板 —— 那是违反宪法的，不加。
 *
 *  保留下来的三件旧经验（都与内部可见性无关，是**能耗与可靠性纪律**）：
 *  ① `useActivity` 活跃度节流（2026-09-15：不看它时它不该烧 CPU）；
 *  ② 兜底轮询（事件通道会静默失效，两条路比一条路可靠）；
 *  ③ 回前台立刻补一次快照（后端在窗口隐藏时**刻意不推**，见 §5.2）。 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEMO, listCommissions, onCommissionsChanged, submitCommission } from "./api";
import type { CommissionSnapshot } from "./types";
import { ArtifactCard } from "./components/ArtifactCard";
import { Commissions } from "./views/Commissions";
import { Composer } from "./views/Composer";

/** 活跃度（**可见 + 有焦点**才算「在用」）：驱动轮询节流与 `body.idle` 装饰暂停。
 *
 *  2026-09-15 主人「电脑操作能不能在后台完成？影响我玩游戏了」——
 *  实测工作台一小时烧 208 CPU 秒（星图持续动画 + 重渲染 + Rust 侧扫描），
 *  主人在全屏游戏里会被拖出微卡顿。**不看它的时候，它不该烧 CPU/GPU。** */
function useActivity(): { active: boolean; visible: boolean } {
  const [state, setState] = useState(() => ({
    active: typeof document !== "undefined" && !document.hidden && document.hasFocus(),
    visible: typeof document !== "undefined" && !document.hidden,
  }));
  useEffect(() => {
    const read = () =>
      setState({ active: !document.hidden && document.hasFocus(), visible: !document.hidden });
    window.addEventListener("visibilitychange", read);
    window.addEventListener("focus", read);
    window.addEventListener("blur", read);
    read();
    return () => {
      window.removeEventListener("visibilitychange", read);
      window.removeEventListener("focus", read);
      window.removeEventListener("blur", read);
    };
  }, []);
  useEffect(() => {
    document.body.classList.toggle("idle", !state.active);
  }, [state.active]);
  return state;
}

export function App() {
  const [snap, setSnap] = useState<CommissionSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listCommissions()
      .then((s) => {
        setSnap(s);
        setErr(null);
      })
      .catch((e) => setErr(String(e)));
  }, []);

  // 首帧快照 + 订阅变化（Rust 侧自适应轮询驱动，零模型调用）
  useEffect(() => {
    refresh();
    const un = onCommissionsChanged(setSnap);
    return () => {
      void un.then((f) => f());
    };
  }, [refresh]);

  const { active, visible } = useActivity();

  // 兜底轮询：事件通道是「快路」，但监听丢失、权限被拒、窗口休眠都可能让它静默失效。
  // 低频轮询保证 UI 永远能回到真实状态 —— **两条路都比一条路可靠**。
  useEffect(() => {
    if (DEMO) return;
    const periodMs = active ? 3000 : visible ? 15_000 : 60_000;
    const id = window.setInterval(refresh, periodMs);
    return () => window.clearInterval(id);
  }, [active, visible, refresh]);

  // 回到前台立刻补一次：后端在隐藏时**刻意不推**（省掉渲染器唤醒重绘），
  // 不能等它下一拍 —— 否则切回来的第一眼是旧数据。
  useEffect(() => {
    if (!active || DEMO) return;
    refresh();
  }, [active, refresh]);

  const items = snap?.commissions ?? [];
  const selected = useMemo(
    () => items.find((c) => c.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );
  const doingCount = useMemo(() => items.filter((c) => c.status === "doing").length, [items]);

  return (
    <div className="app">
      <header className="hud">
        <div className="hud-title">
          爱丽丝工作台<span>交给我一件事</span>
        </div>
        <div className="hud-spacer" />
        {DEMO && (
          <div className="hud-stat">
            <span className="dot busy" />
            演示数据 <b>浏览器模式</b>
          </div>
        )}
        {items.length > 0 && (
          <div className="hud-stat">
            在做 <b>{doingCount}</b>
          </div>
        )}
      </header>

      <Composer
        onSubmit={async (text) => {
          await submitCommission(text);
          refresh();
        }}
      />

      {err && <div className="banner-err">数据面读取失败：{err}</div>}

      <div className="main">
        <section className="stage">
          <Commissions items={items} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
        </section>
        <aside className="detail">
          {selected ? (
            <>
              <div className="detail-head">{selected.text}</div>
              {selected.artifacts.length > 0 ? (
                <div className="artifacts">
                  {selected.artifacts.map((a) => (
                    <ArtifactCard key={a.path} a={a} />
                  ))}
                </div>
              ) : selected.status === "doing" ? (
                <p className="detail-hint">在做 —— 有结果会出现在这里。</p>
              ) : (
                <p className="detail-hint">还没有产物。</p>
              )}
            </>
          ) : (
            <p className="detail-hint">左边选中一条委托，它的产物会显示在这里。</p>
          )}
        </aside>
      </div>
    </div>
  );
}
