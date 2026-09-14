import type { NodeInfo } from "../types";

const ageText = (ms: number): string => {
  if (!Number.isFinite(ms) || ms > 1e12) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
};

export function Cockpit({
  nodes,
  selected,
  onSelect,
}: {
  nodes: NodeInfo[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const online = nodes.filter((n) => n.online);
  const offline = nodes.filter((n) => !n.online);

  return (
    <section className="panel">
      <header className="panel-head">
        <span>节点名册</span>
        <span className="dim">
          {online.length} 在线 / {nodes.length}
        </span>
      </header>
      <div className="panel-body">
        {nodes.length === 0 && <div className="empty">总线暂无心跳</div>}
        {[...online, ...offline].map((n) => (
          <button
            key={n.id}
            className={`node ${n.online ? "on" : "off"} ${selected === n.id ? "sel" : ""}`}
            onClick={() => onSelect(n.id)}
            title={n.id}
          >
            <span className={`dot ${n.online ? "on" : "off"}`} />
            <span className="node-name">{n.displayName}</span>
            <span className="node-meta">
              {(n.role || n.harness || "node") + " · " + (n.online ? ageText(n.ageMs) + " 前" : "离线 " + ageText(n.ageMs))}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
