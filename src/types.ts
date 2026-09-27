/** 与 Rust 侧 `bus.rs` / `dsh.rs` 的 `#[serde(rename_all = "camelCase")]` 结构一一对应。
 *  改这里必须同步改 Rust 结构体（反之亦然）——两份定义是同一契约的两个视图。 */

export interface NodeInfo {
  id: string;
  displayName: string;
  online: boolean;
  ageMs: number;
  role?: string | null;
  profile?: string | null;
  harness?: string | null;
  pid?: number | null;
  host?: string | null;
  port?: number | null;
  workspace?: string | null;
  atMs?: number | null;
  startedAt?: number | null;
}

export interface MessageInfo {
  id: string;
  from: string;
  to: string;
  kind: string;
  text: string;
  createdAt: number;
  replyTo?: string | null;
  delivered: boolean;
  holder: string;
}

export interface ActionEvent {
  atMs: number;
  phase: string;
  node?: string | null;
  id?: string | null;
  kind?: string | null;
  to?: string | null;
  why?: string | null;
  chars?: number | null;
  raw: string;
}

/** 任务台账视图（`tasks/<taskId>.json`）。诚实边界：台账由**主脑**写（不变量 I8），
 *  status 最多滞后一个主脑处理周期；实时进度看 `actions`（行为流）。 */
export interface TaskInfo {
  taskId: string;
  shortId?: string | null;
  intentRef: string;
  acceptance: string;
  grade?: string | null;
  status: string;
  assignee?: string | null;
  createdAt: number;
  lastProgressAt: number;
  evidenceCount: number;
  unverifiedCount: number;
  summary?: string | null;
  verdictPass?: boolean | null;
  verdictMethod?: string | null;
}

/** 结构性动作的分阶段事件（`logs/actions/<actionId>.jsonl`）。
 *  这是「节点正在做什么」的数据源——与 `TaskInfo`（账本状态，滞后）互补。
 *  `taskId` 由 Rust 侧从同组任意一行回填，前端可据此「点开任务看它怎么干的」。 */
export interface StepEvent {
  atMs: number;
  actionId: string;
  node?: string | null;
  stage: string;
  step: number;
  total: number;
  humanText: string;
  taskId?: string | null;
}

export interface Snapshot {
  busDir: string;
  busOk: boolean;
  scannedAtMs: number;
  onlineCount: number;
  nodes: NodeInfo[];
  messages: MessageInfo[];
  actions: ActionEvent[];
  tasks: TaskInfo[];
  steps: StepEvent[];
  fingerprint: string;
}

export interface DshStatus {
  webOnline: boolean;
  port: number;
  url: string;
  workspace?: string | null;
  initScript?: string | null;
  initScriptExists: boolean;
  onlineNodes: number;
  detail: string;
}

/** 前端本地事件：应用自己的动作（如"点了一键恢复"）也进入行为流，
 *  与总线事件合并显示——否则主人只看到总线动静，看不到自己触发了什么。 */
export interface LocalEvent {
  atMs: number;
  text: string;
  tone: "info" | "ok" | "warn" | "err";
}

/** 工作台启动过的节点（Rust 侧 sidecar `.workbench-spawned.json` 的视图）。
 *  **归属账本是安全边界的一部分**：只有登记在这里的节点才允许被停止——
 *  工作台绝不停不是自己起的进程（对照 `nodes.rs` 的模块注释）。 */
export interface SpawnedNode {
  nodeId: string;
  displayName: string;
  pid: number;
  atMs: number;
  workdir: string;
}

/* ── v0.5 委托台 ───────────────────────────────────────────────────────
   契约主副本：`docs/semantic.md` §5.3、不变量 §4。与 Rust 侧
   `commissions.rs` 的 `#[serde(rename_all = "camelCase")]` 一一对应 ——
   改这里必须同步改 Rust 结构体（反之亦然）。 */

/** 一件产物。`kind` 决定呈现方式；未知类型一律 `file`
 *  （I4：不预设产物类型，但必须能降级 ——「结果是你能做到的任何事情」）。 */
export interface Artifact {
  name: string;
  kind: "image" | "video" | "code" | "page" | "file";
  path: string;
  bytes: number;
}

/** `⚠ 需要你` 的正文。它是**一次打扰**，不是状态（I3）：
 *  必须说清「做什么」+「为什么只有你能做」，否则界面不该显示它。 */
export interface RequestInfo {
  what: string;
  whyOnlyYou: string;
  atMs: number;
}

/** 一条委托 = 主人的一次最初输入。**全部状态只有三种**（§4，此外没有第四种）：
 *  `doing`（在做 —— 一个点，无进度条）｜`delivered`（已交付 —— 带产物数）｜
 *  `needs-you`（需要你 —— 一条具体请求）。 */
export interface Commission {
  id: string;
  text: string;
  attachments: string[];
  status: "doing" | "delivered" | "needs-you" | string;
  atMs: number;
  /** 产物随委托一起返回：产物不会多到需要分页，前端少一跳。 */
  artifacts: Artifact[];
  /** 仅 `needs-you` 时存在。 */
  request?: RequestInfo | null;
}

/** 数据面快照。**没有节点、没有总线、没有日志** —— 内部一律不可见（宪法 ①）。 */
export interface CommissionSnapshot {
  dataDir: string;
  dataOk: boolean;
  scannedAtMs: number;
  commissions: Commission[];
  fingerprint: string;
}
