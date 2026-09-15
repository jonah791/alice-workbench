import type { Pulse } from "../starmap/layout";

/** 脉冲条 —— 行为事件的图形化（`docs/DESIGN.md` §3）。
 *
 *  设计动机：v0.1 把 `cluster-trace` 摊成整栏文字，主人反馈「字太多了」。
 *  现在默认只显示一行**刻度**：相位决定颜色、消息体量决定长度、时间决定位置；
 *  悬停出原文、点击展开完整事件流。**信息没少，只是退到第二层。** */

const clock = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const spanText = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
};

/** 刻度长度：动作按消息体量（chars）缩放，行为事件用固定短棒。 */
const tickH = (p: Pulse): number => {
  if (p.origin === "step") return 9;
  const chars = Number((p as Pulse & { chars?: number }).chars ?? 0);
  if (!Number.isFinite(chars) || chars <= 0) return 12;
  return Math.max(10, Math.min(30, 10 + Math.log10(chars + 1) * 9));
};

export function PulseBar({
  pulses,
  now,
  expanded,
  onToggle,
  children,
}: {
  pulses: Pulse[];
  now: number;
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  const last = pulses.length > 0 ? pulses[pulses.length - 1].atMs : 0;
  const span = last > 0 ? now - pulses[0].atMs : 0;

  return (
    <div className={`pulsebar ${expanded ? "open" : ""}`}>
      {expanded && <div className="pulse-full">{children}</div>}
      <button className="pulse-toggle" onClick={onToggle} title="展开 / 收起完整事件流">
        {expanded ? "▾" : "▴"} 事件流
      </button>
      <div
        className="ticks"
        onClick={onToggle}
        title={pulses.length > 0 ? "刻度 = 行为事件（颜色=相位，长度=消息体量）；点击展开全文" : "暂无行为事件"}
      >
        {pulses.length === 0 && <span className="dim">暂无行为事件——节点干活时会分阶段落盘</span>}
        {pulses.map((p, i) => (
          <i
            key={`${p.origin}-${p.atMs}-${i}`}
            className={`tick t-${p.tone} o-${p.origin}`}
            style={{ height: tickH(p) }}
            title={`${clock(p.atMs)} · ${p.origin === "step" ? "行为" : "总线"} · ${p.text}`}
          />
        ))}
      </div>
      <span className="pulse-meta dim">
        {pulses.length > 0 ? `${pulses.length} 事件 · 跨 ${spanText(span)} · 最近 ${spanText(now - last)} 前` : "—"}
      </span>
    </div>
  );
}
