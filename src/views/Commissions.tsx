/** 委托列表 —— 主人的注意力落点，也是**三种标记的唯一渲染处**。
 *
 *  这里刻意没有第四种状态、没有进度条、没有百分比：§4 定了「委托的全部状态只有三种」，
 *  多一种就等于把内部过程泄漏给主人（宪法 ①）。
 *
 *  `⚠ 需要你` 是**一次打扰**而不是状态：它必须自带「做什么 + 为什么只有你能做」。
 *  后端对缺 `what` 的请求直接返回 None（宁可不说），这里也就不会渲染半截请求。 */

import type { Commission } from "../types";

const MARK: Record<string, { ch: string; cls: string; label: string }> = {
  doing: { ch: "·", cls: "mark-doing", label: "在做" },
  delivered: { ch: "✓", cls: "mark-delivered", label: "已交付" },
  "needs-you": { ch: "⚠", cls: "mark-needs", label: "需要你" },
};

/** 时间：人话相对量。「刚刚」比 `09:12:03` 好读，也不暴露时区口径。 */
export function humanAgo(atMs: number, now = Date.now()): string {
  const d = Math.max(0, now - atMs);
  if (d < 60_000) return "刚刚";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} 分钟前`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} 小时前`;
  return `${Math.floor(d / 86_400_000)} 天前`;
}

export function Commissions({
  items,
  selectedId,
  onSelect,
}: {
  items: Commission[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="empty">
        <p>还没有委托。</p>
        <p className="empty-hint">在上面写一句要我做的东西就行 —— 一句话就够。</p>
      </div>
    );
  }
  return (
    <ul className="commissions">
      {items.map((c) => {
        const m = MARK[c.status] ?? MARK.doing;
        return (
          <li
            key={c.id}
            className={`commission ${selectedId === c.id ? "is-selected" : ""}`}
            onClick={() => onSelect(c.id)}
          >
            <div className="commission-row">
              <span className={`mark ${m.cls}`} title={m.label}>
                {m.ch}
              </span>
              <span className="commission-text" title={c.text}>
                {c.text}
              </span>
              <span className="commission-when">{humanAgo(c.atMs)}</span>
            </div>
            {c.status === "delivered" && c.artifacts.length > 0 && (
              <div className="commission-sub">{c.artifacts.length} 件产物</div>
            )}
            {c.status === "needs-you" && c.request && (
              <div className="commission-needs">
                <div className="needs-what">{c.request.what}</div>
                <div className="needs-why">为什么只有你：{c.request.whyOnlyYou}</div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
