import type { Satellite, Star, StarMapModel } from "../starmap/layout";

/** 星图 —— 主视图（`docs/DESIGN.md` §3 §4）。
 *
 *  文字纪律（本次改版的核心诉求）：图内文字只有三类——① 中央恒星名 ② **在线**星短名
 *  ③ 数量徽标。其余一切（判据/证据/事件正文）走 `<title>` 悬停与右侧上下文面板。 */

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n) + "…" : s);

const STATE_WORD: Record<string, string> = {
  core: "主脑",
  busy: "忙碌",
  online: "在线",
  offline: "离线",
  fault: "有失败任务",
};

const starTip = (s: Star): string => {
  const age = Number.isFinite(s.ageMs) ? `${Math.max(0, Math.round(s.ageMs / 1000))}s 前` : "未知";
  return [
    s.name,
    `${s.role} · ${STATE_WORD[s.state] ?? s.state} · 心跳 ${age}`,
    `${s.tasks} 个任务（${s.open} 未收尾${s.failed ? ` · ${s.failed} 失败` : ""}）`,
    "点开看该节点详情",
  ].join("\n");
};

const satTip = (s: Satellite): string =>
  [`${s.intent}`, `状态：${s.status}${s.unverified ? " · 有未验证项" : ""}`, "点开看判据 / 证据 / 执行过程"].join("\n");

export function StarMap({
  model,
  selectedStar,
  selectedTask,
  onPickStar,
  onPickTask,
  onClear,
}: {
  model: StarMapModel;
  selectedStar: string | null;
  selectedTask: string | null;
  onPickStar: (id: string) => void;
  onPickTask: (taskId: string) => void;
  onClear: () => void;
}) {
  const { stars, satellites, links, cx, cy } = model;
  const empty = stars.length === 0;

  return (
    <div className="map-wrap">
      <svg className="starmap" viewBox={`0 0 ${model.w} ${model.h}`} preserveAspectRatio="xMidYMid meet">
        {/* 空白处点击 = 取消选择（回到概览） */}
        <rect className="map-bg" x={0} y={0} width={model.w} height={model.h} onClick={onClear} />

        <g className="orbits">
          <circle cx={cx} cy={cy} r={168} />
          <circle cx={cx} cy={cy} r={268} />
        </g>

        {/* 光弧：消息 from → to（最近 8s 加亮一次） */}
        <g className="links">
          {links.map((l) => (
            <path
              key={l.id}
              className={`link ${l.fresh ? "fresh" : ""}`}
              d={`M${l.x1.toFixed(1)} ${l.y1.toFixed(1)} Q${l.mx.toFixed(1)} ${l.my.toFixed(1)} ${l.x2.toFixed(1)} ${l.y2.toFixed(1)}`}
            />
          ))}
        </g>

        {/* 卫星：任务 */}
        <g className="sats">
          {satellites.map((s) => (
            <g
              key={s.taskId}
              className={`sat st-${s.state} ${selectedTask === s.taskId ? "sel" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onPickTask(s.taskId);
              }}
            >
              <circle className="hit" cx={s.x} cy={s.y} r={12} />
              <circle className="body" cx={s.x} cy={s.y} r={s.r} />
              {s.unverified && <circle className="unverified" cx={s.x} cy={s.y} r={s.r + 3.5} />}
              <title>{satTip(s)}</title>
            </g>
          ))}
        </g>

        {/* 恒星：节点 */}
        <g className="stars">
          {stars.map((st) => (
            <g
              key={st.id}
              className={`star ${st.state} ${selectedStar === st.id ? "sel" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onPickStar(st.id);
              }}
            >
              {st.state === "busy" && <circle className="pulse" cx={st.x} cy={st.y} r={st.r + 8} />}
              <circle className="hit" cx={st.x} cy={st.y} r={18} />
              <circle className="body" cx={st.x} cy={st.y} r={st.r} />
              {st.state === "core" && <circle className="core-ring" cx={st.x} cy={st.y} r={st.r + 7} />}
              {st.tasks > 0 && (
                <text className="badge" x={st.x} y={st.y - st.r - 8}>
                  {st.tasks}
                </text>
              )}
              {st.label && (
                <text className="label" x={st.x} y={st.y + st.r + 18}>
                  {clip(st.label, 16)}
                </text>
              )}
              <title>{starTip(st)}</title>
            </g>
          ))}
        </g>
      </svg>

      {empty && <div className="map-empty">总线暂无心跳——节点上线后这里会亮起</div>}

      <div className="legend" title="天体语义见 docs/DESIGN.md §4">
        <span>
          <i className="k-core" />
          主脑
        </span>
        <span>
          <i className="k-on" />
          在线
        </span>
        <span>
          <i className="k-busy" />
          忙碌
        </span>
        <span>
          <i className="k-off" />
          离线
        </span>
        <span>
          <i className="k-fault" />
          异常
        </span>
        <span>
          <i className="k-sat" />
          任务
        </span>
        <span>
          <i className="k-uv" />
          待验证
        </span>
      </div>
    </div>
  );
}
