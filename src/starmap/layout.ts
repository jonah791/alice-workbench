/** 星图布局 —— 把总线快照折叠成「天体」坐标。
 *
 *  **纯函数**：无 DOM、无随机数、无 `Date.now()`（时间从入参 `now` 进）。
 *  **确定性是硬要求**：同一输入两次调用必须逐字段相同——否则星星每 150ms 跳一次，
 *  主人就失去了「认星」能力（哪颗是哪颗靠位置记忆）。见 `docs/DESIGN.md` §4。
 *
 *  天体语义（全部字段来自总线，不许凭空）：
 *    中央恒星 = 主脑；行星 = 其它节点（内环在线 / 外环离线）；
 *    卫星 = 任务（绕 `assignee` 星）；光弧 = 消息（from → to）。 */

import type { ActionEvent, MessageInfo, NodeInfo, StepEvent, TaskInfo } from "../types";

/** 画布比例贴近实际舞台（宽 ≈ 1.45× 高）：比例差太多时 `meet` 会把星图缩成一角。 */
export const VIEW_W = 1040;
export const VIEW_H = 720;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;
export const R_ONLINE = 200;
export const R_OFFLINE = 305;
const CORE_R = 19;
const STAR_R_ONLINE = 10;
const STAR_R_OFFLINE = 6.5;
const SAT_R = 5;
/** 卫星轨道半径：要够远，别压到宿主星的名字上（截图验收时发现的碰撞）。 */
export const SAT_ORBIT_GAP = 36;
/** 同一环上两颗星的最小角间距（弧度）——避免重叠成"双星"看不清。 */
const MIN_SEP = 0.22;
/** 多久内有行为事件算「忙碌」。 */
export const BUSY_WINDOW_MS = 20_000;
/** 多久内的消息光弧算「新」。 */
export const FRESH_LINK_MS = 8_000;
/** 离线超过这么久 ⇒ 判「退役」：不占星位，聚成一个计数标记。
 *  判据来自真实总线实测（2026-09-15：15 个心跳文件里 14 个是昨天重启留下的墓碑）——
 *  让墓碑占满外环，就把「谁还活着」这个唯一重要的事实淹掉了。 */
export const RETIRE_AFTER_MS = 6 * 3600_000;
const MAX_LINKS = 24;

export type StarState = "core" | "busy" | "online" | "offline" | "fault";
export type SatState = "running" | "done" | "failed" | "idle";

export interface Star {
  id: string;
  name: string;
  role: string;
  /** 极坐标（调试与测试用；渲染只用 x/y）。 */
  angle: number;
  radius: number;
  x: number;
  y: number;
  r: number;
  state: StarState;
  online: boolean;
  ageMs: number;
  /** 挂在这颗星上的任务：总数 / 未收尾 / 失败。 */
  tasks: number;
  open: number;
  failed: number;
  /** 文字纪律：只有中央恒星与**在线**星带名字（离线星不显示）。 */
  label: string | null;
}

export interface Satellite {
  taskId: string;
  short: string;
  /** 宿主星 id（无 assignee 或 assignee 不存在 → 中央恒星）。 */
  ownerId: string;
  angle: number;
  x: number;
  y: number;
  r: number;
  state: SatState;
  /** 有未验证项：画琥珀环——**未验证不许被静默略过**（验收纪律）。 */
  unverified: boolean;
  status: string;
  intent: string;
}

export interface Link {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 二次贝塞尔控制点（画弧用）。 */
  mx: number;
  my: number;
  kind: string;
  fresh: boolean;
}

export interface StarMapStats {
  online: number;
  total: number;
  busy: number;
  openTasks: number;
  failedTasks: number;
  unverified: number;
  /** 退役（离线 > `RETIRE_AFTER_MS`）节点数——它们不占星位，只聚成一个标记。 */
  retired: number;
}

