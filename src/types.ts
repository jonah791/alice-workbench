/** 与 Rust 侧 `commissions.rs` 的 `#[serde(rename_all = "camelCase")]` 一一对应。
 *  改这里必须同步改 Rust 结构体（反之亦然）——两份定义是同一契约的两个视图。
 *
 *  v0.5：这份文件只描述**委托台**的数据面。
 *  总线 / 节点 / 任务台账的类型随「观察与控制台」一起下线了（宪法 ①：内部一律不可见）。 */

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
