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
