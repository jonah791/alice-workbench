import type { ActionEvent, LocalEvent, MessageInfo } from "../types";

const hhmmss = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return "--:--:--";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** 总线 phase → 人话 + 语气（游戏日志的可读性来自「动词在前、对象在后」） */
function phaseText(a: ActionEvent): { text: string; tone: string } {
  const to = a.to ?? a.node ?? "";
  switch (a.phase) {
    case "delivered":
      return { text: `送达 → ${a.id ?? ""}${a.chars ? ` (${a.chars} 字)` : ""}`, tone: "ok" };
    case "sent":
      return { text: `发出 → ${to} · ${a.kind ?? ""}${a.chars ? ` (${a.chars} 字)` : ""}`, tone: "info" };
    case "no-target":
      return { text: `无投递目标 · ${a.id ?? ""}`, tone: "warn" };
    case "deliver-error":
      return { text: `投递失败 · ${a.why ?? a.id ?? ""}`, tone: "err" };
    case "startup-poll":
      return { text: `启动扫描 · 投递 ${a.chars ?? 0} 条`, tone: "" };
    default:
      return { text: `${a.phase}${a.why ? " · " + a.why : ""}`, tone: "" };
  }
}

export function ActionStream({
  actions,
  local,
  messages,
}: {
  actions: ActionEvent[];
  local: LocalEvent[];
  messages: MessageInfo[];
}) {
  type Row = { key: string; atMs: number; html: React.ReactNode; cls: string; fresh: boolean };
  const now = Date.now();
  const rows: Row[] = [];

  for (const a of actions) {
    const { text, tone } = phaseText(a);
    rows.push({
      key: `a-${a.atMs}-${a.phase}-${a.id ?? ""}`,
      atMs: a.atMs,
      html: <><span className="ph">{text}</span>{a.why ? <span> · {a.why}</span> : null}</>,
      cls: tone ? `tone-${tone}` : "",
      fresh: now - a.atMs < 2000,
    });
  }
  for (const m of messages.slice(0, 40)) {
    rows.push({
      key: `m-${m.id}`,
      atMs: m.createdAt,
      html: (
        <>
          <span className="ph">{m.delivered ? "已收" : "待收"}</span> {m.from} → {m.to} · {m.kind}
        </>
      ),
      cls: m.delivered ? "tone-ok" : "tone-warn",
      fresh: false,
    });
  }
  for (const l of local) {
    rows.push({
      key: `l-${l.atMs}-${l.tone}`,
      atMs: l.atMs,
      html: <><span className="ph">本机</span> {l.text}</>,
      cls: `tone-${l.tone}`,
      fresh: now - l.atMs < 2000,
    });
  }

  rows.sort((x, y) => y.atMs - x.atMs);

  return (
    <section className="panel">
      <header className="panel-head">
        <span>实时行为流</span>
        <span className="dim">{rows.length}</span>
      </header>
      <div className="panel-body stream">
        {rows.length === 0 && <div className="empty">暂无行为事件</div>}
        {rows.map((r) => (
          <div key={r.key} className={`ev ${r.cls} ${r.fresh ? "fresh" : ""}`}>
            <span className="ev-time">{hhmmss(r.atMs)}</span>
            <span className="ev-text">{r.html}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
