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

export interface Snapshot {
  busDir: string;
  busOk: boolean;
  scannedAtMs: number;
  onlineCount: number;
  nodes: NodeInfo[];
  messages: MessageInfo[];
  actions: ActionEvent[];
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