/** 「稀疏态」判据（2026-09-15 主人判「没有可用性」的根因之一）。
 *
 *  总线里**没有别人在干活、也没有待办**时，界面必须教人「怎么开始」，
 *  而不是展示一片空网格——空系统暴露的不是数据问题，是**引导缺失**。
 *  纯函数 ⇒ 可离线单测；阈值只此一处。 */
export function isSparse(stats: StarMapStats): boolean {
  return stats.online <= 2 && stats.openTasks === 0;
}

/** 退役节点聚合标记：不占星位，但**不隐藏**——数量在外，名字在悬停里，全量在列表视图。 */
export interface RetiredMarker {
  count: number;
  x: number;
  y: number;
  r: number;
  names: string[];
}

export interface StarMapModel {
  w: number;
  h: number;
  cx: number;
  cy: number;
  coreId: string | null;
  stars: Star[];
  satellites: Satellite[];
  links: Link[];
  retired: RetiredMarker | null;
  stats: StarMapStats;
}

export interface StarMapInput {
  nodes: NodeInfo[];
  tasks: TaskInfo[];
  messages: MessageInfo[];
  actions: ActionEvent[];
  steps: StepEvent[];
  now: number;
}

/** FNV-1a 32 位 → [0,1)。用它把 id 折成稳定角度：同一个 id 永远同一个角度。 */
export function hashUnit(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

const polar = (cx: number, cy: number, radius: number, angle: number) => ({
  x: cx + radius * Math.cos(angle),
  y: cy + radius * Math.sin(angle),
});

/** 把一批 id 铺到同一环上：角度来自 hash，重叠则按排序逐个推开（仍然确定性）。 */
function spreadAngles(ids: string[]): Map<string, number> {
  const out = new Map<string, number>();
  const ordered = [...ids].sort();
  const rows = ordered
    .map((id) => ({ id, a: hashUnit(id) * Math.PI * 2 }))
    .sort((p, q) => p.a - q.a || (p.id < q.id ? -1 : 1));
  let prev = -Infinity;
  for (const row of rows) {
    const a = row.a < prev + MIN_SEP ? prev + MIN_SEP : row.a;
    out.set(row.id, a);
    prev = a;
  }
  return out;
}

const isOpenStatus = (s: string): boolean => s !== "done" && s !== "failed";
const isFailedStatus = (s: string): boolean => s === "failed" || s === "blocked";

export function buildStarMap(input: StarMapInput): StarMapModel {
  const { nodes, tasks, messages, actions, steps, now } = input;

  // ── 中央恒星：**在线的**主脑优先 ──
  //    不看在线状态的话，中央可能立着一颗死星：真实总线上有 13 个昨天重启留下的
  //    `web-0` 墓碑心跳文件（2026-09-15 实测：15 个文件里只有 1 个活着）。
  const isMain = (n: NodeInfo) => (n.role ?? "").includes("主脑");
  const core =
    nodes.find((n) => isMain(n) && n.online) ??
    nodes.find(isMain) ??
    nodes.find((n) => n.online && n.profile === "web") ??
    nodes[0] ??
    null;

  // ── 忙碌：最近 BUSY_WINDOW_MS 内有行为事件的节点 ──
  const busy = new Set<string>();
  for (const s of steps) if (s.node && now - s.atMs <= BUSY_WINDOW_MS) busy.add(s.node);
  for (const a of actions) if (a.node && now - a.atMs <= BUSY_WINDOW_MS && a.phase !== "startup-poll") busy.add(a.node);

  // ── 任务归属：assignee → 星；找不到则挂中央 ──
  const nodeIds = new Set(nodes.map((n) => n.id));
  const perStar = new Map<string, TaskInfo[]>();
  for (const t of tasks) {
    const owner = t.assignee && nodeIds.has(t.assignee) ? t.assignee : (core?.id ?? "");
    const list = perStar.get(owner) ?? [];
    list.push(t);
    perStar.set(owner, list);
  }

  // 退役分离：离线超过 RETIRE_AFTER_MS 的节点不占星位（见常量处的实测理由）。
  const others = nodes.filter((n) => n.id !== core?.id);
  const retiredNodes = others.filter((n) => !n.online && Number.isFinite(n.ageMs) && n.ageMs >= RETIRE_AFTER_MS);
  const retiredIds = new Set(retiredNodes.map((n) => n.id));
  const live = others.filter((n) => !retiredIds.has(n.id));
  const onlineIds = live.filter((n) => n.online).map((n) => n.id);
  const offlineIds = live.filter((n) => !n.online).map((n) => n.id);
  const angOnline = spreadAngles(onlineIds);
  const angOffline = spreadAngles(offlineIds);

  const stars: Star[] = [];
  if (core) {
    const own = perStar.get(core.id) ?? [];
    stars.push({
      id: core.id,
      name: core.displayName || core.id,
      role: core.role ?? "主脑",
      angle: 0,
      radius: 0,
      x: CX,
      y: CY,
      r: CORE_R,
      state: "core",
      online: core.online,
      ageMs: core.ageMs,
      tasks: own.length,
      open: own.filter((t) => isOpenStatus(t.status)).length,
      failed: own.filter((t) => isFailedStatus(t.status)).length,
      label: core.displayName || core.id,
    });
  }

  for (const n of live) {
    const own = perStar.get(n.id) ?? [];
    const onRing = n.online;
    const angle = (onRing ? angOnline : angOffline).get(n.id) ?? hashUnit(n.id) * Math.PI * 2;
    const radius = onRing ? R_ONLINE : R_OFFLINE;
    const pos = polar(CX, CY, radius, angle);
    const failed = own.filter((t) => isFailedStatus(t.status)).length;
    stars.push({
      id: n.id,
      name: n.displayName || n.id,
      role: n.role ?? n.harness ?? "node",
      angle,
      radius,
      x: pos.x,
      y: pos.y,
      r: onRing ? STAR_R_ONLINE : STAR_R_OFFLINE,
      state: !n.online ? "offline" : failed > 0 ? "fault" : busy.has(n.id) ? "busy" : "online",
      online: n.online,
      ageMs: n.ageMs,
      tasks: own.length,
      open: own.filter((t) => isOpenStatus(t.status)).length,
      failed,
      // 文字纪律：离线星不带名字（避免外环变成文字垃圾场）
      label: n.online ? n.displayName || n.id : null,
    });
  }

  const starById = new Map(stars.map((s) => [s.id, s]));

  // ── 卫星：绕宿主星运行。角度同样由 id 决定（确定性）；同一宿主的卫星也要摊开，
  //    否则两颗任务会叠成一颗（看不见 = 白挂）。
  const satAngles = spreadAngles(tasks.map((t) => t.taskId));
  const satellites: Satellite[] = [];
  for (const t of tasks) {
    const ownerId = t.assignee && starById.has(t.assignee) ? t.assignee : stars[0]?.id ?? "";
    const owner = starById.get(ownerId);
    if (!owner) continue;
    const angle = satAngles.get(t.taskId) ?? hashUnit(t.taskId) * Math.PI * 2;
    const pos = polar(owner.x, owner.y, owner.r + SAT_ORBIT_GAP, angle);
    satellites.push({
      taskId: t.taskId,
      short: t.shortId || t.taskId.slice(-6),
      ownerId,
      angle,
      x: pos.x,
      y: pos.y,
      r: SAT_R,
      state: isFailedStatus(t.status) ? "failed" : t.status === "done" ? "done" : "running",
      unverified: t.unverifiedCount > 0,
      status: t.status,
      intent: t.intentRef || "(无意图摘录)",
    });
  }

  // ── 光弧：消息 from → to（`owner` 解析为中央恒星）。取最新 MAX_LINKS 条。 ──
  const resolve = (name: string | null | undefined): Star | undefined => {
    if (!name) return undefined;
    if (name === "owner") return starById.get(core?.id ?? "");
    return starById.get(name);
  };
  const links: Link[] = [];
  // 封顶按**画出来的弧**算，不按**看过的消息**算：自环、收发双方不在名册的消息
  // 不该白占一个名额——否则一批无效消息会把有效光弧挤出画面（2026-09-15 单测抓到）。
  const recent = [...messages].sort((a, b) => b.createdAt - a.createdAt);
  for (const m of recent) {
    if (links.length >= MAX_LINKS) break;
    const a = resolve(m.from);
    const b = resolve(m.to);
    if (!a || !b || a.id === b.id) continue;
    // 控制点朝圆心拉一点 → 弧线不穿过中央恒星
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const mx = midX + (CX - midX) * 0.14;
    const my = midY + (CY - midY) * 0.14;
    links.push({
      id: m.id,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      mx,
      my,
      kind: m.kind,
      fresh: now - m.createdAt <= FRESH_LINK_MS,
    });
  }

  // ── 退役标记：外环 12 点钟方向放一个虚线环 + 计数（不挤中央、不遮光弧） ──
  const retiredPos = polar(CX, CY, R_OFFLINE, -Math.PI / 2);
  const retired: RetiredMarker | null =
    retiredNodes.length > 0
      ? {
          count: retiredNodes.length,
          x: retiredPos.x,
          y: retiredPos.y,
          r: 13,
          names: retiredNodes.map((n) => n.displayName || n.id),
        }
      : null;

  return {
    w: VIEW_W,
    h: VIEW_H,
    cx: CX,
    cy: CY,
    coreId: core?.id ?? null,
    stars,
    satellites,
    links,
    retired,
    stats: {
      online: nodes.filter((n) => n.online).length,
      total: nodes.length,
      busy: nodes.filter((n) => busy.has(n.id)).length,
      openTasks: tasks.filter((t) => isOpenStatus(t.status)).length,
      failedTasks: tasks.filter((t) => isFailedStatus(t.status)).length,
      unverified: tasks.reduce((acc, t) => acc + (t.unverifiedCount > 0 ? 1 : 0), 0),
      retired: retiredNodes.length,
    },
  };
}

/* ── 脉冲条：行为事件的图形化（一行刻度，不是一列文字） ───────────── */

export interface Pulse {
  atMs: number;
  /** 顶部来源：trace / action / step / local。 */
  origin: "trace" | "action" | "step";
  /** 语义相位（着色用）。 */
  phase: string;
  tone: "info" | "ok" | "warn" | "err";
  node: string | null;
  text: string;
}

const TRACE_TONE: Record<string, Pulse["tone"]> = {
  sent: "info",
  delivered: "ok",
  "no-target": "warn",
  error: "err",
  blocked: "err",
};

/** 合并 `cluster-trace`（actions）与分阶段行为（steps）→ 刻度序列（时间正序）。 */
export function buildPulses(actions: ActionEvent[], steps: StepEvent[], limit = 64): Pulse[] {
  const out: Pulse[] = [];
  for (const a of actions) {
    out.push({
      atMs: a.atMs,
      origin: "action",
      phase: a.phase,
      tone: TRACE_TONE[a.phase] ?? "info",
      node: a.node ?? null,
      text: `${a.phase}${a.to ? ` → ${a.to}` : ""}${a.why ? ` · ${a.why}` : ""}`,
    });
  }
  for (const s of steps) {
    out.push({
      atMs: s.atMs,
      origin: "step",
      phase: s.stage,
      tone: s.stage === "failed" ? "err" : s.stage === "done" ? "ok" : "info",
      node: s.node ?? null,
      text: s.humanText || `${s.stage} ${s.step}/${s.total}`,
    });
  }
  out.sort((a, b) => a.atMs - b.atMs);
  return out.slice(-limit);
}
